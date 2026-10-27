package lab.palailab.coo.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * 实时看屏幕。
 *
 * 无障碍的 takeScreenshot 是"按一下拍一张"，每次都要等系统合成，实测 1.9 张/秒 —— 看她
 * 自己头顶的气泡变化够用，看视频、看游戏就完全跟不上了。
 *
 * 这里换成 MediaProjection：授权一次之后，系统把屏幕画面持续投到一个虚拟显示器上，
 * 我们以每秒 8 帧的速度抓成 **RGBA 字节**（不是 Bitmap：proot 里的引擎本来就吃 RGBA，
 * 存字节等于省掉两趟转换）。之后不管是她自己要看，还是面板里预览，拿的都是最近一帧
 * （几毫秒），而不是重新拍一张。
 *
 * **长跑设计（能开一小时不涨内存）**：
 * 帧缓冲是三块**轮转复用**的字节数组，每块前面留 8 字节放宽高头（和 `/screen?raw=1`
 * 完全同格式）。写的一块、最新的一块、被读的一块互不重叠，所以稳态下**每帧零分配** ——
 * 不再是每帧 new 一个 6.8MB 的数组（那样 8 帧/秒就是 54MB/s 垃圾，一小时 190GB，
 * GC 会把 CPU 和电池吃光）。JPEG 那张 Bitmap 也复用。
 *
 * 帧只在内存里、只在 127.0.0.1 上给本机进程读，不落盘、不上传。
 */
object ScreenStream {
    /** 每块缓冲前面的宽高头（小端 uint32 宽、高）。 */
    private const val HDR = 8

    /** 三块轮转：写一块、最新一块、可能正被读的一块，互不打架。 */
    private const val RING = 3

    private val ring = arrayOfNulls<ByteArray>(RING)

    /** 下一次往哪块写。 */
    private var writeIdx = 0

    /** 哪一块是最新帧（-1 = 还没有）。 */
    @Volatile
    private var readIdx = -1

    @Volatile
    private var fw = 0

    @Volatile
    private var fh = 0

    @Volatile
    private var frameAt = 0L

    @Volatile
    private var startedAt = 0L

    @Volatile
    var frames = 0L
        private set

    /** 最近 2 秒内到帧的时间戳，用来算真实帧率。 */
    private val marks = ArrayDeque<Long>()

    /**
     * 投屏会话是不是活着。
     *
     * 不要用"最近有帧"来判断：屏幕静止时系统本来就不推新帧（VirtualDisplay 是变了才推），
     * 静止两分钟没新帧不等于流死了 —— 那一帧就是当前画面。所以看 started 标志，
     * 帧新鲜度另外用 ageMs() 表示。
     */
    @Volatile
    private var started = false

    val running: Boolean
        get() = started && readIdx >= 0

    /**
     * 拿一块能写的缓冲，尺寸含 8 字节头，头已经填好宽高。
     *
     * 尺寸变了（换屏幕方向）会自动重建，平时不会 —— 这就是零分配的关键。
     */
    fun writeTarget(w: Int, h: Int): ByteArray {
        val need = HDR + w * h * 4
        var b = ring[writeIdx]
        if (b == null || b.size != need) {
            b = ByteArray(need)
            ring[writeIdx] = b
        }
        b[0] = (w and 0xFF).toByte()
        b[1] = ((w shr 8) and 0xFF).toByte()
        b[2] = ((w shr 16) and 0xFF).toByte()
        b[3] = ((w shr 24) and 0xFF).toByte()
        b[4] = (h and 0xFF).toByte()
        b[5] = ((h shr 8) and 0xFF).toByte()
        b[6] = ((h shr 16) and 0xFF).toByte()
        b[7] = ((h shr 24) and 0xFF).toByte()
        return b
    }

