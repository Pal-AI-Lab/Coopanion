package lab.palailab.coo.mobile

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * 悬浮窗桌宠：把 Coopanion 的 /pet 页放进一个透明、贴底、可穿透的悬浮窗，
 * 让她站在手机/平板桌面（或任何 App）的底部边缘，和 PC 版一样的"桌宠"形态。
 *
 * 页面来自本机核心（127.0.0.1:7797，或 PC 模式经本地反代），所以是同一个 Coo、同一份记忆。
 *
 * ## 两个窗口：一个只画，一个只接
 *
 * 只用一个窗口是做不到"只有她的身体挡操作"的：悬浮窗（TYPE_APPLICATION_OVERLAY）的触摸
 * 在系统里是**整块矩形**，而 `WindowManager.LayoutParams.touchableRegion` 在 MIUI/HyperOS
 * 的 framework 里已经被整个移除了（反射拿不到字段，NoSuchFieldException）。
 *
 * 所以拆成两层：
 *
 *  - **显示窗**：WebView，全宽、贴底，永远 `FLAG_NOT_TOUCHABLE` —— 它一个像素都不吃点击，
 *    屏幕该怎么用怎么用。
 *  - **触摸窗**：一个透明的 View，只有她身体那么大，跟着她走。它收到的每个 MotionEvent
 *    原样投递给 WebView（`dispatchTouchEvent`，坐标按两个窗口的屏幕位置换算），
 *    所以她照样能被戳、被拎起来扔出去、被按住说话。
 *
 * 她身体的位置由页面每几帧报一次（[Bridge.setHitArea]，`body.layout.box` + 气泡/菜单的矩形）。
 */
class OverlayPetService : Service() {

    private lateinit var wm: WindowManager
    private var web: WebView? = null
    private var webParams: WindowManager.LayoutParams? = null
    /** 透明的触摸层：她身体那一小块。 */
    private var catcher: View? = null
    private var catcherParams: WindowManager.LayoutParams? = null

    /** 是否让她接住点击（true）还是完全穿透（false）。默认接住，方便戳她。 */
    private var touchable = true

    /** 上一次写给触摸层的区域，没变化就不再 updateViewLayout。 */
    private var lastRegion = ""
    /** 页面报上来的、还没消费的触摸区 JSON（JavaBridge 线程写，主线程读）。 */
    @Volatile
    private var pendingHit: String? = null

