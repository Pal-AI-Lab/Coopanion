package lab.palailab.coo.mobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * 安卓 CUA 接头（无障碍服务）。
 *
 * 桌面版 Coopanion 的 CUA 引擎是在 PC 上调 Win32/X11 的（`src/cua/engine/{win32,linux}.ts`），
 * 到了平板上没有那些东西 —— 这一层把"看屏幕 / 点 / 滑"换成安卓自己的实现：
 *
 *   看屏幕 → AccessibilityService.takeScreenshot（API 30+，不需要 MediaProjection 的授权弹窗）
 *   点/滑  → dispatchGesture
 *   界面树 → rootInActiveWindow 的文本/边界（给模型当"读屏"用）
 *
 * 它只做执行，不直接面对插件：对外是 [CuaHttpServer] 上的几个 HTTP 端点，
 * proot 里的引擎（`src/cua/engine/android.ts`）照 win32.ts 的形状去调它们。
 * 这样插件本身一行都不用改。
 */
class CuaBridgeService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "安卓 CUA 接头已连接")
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    /** 屏幕尺寸（物理像素）。 */
    fun screenSize(): Pair<Int, Int> {
        val dm = resources.displayMetrics
        return dm.widthPixels to dm.heightPixels
    }

    /**
     * 截一张屏。`maxWidth` 只做等比缩放（模型看缩小图更省 token）。
     * 失败（没权限/系统忙）返回 null。
     */
    fun screenshot(maxWidth: Int = 1280, quality: Int = 75): ByteArray? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val out = AtomicReference<Bitmap?>()
        val done = CountDownLatch(1)
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            mainExecutor,
            object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    try {
                        // 硬件位图不能直接压缩：先拷到软件位图
                        val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        val sw = hw?.copy(Bitmap.Config.ARGB_8888, false)
                        result.hardwareBuffer.close()
                        out.set(sw)
                    } catch (e: Throwable) {
                        Log.w(TAG, "screenshot 转换失败：${e.message}")
                    } finally {
                        done.countDown()
                    }
                }

                override fun onFailure(errorCode: Int) {
                    Log.w(TAG, "screenshot 失败：errorCode=$errorCode")
                    done.countDown()
                }
            },
        )
        if (!done.await(8, TimeUnit.SECONDS)) return null
        val bmp = out.get() ?: return null
        val scaled = if (maxWidth in 1 until bmp.width) {
            val h = (bmp.height.toLong() * maxWidth / bmp.width).toInt().coerceAtLeast(1)
            Bitmap.createScaledBitmap(bmp, maxWidth, h, true)
        } else bmp
        return runCatching {
            java.io.ByteArrayOutputStream().use { bos ->
                scaled.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(30, 95), bos)
                bos.toByteArray()
            }
        }.getOrNull()
    }

    /** 点一下（毫秒级 press，够触发点击）。 */
    fun tap(x: Float, y: Float, ms: Long = 60): Boolean = line(floatArrayOf(x, y, x, y), ms)

    /** 直线滑动/拖拽。 */
    fun swipe(x1: Float, y1: Float, x2: Float, y2: Float, ms: Long): Boolean =
        line(floatArrayOf(x1, y1, x2, y2), ms.coerceIn(30, 4000))

    /** 一条连续路径（多点滑动，比如画"解锁图案"）。 */
    fun path(points: List<FloatArray>, ms: Long): Boolean {
        if (points.size < 2) return false
        val p = Path()
        p.moveTo(points[0][0], points[0][1])
        for (i in 1 until points.size) p.lineTo(points[i][0], points[i][1])
        return dispatch(p, ms.coerceIn(30, 6000))
    }

    /** [x1, y1, x2, y2] */
    private fun line(a: FloatArray, ms: Long): Boolean {
        if (a.size < 4) return false
        val p = Path()
        p.moveTo(a[0], a[1])
        p.lineTo(a[2], a[3])
        return dispatch(p, ms.coerceIn(20, 4000))
    }

    private fun dispatch(p: Path, ms: Long): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val stroke = GestureDescription.StrokeDescription(p, 0, ms)
        val desc = GestureDescription.Builder().addStroke(stroke).build()
        val ok = dispatchGesture(desc, null, null)
        if (!ok) Log.w(TAG, "dispatchGesture 被拒（服务没连上/权限不足）")
        return ok
    }

    /**
     * 原始像素：宽高写在小端 uint32 头里，后面是 RGBA_8888 字节。
     * proot 里的引擎（`engine/android.ts`）拿它当 capture() 的 bgra（自己换一下 R/B），
     * 省掉在平板侧解码 JPEG 的开销。
     */
    fun screenshotRaw(maxWidth: Int = 0): ByteArray? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
        val out = AtomicReference<Bitmap?>()
        val done = CountDownLatch(1)
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            mainExecutor,
            object : TakeScreenshotCallback {
                override fun onSuccess(result: ScreenshotResult) {
                    try {
                        val hw = Bitmap.wrapHardwareBuffer(result.hardwareBuffer, result.colorSpace)
                        out.set(hw?.copy(Bitmap.Config.ARGB_8888, false))
                        result.hardwareBuffer.close()
                    } catch (e: Throwable) {
                        Log.w(TAG, "raw 截图失败：${e.message}")
                    } finally {
                        done.countDown()
                    }
                }

                override fun onFailure(errorCode: Int) {
                    Log.w(TAG, "raw 截图失败：errorCode=$errorCode")
                    done.countDown()
                }
            },
        )
        if (!done.await(8, TimeUnit.SECONDS)) return null
        var bmp = out.get() ?: return null
        if (maxWidth in 1 until bmp.width) {
            val h = (bmp.height.toLong() * maxWidth / bmp.width).toInt().coerceAtLeast(1)
            bmp = Bitmap.createScaledBitmap(bmp, maxWidth, h, true)
        }
        val w = bmp.width
        val h = bmp.height
        val pixels = ByteArray(w * h * 4)
        runCatching { bmp.copyPixelsToBuffer(java.nio.ByteBuffer.wrap(pixels)) }
        val head = java.nio.ByteBuffer.allocate(8).order(java.nio.ByteOrder.LITTLE_ENDIAN)
            .putInt(w).putInt(h).array()
        return head + pixels
    }

    /** 读屏：当前窗口里能看到的文字与它们的边界，给模型当线索。 */
    fun uiTree(): String {
        val root = rootInActiveWindow ?: return "[]"
        val sb = StringBuilder("[")
        var n = 0
        fun walk(node: android.view.accessibility.AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 24 || n > 400) return
            val text = (node.text ?: node.contentDescription)?.toString()?.trim()
            if (!text.isNullOrEmpty()) {
                val r = android.graphics.Rect()
                node.getBoundsInScreen(r)
                if (n++ > 0) sb.append(',')
                sb.append("{\"text\":\"").append(text.replace("\"", "\\\"").take(120))
                    .append("\",\"x\":").append(r.centerX())
                    .append(",\"y\":").append(r.centerY())
                    .append(",\"w\":").append(r.width())
                    .append(",\"h\":").append(r.height()).append('}')
            }
            for (i in 0 until node.childCount) walk(node.getChild(i), depth + 1)
        }
        walk(root, 0)
        sb.append(']')
        return sb.toString()
    }

    companion object {
        private const val TAG = "CooCuaBridge"

        @Volatile
        var instance: CuaBridgeService? = null
            private set

        fun ready(): Boolean = instance != null
    }
}