    /** 写完了：这一块变成最新帧，下一块准备着。 */
    fun publish(w: Int, h: Int) {
        readIdx = writeIdx
        writeIdx = (writeIdx + 1) % RING
        fw = w
        fh = h
        val now = SystemClock.elapsedRealtime()
        frameAt = now
        frames++
        synchronized(marks) {
            marks.addLast(now)
            val cut = now - 2000
            while (marks.isNotEmpty() && marks.first() < cut) marks.removeFirst()
        }
    }

    /** 投屏会话建立后由服务调它。 */
    fun begin() {
        started = true
        startedAt = SystemClock.elapsedRealtime()
    }

    /** 投屏结束：清掉缓存帧，别让 /screen 一直回一张过期的图。 */
    fun reset() {
        started = false
        startedAt = 0L
        readIdx = -1
        fw = 0
        fh = 0
        frameAt = 0L
        synchronized(marks) { marks.clear() }
    }

    fun ageMs(): Long = if (frameAt == 0L) -1 else SystemClock.elapsedRealtime() - frameAt

    /** 这次投屏开了多久（毫秒）。 */
    fun upMs(): Long = if (startedAt == 0L) 0 else SystemClock.elapsedRealtime() - startedAt

    /** 真实帧率：按最近 2 秒到帧数算。 */
    fun fps(): Double {
        val n: Int
        val span: Long
        synchronized(marks) {
            n = marks.size
            if (n < 2) return 0.0
            span = marks.last() - marks.first()
        }
        return if (span <= 0) 0.0 else (n - 1) * 1000.0 / span
    }

    /**
     * 原始 RGBA，带 8 字节小端宽高头 —— 和无障碍的 `/screen?raw=1` 完全同格式，
     * 所以 proot 里的引擎两条路可以互换。
     *
     * 直接给环形缓冲里那一块（不拷贝）。三块轮转下，这一块要 375ms 后才会被覆盖，
     * 而一次 HTTP 写回远快于这个间隔。
     */
    fun rgba(): ByteArray? {
        val i = readIdx
        if (i < 0) return null
        return ring[i]
    }

    /** JPEG 用的那张 Bitmap 也复用，省掉每次请求一次 6.8MB 分配。 */
    private val bmpLock = Any()

    private var bmp: Bitmap? = null

    /** 取一帧 JPEG：maxWidth 是宽上限（0 = 原样），q 是质量。 */
    fun jpeg(maxWidth: Int = 1280, q: Int = 75): ByteArray? {
        val px = rgba() ?: return null
        val w = fw
        val h = fh
        if (w <= 0 || h <= 0) return null
        synchronized(bmpLock) {
            var src = bmp
            if (src == null || src.width != w || src.height != h || src.isRecycled) {
                src = runCatching { Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888) }.getOrNull() ?: return null
                bmp = src
            }
            runCatching { src.copyPixelsFromBuffer(ByteBuffer.wrap(px, HDR, w * h * 4)) }.getOrNull() ?: return null
            val scaled = if (maxWidth > 0 && w > maxWidth) {
                val th = (h.toLong() * maxWidth / w).toInt().coerceAtLeast(1)
                runCatching { Bitmap.createScaledBitmap(src, maxWidth, th, true) }.getOrNull() ?: src
            } else src
            val out = runCatching {
                ByteArrayOutputStream(256 * 1024).use { bos ->
                    if (!scaled.compress(Bitmap.CompressFormat.JPEG, q.coerceIn(20, 100), bos)) null
                    else bos.toByteArray()
                }
            }.getOrNull()
            if (scaled !== src) runCatching { scaled.recycle() }
            return out
        }
    }

    fun statusJson(): String = JSONObject().apply {
        put("running", running)
        put("frames", frames)
        put("fps", Math.round(fps() * 10) / 10.0)
        put("ageMs", ageMs())
        put("upMs", upMs())
        if (fw > 0) {
            put("width", fw)
            put("height", fh)
        }
    }.toString()

    fun clear() {
        reset()
        frames = 0
        for (i in 0 until RING) ring[i] = null
        runCatching { bmp?.recycle() }
        bmp = null
    }
}