    override fun onCreate() {
        super.onCreate()
        // 悬浮窗是独立进程：系统语音也要在这里建一份（同一个单例，进程内共享）
        runCatching { CooTts.init(this) }
        // 悬浮窗是独立进程：这里也要开远程调试，否则 adb forward 过去没有 target。
        WebView.setWebContentsDebuggingEnabled(true)
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        startForeground(NOTIF_ID, notification())
        val host = Prefs.pcHost(this)
        if (!Prefs.localMode(this) && host.isBlank()) {
            stopSelf()
            return
        }
        Prefs.setOverlay(this, true)
        // 本机模式：核心在平板上，直连 7797，不需要反代
        if (!Prefs.localMode(this)) ProxyHub.acquire(host, HOLDER)
        live = this
        showOverlay()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE_TOUCH -> {
                touchable = !touchable
                lastRegion = ""
                applyCatcherFlags()
                pendingHit?.let { web?.post { applyHitArea() } }
                startForeground(NOTIF_ID, notification())
            }
            ACTION_REFRESH_RANGE -> pushRange()
        }
        return START_STICKY
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 全屏窗口随屏幕尺寸走（MATCH_PARENT 会自动跟），这里只要把活动范围/大小重新推一次
        pushRange()
    }

    private fun applyCatcherFlags() {
        val cp = catcherParams ?: return
        cp.flags = catcherFlags(active = touchable)
        runCatching { wm.updateViewLayout(catcher, cp) }
            .onFailure { Log.w(TAG, "触摸层 updateViewLayout 失败：${it.message}") }
    }

    private fun catcherFlags(active: Boolean): Int =
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED or
            (if (active) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)

    override fun onDestroy() {
        if (live === this) live = null
        removeWeb()
        removeCatcher()
        Prefs.setOverlay(this, false)
        ProxyHub.release(HOLDER)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * 把两个窗口都摘下来。先摘触摸层（它挡着点击），再摘显示窗。
     *
     * `removeViewImmediate` 而不是 `removeView`：后者要等下一帧布局才真的移除，
     * 切回 App 的那一瞬间窗口还挂着 —— 看起来就是她的模型"滞留"在屏幕上。
     */
    private fun removeWeb() {
        removeCatcher()
        val v = web ?: return
        web = null
        Log.i(TAG, "removeWeb: 摘掉悬浮窗（attached=${runCatching { v.isAttachedToWindow }.getOrDefault(false)}）")
        runCatching { v.stopLoading() }
        runCatching { wm.removeViewImmediate(v) }
            .onFailure { Log.w(TAG, "removeViewImmediate 失败：${it.message}") }
        runCatching { (v.parent as? ViewGroup)?.removeView(v) }
        runCatching { v.destroy() }
    }

    private fun removeCatcher() {
        val c = catcher ?: return
        catcher = null
        runCatching { wm.removeViewImmediate(c) }
        runCatching { (c.parent as? ViewGroup)?.removeView(c) }
    }

    private fun overlayHeight(): Int =
        (resources.displayMetrics.heightPixels * OVERLAY_HEIGHT_RATIO).toInt().coerceAtLeast(240)

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    private fun showOverlay() {
        val themed = ContextThemeWrapper(this, R.style.AppTheme)
        val view = WebView(themed).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            addJavascriptInterface(Bridge(), "CooOverlay")
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(v: WebView, url: String) {
                    // 悬浮窗里只留宠物和气泡：地板、模式按钮、工具条、菜单都藏掉，
                    // 背景透明，让桌面壁纸/图标透出来。
                    v.evaluateJavascript(INJECT_CSS, null)
                    // 悬浮窗里同样隐藏胶囊，点她身体才浮现
                    TapTalk.inject(this@OverlayPetService, v)
                    // 活动范围（横屏/竖屏各一份）交给她，她自己把走动压在这个区间里
                    pushRange()
                }
            }
            webChromeClient = object : android.webkit.WebChromeClient() {
                override fun onPermissionRequest(request: android.webkit.PermissionRequest) {
                    request.grant(request.resources)
                }

                override fun onConsoleMessage(m: android.webkit.ConsoleMessage): Boolean {
                    Log.i(TAG, "${m.message()} @${m.sourceId()}:${m.lineNumber()}")
                    return true
                }
            }
        }
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
        }
        try {
            wm.addView(view, p)
            web = view
            webParams = p
            addCatcher(themed)
            val petUrl = if (Prefs.localMode(this)) {
                "http://127.0.0.1:${CoreRuntime.PORT}/pet"
            } else {
                "http://127.0.0.1:${LocalProxy.LOCAL_PORT}/pet"
            }
            view.loadUrl(petUrl)
        } catch (e: Throwable) {
            Log.e(TAG, "addView failed: ${e.message}")
            stopSelf()
        }
    }

    /**
     * 触摸层：一个透明、只有她身体那么大的窗口，把收到的触摸原样投给 WebView。
     *
     * 这样窗口本身不用整块接住点击 —— 屏幕上除了她身上那一小块，其余全是别人的。
     */
    private fun addCatcher(themed: Context) {
        val c = object : View(themed) {
            override fun onTouchEvent(e: MotionEvent): Boolean {
                val w = web ?: return false
                if (!touchable) return false
                val at = IntArray(2)
                val onWeb = IntArray(2)
                runCatching { getLocationOnScreen(at) }
                runCatching { w.getLocationOnScreen(onWeb) }
                val copy = MotionEvent.obtain(e)
                // 触摸层的坐标 → WebView 窗口的坐标（两者原点不同，尺寸也不同）
                copy.offsetLocation((at[0] - onWeb[0]).toFloat(), (at[1] - onWeb[1]).toFloat())
                // 窗口不接收触摸，所以事件要手动交给 WebView；assume a fresh down starts a gesture
                w.dispatchTouchEvent(copy)
                copy.recycle()
                return true
            }
        }
        val cp = WindowManager.LayoutParams(
            1, 1,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            catcherFlags(active = touchable),
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 0
            y = 0
        }
        runCatching {
            wm.addView(c, cp)
            catcher = c
            catcherParams = cp
        }.onFailure {
            Log.e(TAG, "触摸层建不起来（退回整窗接住点击）：${it.message}")
            webParams?.let { wp ->
                wp.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
                runCatching { wm.updateViewLayout(web, wp) }
            }
        }
    }

    /** 把当前方向的活动范围（屏宽百分比）+ 她的大小 + 拖动阈值推给页面。 */
    private fun pushRange() {
        val v = web ?: return
        val (l, r) = Prefs.range(this)
        val js = "window.CooRange={left:$l,right:$r,orientation:'" +
            (if (resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) "landscape" else "portrait") +
            "'};window.CooScale=${Prefs.scale(this)};window.CooDragCancel=${Prefs.dragCancelDp(this)};" +
            "window.CooHoldDelay=${Prefs.holdDelayMs(this)};" +
            "window.dispatchEvent&&window.dispatchEvent(new Event('coo-range'));" +
            "window.dispatchEvent&&window.dispatchEvent(new Event('coo-config'));"
        runCatching { v.evaluateJavascript(js, null) }
    }

    /**
     * 页面 → 原生：她身体现在占了哪几块。`json` 形如 {"rects":[[l,t,r,b],...]}，
     * 坐标是页面的 CSS 像素（=dp），这里乘 density 再加窗口在屏幕上的位置。
     *
     * 触摸层取这些矩形的并集（一个窗口只能是一个矩形），再各边留 [CATCH_PAD] 的余量，
     * 这样她走动时触摸层不至于一帧都不跟。
     *
     * 空数组 = 她还没画出来 / 已经走了：触摸层收到 1×1 之外没有可点的东西。
     */
    private inner class Bridge {
        @JavascriptInterface
        fun setHitArea(json: String) {
            pendingHit = json
            web?.post { applyHitArea() }
        }

        @JavascriptInterface
        fun hitAreaInfo(): String = lastRegion

        /** 悬浮窗页面里直接调大小（面板走的是主界面那个桥；这里方便调试和以后的内嵌设置）。 */
        @JavascriptInterface
        fun setScale(v: Float) {
            Prefs.setScale(this@OverlayPetService, v)
            web?.post { pushRange() }
        }

        @JavascriptInterface
        fun bumpScale(delta: Float) {
            Prefs.setScale(this@OverlayPetService, Prefs.scale(this@OverlayPetService) + delta)
            web?.post { pushRange() }
        }

        /** 悬浮窗里她说话也要念出来 —— 跟主界面共用同一个系统语音引擎。 */
        @JavascriptInterface
        fun speak(text: String) = CooTts.speak(text)

        @JavascriptInterface
        fun ttsStop() = CooTts.stop()

        @JavascriptInterface
        fun ttsStatus(): String = CooTts.statusJson()
    }

    private fun applyHitArea() {
        val raw = pendingHit ?: return
        pendingHit = null
        if (raw == lastRegion) return
        lastRegion = raw
        val v = web ?: return
        val cp = catcherParams ?: return

        val loc = IntArray(2)
        runCatching { v.getLocationOnScreen(loc) }
        val d = resources.displayMetrics.density
        val screenW = resources.displayMetrics.widthPixels
        val screenH = resources.displayMetrics.heightPixels

        val rects = runCatching {
            val arr = JSONObject(raw).optJSONArray("rects")
            (0 until (arr?.length() ?: 0)).mapNotNull { i ->
                val a = arr?.optJSONArray(i) ?: return@mapNotNull null
                if (a.length() < 4) return@mapNotNull null
                intArrayOf(
                    (loc[0] + a.optDouble(0) * d).toInt().coerceIn(0, screenW),
                    (loc[1] + a.optDouble(1) * d).toInt().coerceIn(0, screenH),
                    (loc[0] + a.optDouble(2) * d).toInt().coerceIn(0, screenW),
                    (loc[1] + a.optDouble(3) * d).toInt().coerceIn(0, screenH),
                )
            }
        }.getOrDefault(emptyList())

        if (rects.isEmpty()) {
            // 她不在屏幕上：触摸层缩成 1×1 且不可触摸（WMS 不接受 0 尺寸）
            cp.width = 1
            cp.height = 1
            cp.flags = catcherFlags(active = false)
        } else {
            val pad = (CATCH_PAD * d).toInt()
            var l = rects.minOf { it[0] } - pad
            var t = rects.minOf { it[1] } - pad
            var r = rects.maxOf { it[2] } + pad
            var b = rects.maxOf { it[3] } + pad
            l = l.coerceIn(0, screenW - 1)
            t = t.coerceIn(0, screenH - 1)
            r = r.coerceIn(l + 1, screenW)
            b = b.coerceIn(t + 1, screenH)
            cp.x = l
            cp.y = t
            cp.width = r - l
            cp.height = b - t
            cp.flags = catcherFlags(active = touchable)
        }
        runCatching { wm.updateViewLayout(catcher, cp) }
            .onFailure { Log.w(TAG, "触摸层更新失败：${it.message}") }
    }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Coo 悬浮桌宠", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            Notification.Builder(this, CHANNEL)
        else
            @Suppress("DEPRECATION") Notification.Builder(this)
        val toggle = PendingIntent.getService(
            this,
            1,
            Intent(this, OverlayPetService::class.java).setAction(ACTION_TOGGLE_TOUCH),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val toggleLabel = if (touchable) "点击穿透（桌面可点）" else "允许戳她（接住点击）"
        return b.setContentTitle("Coo 在屏幕上")
            .setContentText(if (touchable) "悬浮桌宠运行中 · 只有她身上接住点击" else "悬浮桌宠运行中 · 点击已穿透")
            .setSmallIcon(R.drawable.ic_coo)
            .addAction(Notification.Action.Builder(null, toggleLabel, toggle).build())
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "CooOverlay"
        private const val CHANNEL = "coo_overlay"
        private const val NOTIF_ID = 4101
        private const val ACTION_TOGGLE_TOUCH = "lab.palailab.coo.mobile.TOGGLE_TOUCH"

        /** 主界面改了活动范围：让悬浮窗自己重新取一次（那是另一个 WebView）。 */
        const val ACTION_REFRESH_RANGE = "lab.palailab.coo.mobile.REFRESH_RANGE"

        /** 悬浮窗高度占屏幕的比例：她站在底边，气泡在头顶，够用就好。 */
        private const val OVERLAY_HEIGHT_RATIO = 0.42f

        /** 触摸层比她身体大出来的余量（dp）：她走得快时少挪几次窗口，手指也不至于点在她边上就落空。 */
        private const val CATCH_PAD = 14

        /** 在 ProxyHub 里代表悬浮窗的持有者名字。 */
        private const val HOLDER = "overlay"

        /** 活着的那个悬浮窗（同一时刻只会有一个）。 */
        @Volatile
        private var live: OverlayPetService? = null

        /**
         * 立刻把悬浮窗摘下来，不等 stopService 的异步 onDestroy。
         *
         * 回到 App 时先拆窗、再让主界面接管那只 pet 连接 —— 否则两边的页面会同时在，
         * 服务器把旧的那个当 pet，主界面就一直是"旁观者"，看起来就是她的模型卡在原地。
         */
        fun hideNow(ctx: Context) {
            val svc = live
            Log.i(TAG, "hideNow: 悬浮窗实例=${svc != null}")
            ctx.stopService(Intent(ctx, OverlayPetService::class.java))
            if (svc == null) return
            val done = Runnable {
                svc.removeWeb()
                runCatching { svc.stopSelf() }
            }
            if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) done.run()
            else android.os.Handler(android.os.Looper.getMainLooper()).post(done)
            Prefs.setOverlay(ctx, false)
        }

        /** 悬浮窗专用的页面改造：藏掉桌面版才需要的页面装饰，背景全透明。 */
        private val INJECT_CSS =
            "(()=>{" +
                "const css='.floor{display:none!important}'+" +
                "'.stage-mode{display:none!important}'+" +
                "'#tools{display:none!important}'+" +
                "'#menu{display:none!important}'+" +
                "'html,body,.stage{background:transparent!important}';" +
                "let s=document.getElementById('coo-overlay-css');" +
                "if(!s){s=document.createElement('style');s.id='coo-overlay-css';document.head.appendChild(s);}" +
                "s.textContent=css;" +
                "if(document.documentElement.dataset.cooOverlay)return;" +
                "document.documentElement.dataset.cooOverlay='1';" +
                "})()"
    }
}