/**
 * MediaProjection 的宿主。targetSdk 34 起必须挂在 type=mediaProjection 的前台服务上，
 * 否则 createVirtualDisplay 直接抛 SecurityException。
 */
class ScreenStreamService : Service() {
    private var projection: MediaProjection? = null
    private var vd: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    private var h: Handler? = null
    private var lastAccepted = 0L
    /** 行尾有填充时用的中转行，复用，别每帧新建。 */
    private var rowBuf: ByteArray? = null

    override fun onCreate() {
        super.onCreate()
        thread = HandlerThread("coo-screen").also { it.start() }
        h = Handler(thread!!.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
            intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent?.getParcelableExtra(EXTRA_DATA)
        }
        if (code == 0 || data == null) {
            Log.w(LOG_TAG, "没有授权结果，直接收工")
            stopSelf()
            return START_NOT_STICKY
        }
        foreground()
        startStream(code, data)
        return START_NOT_STICKY
    }

    private fun foreground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(
                NotificationChannel(CH, "实时看屏幕", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val n = Notification.Builder(this, CH)
            .setContentTitle("Coopanion 正在看着屏幕")
            .setContentText("画面只留在本机内存里，不落盘")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NID, n)
        }
    }

    /**
     * 会话被系统收回时留一条能点的通知。
     *
     * 这里没法自动重连：Android 14 起 MediaProjection 每次会话都得用户重新同意一次。
     * 我们能做的是提醒他点回来 —— 一回到 app，onResume 会自动把授权框再弹出来。
     */
    private fun notifyLost() {
        val nm = getSystemService(NotificationManager::class.java)
        val pi = PendingIntent.getActivity(
            this, 1, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(this, CH)
            .setContentTitle("看屏幕断了")
            .setContentText("屏幕关掉会让投屏失效。点这里回到 Coo，点一下「共享屏幕」就恢复")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        runCatching { nm.notify(NID + 1, n) }
    }

    private fun startStream(code: Int, data: Intent) {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val p = runCatching { mpm.getMediaProjection(code, data) }.getOrNull()
        if (p == null) {
            Log.w(LOG_TAG, "拿不到投影（授权可能已失效）")
            stopSelf()
            return
        }
        projection = p
        p.registerCallback(
            object : MediaProjection.Callback() {
                override fun onStop() {
                    Log.i(LOG_TAG, "投屏会话被收回（多半是屏幕关了，Android 14 起屏幕不可见就停）")
                    ScreenStream.reset()
                    notifyLost()
                    stopSelf()
                }
            },
            h,
        )

        val dm = resources.displayMetrics
        // 半分辨率：3200×2136 的平板出 1600×1068，一帧 6.8MB。缓冲是复用的，所以这 20MB
        // 是常驻而不是每秒产生 55MB 垃圾。
        val w = (dm.widthPixels / 2).coerceAtLeast(320)
        val hh = (dm.heightPixels / 2).coerceAtLeast(240)
        val r = ImageReader.newInstance(w, hh, PixelFormat.RGBA_8888, 3)
        reader = r
        r.setOnImageAvailableListener({ ir -> drain(ir) }, h)
        vd = p.createVirtualDisplay(
            "coo-live", w, hh, dm.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            r.surface, null, h,
        )
        Log.i(LOG_TAG, "实时流已开：${w}×$hh，目标 8 帧/秒，缓冲 3×${(HDR + w * hh * 4) / 1048576}MB 复用")
        ScreenStream.begin()
        h?.postDelayed(beat, BEAT_MS)
    }

    /**
     * 心跳：一分钟报一次帧数/帧率/堆用量。
     *
     * 长跑排查全靠它 —— 内存涨没涨、帧还在不在来、GC 有没有失控，看这一行就知道。
     * 只打日志、不做事，出问题不会自己瞎重启（投屏重连必须重新授权，自动重连做不到）。
     */
    private val beat = object : Runnable {
        override fun run() {
            if (!ScreenStream.running) return
            val rt = Runtime.getRuntime()
            val up = ScreenStream.upMs() / 1000
            Log.i(
                LOG_TAG,
                "心跳 ${up}s：${ScreenStream.frames} 帧，${Math.round(ScreenStream.fps() * 10) / 10.0} 帧/秒，" +
                    "帧龄 ${ScreenStream.ageMs()}ms，堆 ${(rt.totalMemory() - rt.freeMemory()) / 1048576}MB / 上限 ${rt.maxMemory() / 1048576}MB",
            )
            h?.postDelayed(this, BEAT_MS)
        }
    }

    private fun drain(ir: ImageReader) {
        val image = runCatching { ir.acquireLatestImage() }.getOrNull() ?: return
        try {
            val now = SystemClock.elapsedRealtime()
            if (now - lastAccepted < MIN_GAP_MS) return
            lastAccepted = now
            val plane = image.planes[0]
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val w = image.width
            val hh = image.height
            val buf = plane.buffer
            val rowBytes = w * pixelStride
            // 直接写进轮转缓冲（头 8 字节已经有宽高），不再每帧 new 一个几 MB 的数组
            val out = ScreenStream.writeTarget(w, hh)
            if (rowStride == rowBytes) {
                buf.get(out, HDR, minOf(out.size - HDR, buf.remaining()))
            } else {
                // 行尾有填充：一行一行搬，把填充丢掉
                val row = rowBuf?.takeIf { it.size >= rowStride } ?: ByteArray(rowStride).also { rowBuf = it }
                for (y in 0 until hh) {
                    buf.position(y * rowStride)
                    val n = minOf(rowStride, buf.remaining())
                    if (n <= 0) break
                    buf.get(row, 0, n)
                    System.arraycopy(row, 0, out, HDR + y * rowBytes, minOf(rowBytes, n))
                }
            }
            ScreenStream.publish(w, hh)
        } catch (t: Throwable) {
            Log.w(LOG_TAG, "取帧失败：${t.message}")
        } finally {
            runCatching { image.close() }
        }
    }

    override fun onDestroy() {
        h?.removeCallbacksAndMessages(null)
        runCatching { vd?.release() }
        runCatching { reader?.close() }
        runCatching { projection?.stop() }
        vd = null
        reader = null
        projection = null
        rowBuf = null
        ScreenStream.clear()
        thread?.quitSafely()
        thread = null
        h = null
        Log.i(LOG_TAG, "实时流已停，共 ${ScreenStream.frames} 帧")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        /** 日志标签。 */
        private const val LOG_TAG = "CooScreenSvc"

        private const val NID = 0x0C00
        private const val CH = "coo_screen_stream"
        private const val EXTRA_CODE = "code"
        private const val EXTRA_DATA = "data"
        private const val ACTION_STOP = "lab.palailab.coo.mobile.STOP_SCREEN"

        /** 和 ScreenStream 环形缓冲一致的宽高头长度。 */
        private const val HDR = 8

        /** 8 帧/秒：看着像在动，又不至于把电池和内存拖垮。 */
        private const val MIN_GAP_MS = 125L

        /** 心跳间隔。 */
        private const val BEAT_MS = 60_000L

        /** 面板/桥调它开流：resultCode + data 来自系统授权弹窗。 */
        fun start(c: Context, code: Int, data: Intent) {
            val i = Intent(c, ScreenStreamService::class.java)
                .putExtra(EXTRA_CODE, code)
                .putExtra(EXTRA_DATA, data)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }

        fun stop(c: Context) {
            c.startService(Intent(c, ScreenStreamService::class.java).setAction(ACTION_STOP))
        }
    }
}