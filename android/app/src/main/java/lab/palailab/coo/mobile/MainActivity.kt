package lab.palailab.coo.mobile

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.ConsoleMessage
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast

import java.io.File
import java.net.HttpURLConnection
import java.net.URL

import org.json.JSONObject

/**
 * Coo Mobile v0.1：手机/平板上的 Coopanion 宿主。
 *
 * 页面本身仍然是 PC 上 Coopanion 的宠物页（/pet），本进程只做两件事：
 *  1. 本地反代 127.0.0.1:17789 -> PC 的 LAN 反代（LocalProxy）。
 *  2. WebView 显示，并授予麦克风权限（所以页面连的是 127.0.0.1，属安全上下文）。
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var status: TextView
    /** 左上角入口的呼吸动画，点过入口之后要能停掉。 */
    private var pulse: ObjectAnimator? = null
    /** 入口胶囊：近黑的底 + 亮紫描边，在彩色桌宠背景上也压得住。 */
    private val CHIP_FILL = 0xF2101114.toInt()
    private val CHIP_STROKE = 0xFF8B7CFF.toInt()
    private var pcHost: String = ""
    /** 当前 WebView 显示的是面板（17788）还是桌宠页（7797）。 */
    private var consoleView = false
    /** 面板改造脚本，读一次缓存住。 */
    @Volatile
    private var panelJs: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 系统语音：建早了没坏处，第一句话就不会漏念
        runCatching { CooTts.init(this) }
        // 打开 WebView 远程调试：adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
        // 之后可以用 CDP 读 DOM / 打日志 / 精确点击，排障不必靠截图猜。
        WebView.setWebContentsDebuggingEnabled(true)
        buildUi()
        hideSystemBars()
        requestMic()
        // 安卓 CUA 接头：proot 里的 world 引擎通过 127.0.0.1:18080 截图/点击
        CuaHttpServer.start(this)
        pcHost = Prefs.pcHost(this).ifBlank { DEFAULT_HOST }
        openPet()
    }

    override fun onDestroy() {
        ProxyHub.release(HOLDER)
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        // 从桌面点图标回到应用 = 收掉悬浮窗、由全屏页接管（同一时刻只能有一个 pet 连接）
        Log.i("CooMobile", "onResume：overlay=${Prefs.overlay(this)}")
        if (Prefs.overlay(this)) {
            // 同步摘窗：stopService 的 onDestroy 是异步的，慢一拍她就会在屏幕上多留一会儿
            // （看起来就是"模型滞留"），而且旧连接还占着 pet 身份，主界面只会是旁观者。
            OverlayPetService.hideNow(this)
            Prefs.setOverlay(this, false)
            web.loadUrl("about:blank")
            web.postDelayed({ openPet() }, 250)
        }
        applyKeepOn()
        // 屏幕关过、或者切出去很久：投屏会话会被系统收掉（屏幕不可见就不许投射）。
        // 只要用户还想要这个流，回到前台就自动把授权框再要一次 —— 点一下「共享屏幕」就恢复，
        // 不用自己去面板里翻开关。用户上次点了取消就不再骚扰（screenWant 已经是 false）。
        if (Prefs.screenWant(this) && !ScreenStream.running) {
            Log.i(TAG, "投屏该恢复了：screenWant=true，流没在跑，1.2 秒后自动弹授权")
            web.postDelayed({
                Log.i(TAG, "自动恢复：isFinishing=$isFinishing，running=${ScreenStream.running}")
                if (!isFinishing && Prefs.screenWant(this) && !ScreenStream.running) askScreenCapture()
            }, 1200)
        }
    }

    /** 屏幕别灭：屏幕一黑投影就断，想长时间连着看得靠它。 */
    private fun applyKeepOn() {
        if (Prefs.screenKeepOn(this)) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        // 横竖屏的活动范围是两份：转过来立刻把当前那份推给页面
        status.setTextSize(TypedValue.COMPLEX_UNIT_SP, statusTextSp())
        web.postDelayed({ pushRange() }, 300)
    }

    /** 把当前方向的活动范围（屏宽百分比）交给页面，她据此把走动压在这个区间里。 */
    private fun pushRange() {
        val (l, r) = Prefs.range(this)
        val land = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val js = "window.CooRange={left:$l,right:$r,orientation:'" + (if (land) "landscape" else "portrait") +
            "'};window.CooScale=${Prefs.scale(this)};window.CooDragCancel=${Prefs.dragCancelDp(this)};" +
            "window.CooHoldDelay=${Prefs.holdDelayMs(this)};" +
            "window.dispatchEvent&&window.dispatchEvent(new Event('coo-range'));" +
            "window.dispatchEvent&&window.dispatchEvent(new Event('coo-config'));"
        runCatching { web.evaluateJavascript(js, null) }
    }

    /** 面板改造脚本（assets/coo-android-panel.js）：摘掉 Electron 相关的行，换安卓能用的设置。 */
    private fun injectPanelPatch(v: WebView) {
        val js = panelJs ?: runCatching {
            assets.open("coo-android-panel.js").bufferedReader(Charsets.UTF_8).use { it.readText() }
        }.getOrNull()?.also { panelJs = it }
        if (!js.isNullOrBlank()) runCatching { v.evaluateJavascript(js, null) }
    }

    /** 面板里的按钮：改完设置要让悬浮窗也跟上。 */
    private fun notifyOverlayConfig() {
        if (!Prefs.overlay(this)) return
        runCatching {
            startService(Intent(this, OverlayPetService::class.java).setAction(OverlayPetService.ACTION_REFRESH_RANGE))
        }
    }

    /** 面板 → 原生。JS 桥跑在 WebView 的线程上，碰界面的一律 post 回主线程。 */
    private inner class PanelBridge {
        @JavascriptInterface
        fun state(): String {
            val (l, r) = Prefs.range(this@MainActivity)
            return JSONObject().apply {
                put("overlay", Prefs.overlay(this@MainActivity))
                put("scale", Prefs.scale(this@MainActivity).toDouble())
                put("dragCancelDp", Prefs.dragCancelDp(this@MainActivity))
                put("holdDelayMs", Prefs.holdDelayMs(this@MainActivity))
                put("rangeLeft", l)
                put("rangeRight", r)
                put("cua", CuaBridgeService.ready())
            }.toString()
        }

        @JavascriptInterface
        fun toggleOverlay() {
            runOnUiThread { this@MainActivity.toggleOverlay() }
        }

        @JavascriptInterface
        fun openPet() {
            runOnUiThread {
                consoleView = false
                loadPetPage()
            }
        }

        @JavascriptInterface
        fun bumpScale(delta: Double) {
            Prefs.setScale(this@MainActivity, Prefs.scale(this@MainActivity) + delta.toFloat())
            runOnUiThread { pushRange(); notifyOverlayConfig() }
        }

        @JavascriptInterface
        fun bumpDragCancel(delta: Int) {
            Prefs.setDragCancelDp(this@MainActivity, Prefs.dragCancelDp(this@MainActivity) + delta)
            runOnUiThread { pushRange(); notifyOverlayConfig() }
        }

        /** 面板里直接填数值（1% 一级、毫秒一级，都不是挡位）。 */
        @JavascriptInterface
        fun setScale(v: Double) {
            Prefs.setScale(this@MainActivity, v.toFloat())
            runOnUiThread { pushRange(); notifyOverlayConfig() }
        }

        @JavascriptInterface
        fun setDragCancel(dp: Int) {
            Prefs.setDragCancelDp(this@MainActivity, dp)
            runOnUiThread { pushRange(); notifyOverlayConfig() }
        }

        @JavascriptInterface
        fun setHoldDelay(ms: Int) {
            Prefs.setHoldDelayMs(this@MainActivity, ms)
            runOnUiThread { pushRange(); notifyOverlayConfig() }
        }

        @JavascriptInterface
        fun openRange() = runOnUiThread { rangeDialog() }

        @JavascriptInterface
        fun openCua() = runOnUiThread { openCuaBridgeSettings() }

        // ---------- 系统语音：念她自己说的话 ----------
        /** 桌面页每显示一句就调它，串行排队念完。 */
        @JavascriptInterface
        fun speak(text: String) = CooTts.speak(text)

        @JavascriptInterface
        fun ttsStop() = CooTts.stop()

        @JavascriptInterface
        fun ttsStatus(): String = CooTts.statusJson()

        /** 面板「习惯」页的三个旋钮：开/关、语速、音高。 */
        @JavascriptInterface
        fun ttsSet(on: Boolean, rate: Double, pitch: Double) =
            CooTts.set(this@MainActivity, on, rate, pitch)

        /** 试听：不经模型，直接让引擎念一句，方便调语速。 */
        @JavascriptInterface
        fun ttsSay(text: String) = CooTts.speak(text)

        // ---------- 实时看屏幕：MediaProjection 投屏，8 帧/秒 ----------
        /**
         * 弹系统授权框。授权一次之后屏幕画面持续投到内存里，她每次"看一眼"拿的是最近一帧，
         * 不用再等系统合成。Android 14 起每次开机/重启 app 都要重新点一次同意。
         */
        @JavascriptInterface
        fun screenStart() {
            Prefs.setScreenWant(this@MainActivity, true)
            runOnUiThread { askScreenCapture() }
        }

        @JavascriptInterface
        fun screenStop() {
            // 用户主动关 = 不再想要；下次回前台就别自动弹授权了
            Prefs.setScreenWant(this@MainActivity, false)
            ScreenStreamService.stop(this@MainActivity)
        }

        @JavascriptInterface
        fun screenStatus(): String = ScreenStream.statusJson()

        /** 屏幕别灭：屏幕一黑投影就断（系统行为），想长时间连着看就得靠它。 */
        @JavascriptInterface
        fun setKeepOn(on: Boolean) {
            Prefs.setScreenKeepOn(this@MainActivity, on)
            runOnUiThread { applyKeepOn() }
        }

        @JavascriptInterface
        fun keepOn(): Boolean = Prefs.screenKeepOn(this@MainActivity)

        /**
         * 「习惯」页要读的那些值：selfAdjustCustom 与 touch.wakeKinds 没在 config schema 里注册，
         * /api/config 不会回显它们，所以直接读本机 core 的 config.json。
         */
        @JavascriptInterface
        fun habitState(): String {
            val f = File(filesDir, "runtime/rootfs/opt/coopanion/home/companion/config.json")
            val world = runCatching {
                JSONObject(f.readText(Charsets.UTF_8))
                    .optJSONObject("worlds")
                    ?.optJSONObject("desktop-pet")
            }.getOrNull() ?: return "{}"
            val custom = world.optJSONObject("selfAdjustCustom")
            val touch = world.optJSONObject("touch")
            val window = world.optJSONObject("window")
            return JSONObject().apply {
                put("selfAdjust", world.optString("selfAdjust", "default"))
                put("custom", custom ?: JSONObject())
                put("wakeOn", touch?.optString("wakeOn", "all") ?: "all")
                // wakeKinds 在 schema 里是字符串（core 把数组当坐标对），老配置可能还是数组
                val wk = touch?.optJSONArray("wakeKinds")
                if (wk != null) {
                    put("wakeKinds", wk)
                } else {
                    val arr = org.json.JSONArray()
                    (touch?.optString("wakeKinds", "") ?: "").split(',').map { it.trim() }
                        .filter { it.isNotEmpty() }.forEach { arr.put(it) }
                    put("wakeKinds", arr)
                }
                put("frameRate", window?.optInt("frameRate", 60) ?: 60)
            }.toString()
        }
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    // ---------- UI ----------

    private fun buildUi() {
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        // 面板里的「悬浮桌宠 / 桌宠大小 / 活动范围 / 拖动灵敏度」按钮走这个桥
        web.addJavascriptInterface(PanelBridge(), "CooAndroid")
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        status = TextView(this).apply {
            setTextColor(Color.WHITE)
            // 左边这个胶囊是新用户进 UI 的唯一入口：按 dpi 和屏幕尺寸放大（statusTextSp）、
            // 加粗、深底 + 亮紫描边，没点过之前还会呼吸招手（pulseChip）。
            setTextSize(TypedValue.COMPLEX_UNIT_SP, statusTextSp())
            typeface = Typeface.DEFAULT_BOLD
            setBackground(chipBg(CHIP_FILL, CHIP_STROKE))
            setPadding(dp(20), dp(11), dp(20), dp(11))
            elevation = dp(8).toFloat()
            text = "连接中…"
            setOnClickListener { openFromChip() }
        }
        val lp = FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.START)
        lp.topMargin = dp(36)
        lp.leftMargin = dp(14)
        root.addView(status, lp)
        setContentView(root)
        configureWeb()
    }

    /**
     * 状态条字号：基准 15sp，按屏幕密度和物理尺寸放大。
     *
     * - 密度：dpi/320 开平方（440dpi 的机器约 ×1.17，560dpi 约 ×1.32）
     * - 平板（shortestScreenWidthDp ≥ 600）再 ×1.15：平板看起来远，同样 sp 更费眼
     * 结果夹在 16..26sp。之前是 12sp 起、上限 20sp，新用户反馈"看不出来这是进设置的地方"，
     * 所以整体抬高一档。
     */
    private fun statusTextSp(): Float {
        val dm = resources.displayMetrics
        val sw = resources.configuration.smallestScreenWidthDp
        var sp = 15f * kotlin.math.sqrt(dm.densityDpi / 320f)
        if (sw >= 600) sp *= 1.15f
        return sp.coerceIn(16f, 26f)
    }

    private fun chipBg(fill: Int, stroke: Int): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(26).toFloat()
        setColor(fill)
        setStroke(dp(2), stroke)
    }

    /**
     * 入口呼吸：没点过就一直招手（新用户得先看见它），点过之后只在刚进桌宠页时轻轻提醒几下。
     */
    private fun pulseChip(forever: Boolean) {
        pulse?.cancel()
        val a = ObjectAnimator.ofFloat(status, "alpha", 1f, 0.5f)
        a.duration = 700
        a.repeatMode = ValueAnimator.REVERSE
        a.repeatCount = if (forever) ValueAnimator.INFINITE else 5
        pulse = a
        a.start()
    }

    /** 入口上的字：没点过就说得直白点，点过之后就是一个普通胶囊按钮。 */
    private fun chipText(): String =
        if (!Prefs.entrySeen(this)) "👋 点这里进设置"
        else "⚙ 设置面板"

    /** 从左上角进 UI：第一次点就记下"学会了"，停掉招手。 */
    private fun openFromChip() {
        if (!Prefs.entrySeen(this)) {
            Prefs.markEntrySeen(this)
            pulse?.cancel()
            pulse = null
            status.alpha = 1f
            status.text = chipText()
        }
        menu()
    }

    // ---------- 实时看屏幕（MediaProjection） ----------

    /**
     * 弹系统的"开始投放屏幕"授权框。用户点同意后，ScreenStreamService 拿到 code+data
     * 就能持续抓帧；点拒绝则什么都不发生（她自己那块屏幕截图照旧能用，只是慢一点）。
     */
    @Suppress("DEPRECATION")
    private fun askScreenCapture() {
        Log.i(TAG, "请求投屏授权框")
        val mpm = getSystemService(MediaProjectionManager::class.java)
        if (mpm == null) {
            Log.w(TAG, "这台设备没有 MediaProjectionManager")
            return
        }
        runCatching { startActivityForResult(mpm.createScreenCaptureIntent(), REQ_SCREEN) }
            .onFailure { Log.w(TAG, "投屏授权框起不来：${it.message}") }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_SCREEN) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Prefs.setScreenWant(this, true)
                ScreenStreamService.start(this, resultCode, data)
                Log.i(TAG, "投屏已授权 → 实时流启动")
            } else {
                // 用户点了取消：别再自动弹，等他下次自己点
                Prefs.setScreenWant(this, false)
                Log.i(TAG, "投屏授权被拒/取消")
            }
            return
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    private fun configureWeb() {
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = false
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http://127.0.0.1:")) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                runOnUiThread {
                    status.text = if (Prefs.localMode(this@MainActivity)) {
                        "⚠ 核心没响应 · 点这里看/重启"
                    } else {
                        "⚠ 连不上 PC（$pcHost）· 点这里改"
                    }
                    status.background = chipBg(0xE6B3261E.toInt(), 0xFFFF9A8F.toInt())
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                // 面板（17788）是完整的网页控制台，状态条压住它的页头 ⇒ 面板里隐藏状态条，
                // 系统返回键退回桌宠页后状态条自动出现（桌宠页需要它作为“设置”入口）。
                val onConsole = url.contains(":17788")
                consoleView = onConsole
                if (onConsole) {
                    pulse?.cancel()
                    status.alpha = 1f
                    status.visibility = View.GONE
                    // 面板里安卓做不到的两行（Electron 窗口/运行时）换成本机能用的设置
                    injectPanelPatch(view)
                } else {
                    status.visibility = View.VISIBLE
                    status.text = chipText()
                    status.background = chipBg(CHIP_FILL, CHIP_STROKE)
                    status.alpha = 1f
                    // 没点过入口 → 一直招手；点过的只在刚进桌宠页时轻轻提醒几下
                    pulseChip(forever = !Prefs.entrySeen(this@MainActivity))
                    // 桌宠页：「按住说话」胶囊默认藏起来，点她身体才浮现（assets/coo-tap-talk.js）
                    if (url.contains("/pet")) TapTalk.inject(this@MainActivity, view)
                    // 活动范围（横屏/竖屏各一份）也交给全屏页，她在这里同样不越界
                    if (url.contains("/pet")) pushRange()
                }
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { request.grant(request.resources) }
            }

            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i("CooWeb", "${m.message()} @${m.sourceId()}:${m.lineNumber()}")
                return true
            }
        }
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_FULLSCREEN
        }
    }

    // ---------- 连接 ----------

    private fun openPet() {
        if (Prefs.localMode(this)) {
            openLocal()
            return
        }
        ProxyHub.acquire(pcHost, HOLDER)
        status.text = "PC $pcHost · 本地 :${LocalProxy.LOCAL_PORT}"
        status.setBackgroundColor(0x99000000.toInt())
        web.postDelayed({ web.loadUrl("http://127.0.0.1:${LocalProxy.LOCAL_PORT}/pet") }, 350)
    }

    /**
     * 本机模式：核心就在这台平板上（proot 里的 Node），页面直接从 127.0.0.1:7797 取，
     * 既不需要反代，也不会有 PC 桌宠"抢占 pet 身份"的问题。
     */
    private fun openLocal() {
        ProxyHub.release(HOLDER)
        status.text = "本机核心启动中…"
        status.setBackgroundColor(0x99000000.toInt())
        CoreService.start(this)
        if (CoreRuntime.portOpen()) {
            loadPetPage()
            return
        }
        Thread {
            val ready = CoreRuntime.waitReady(180_000)
            runOnUiThread {
                if (ready) {
                    status.text = "本机核心 · 127.0.0.1:${CoreRuntime.PORT}"
                    status.setBackgroundColor(0x99000000.toInt())
                    loadPetPage()
                } else {
                    status.text = "核心没起来 · 点这里重试"
                    status.setBackgroundColor(0xCC8B0000.toInt())
                }
            }
        }.start()
    }

    private fun loadPetPage() {
        val url = if (Prefs.localMode(this)) {
            "http://127.0.0.1:${CoreRuntime.PORT}/pet"
        } else {
            "http://127.0.0.1:${LocalProxy.LOCAL_PORT}/pet"
        }
        web.postDelayed({ web.loadUrl(url) }, 200)
    }

    private fun menu() {
        if (!Prefs.localMode(this)) {
            val landMode = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
            val items = arrayOf(
                "切换到本机模式（核心在平板上）",
                "改 Coopanion 主机地址",
                if (Prefs.overlay(this)) "关闭悬浮桌宠" else "开启悬浮桌宠",
                "桌宠活动范围（当前" + (if (landMode) "横屏" else "竖屏") + "）",
                "重载页面",
                "让电脑桌宠让位（平板接管语音）",
                "让电脑桌宠回来（把 Coo 还给电脑）",
            )
            AlertDialog.Builder(this)
                .setTitle("Coopanion · 手机版")
                .setItems(items) { _, which ->
                    when (which) {
                        0 -> switchMode()
                        1 -> askHost()
                        2 -> toggleOverlay()
                        3 -> rangeDialog()
                        4 -> openPet()
                        5 -> petWindow("yield")
                        6 -> petWindow("restore")
                    }
                }
                .show()
            return
        }

        // 本机模式：平板上就是完整的那套 Coo —— 桌宠页 + 面板（设置/模型/世界）+ 悬浮桌宠
        val land = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val items = arrayOf(
            if (consoleView) "回到桌宠" else "打开 Coo 面板（设置 / 模型 / 世界）",
            if (Prefs.overlay(this)) "关闭悬浮桌宠" else "开启悬浮桌宠（站到桌面底部）",
            "桌宠活动范围（当前" + (if (land) "横屏" else "竖屏") + "）",
            "安卓 CUA 接头（无障碍：看屏幕 / 点击）",
            "重启本机核心（${CoreRuntime.PORT}）",
            "看核心日志",
            "重载当前页面",
            "切换到 PC 模式（核心在电脑上）",
        )
        AlertDialog.Builder(this)
            .setTitle("Coopanion · 本机版（${CoreRuntime.PORT}）")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> if (consoleView) backToPet() else openConsole()
                    1 -> toggleOverlay()
                    2 -> rangeDialog()
                    3 -> openCuaBridgeSettings()
                    4 -> restartCore()
                    5 -> showCoreLog()
                    6 -> if (consoleView) openConsole() else loadPetPage()
                    7 -> switchMode()
                }
            }
            .show()
    }

    /** 面板 = 桌面版点托盘图标出来的那个 web 控制台（17788）。 */
    private fun openConsole() {
        consoleView = true
        status.text = "Coopanion 面板 · 127.0.0.1:17788 · 点这里返回"
        status.setBackgroundColor(0x99000000.toInt())
        web.postDelayed({ web.loadUrl("http://127.0.0.1:17788/") }, 120)
    }

    private fun backToPet() {
        consoleView = false
        status.text = "本机核心 · 127.0.0.1:${CoreRuntime.PORT} · 点这里设置"
        status.setBackgroundColor(0x99000000.toInt())
        loadPetPage()
    }

    private fun switchMode() {
        val nowLocal = !Prefs.localMode(this)
        Prefs.setLocalMode(this, nowLocal)
        toast(if (nowLocal) "已切到本机模式（核心在平板）" else "已切到 PC 模式")
        openPet()
    }

    private fun restartCore() {
        toast("重启本机核心…")
        startService(
            Intent(this, CoreService::class.java).setAction(CoreService.ACTION_RESTART),
        )
        Thread {
            CoreRuntime.stop()
            Thread.sleep(1200)
            val ok = CoreRuntime.start(this) && CoreRuntime.waitReady(120_000)
            runOnUiThread {
                toast(if (ok) "核心已重启" else "核心启动失败，看日志")
                if (ok) loadPetPage()
            }
        }.start()
    }

    private fun showCoreLog() {
        val text = CoreRuntime.logTail(this, 40).ifBlank { "（还没有日志）" }
        AlertDialog.Builder(this)
            .setTitle("本机核心日志")
            .setMessage(text)
            .setPositiveButton("重载页面") { _, _ -> loadPetPage() }
            .setNeutralButton("重启核心") { _, _ -> restartCore() }
            .setNegativeButton("关闭", null)
            .show()
    }

    /**
     * 电脑桌宠窗的让位/归还。
     *
     * 协议规定 window 优先于 tab：PC 上那个透明桌宠窗连着时，手机页面只是"旁观者"，
     * 服务器会把音频帧和收音闸门全部丢掉（打字仍可用，所以很容易误判成"语音坏了"）。
     * 让位 = 请 PC 反代记下那个窗口的命令行并结束它，手机重载页面后成为真正的 pet，
     * 可以按住说话；归还 = 用记下的命令行把窗口重新拉起来。
     */
    private fun petWindow(action: String) {
        val label = if (action == "yield") "接管" else "归还"
        toast("正在$label…")
        Thread {
            val msg = try {
                val url = URL("http://127.0.0.1:${LocalProxy.LOCAL_PORT}/__coo/petwindow/$action")
                val conn = url.openConnection() as HttpURLConnection
                conn.connectTimeout = 20000
                conn.readTimeout = 25000
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                "petwindow:$label ${body.take(160)}"
            } catch (e: Throwable) {
                "petwindow:$label 失败 ${e.message}"
            }
            Log.i("CooMobile", msg)
            runOnUiThread {
                toast(if (msg.contains("\"ok\": true") || msg.contains("\"ok\":true")) "$label 完成" else "$label 未完成，看日志")
                openPet()
            }
        }.start()
    }

    /**
     * 桌宠活动范围：她在屏幕上允许走动的横向区间（屏宽百分比），横屏/竖屏各存一份。
     *
     * 为什么需要：安卓平板横竖屏的可操作区域完全不同 —— 竖屏时左右窄、底下还有手势条，
     * 横屏时两边空出来是别人要用的地方。给她划一个区间，她就只在这个区间里待着。
     */
    private fun rangeDialog() {
        val land = resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val (l0, r0) = Prefs.range(this)
        val box = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(dp(20), dp(10), dp(20), 0)
        }
        val hint = TextView(this).apply {
            text = "她只在这个横向区间里走动，拖也拖不出去。\n横屏和竖屏各存一份：转过来再设一次就好。"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(0, 0, 0, dp(12))
            setTextColor(0xFF888888.toInt())
        }
        val lLab = TextView(this).apply { setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f) }
        val lBar = android.widget.SeekBar(this).apply { max = 100; progress = l0 }
        val rLab = TextView(this).apply { setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f) }
        val rBar = android.widget.SeekBar(this).apply { max = 100; progress = r0 }
        val refresh = {
            lLab.text = "左边界：${lBar.progress}%"
            rLab.text = "右边界：${rBar.progress}%"
        }
        lBar.setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: android.widget.SeekBar?, p: Int, fromUser: Boolean) {
                if (p > rBar.progress - 8) rBar.progress = (p + 8).coerceAtMost(100)
                refresh()
            }
            override fun onStartTrackingTouch(sb: android.widget.SeekBar?) {}
            override fun onStopTrackingTouch(sb: android.widget.SeekBar?) {}
        })
        rBar.setOnSeekBarChangeListener(object : android.widget.SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: android.widget.SeekBar?, p: Int, fromUser: Boolean) {
                if (p < lBar.progress + 8) lBar.progress = (p - 8).coerceAtLeast(0)
                refresh()
            }
            override fun onStartTrackingTouch(sb: android.widget.SeekBar?) {}
            override fun onStopTrackingTouch(sb: android.widget.SeekBar?) {}
        })
        refresh()
        box.addView(hint)
        box.addView(lLab)
        box.addView(lBar)
        box.addView(rLab)
        box.addView(rBar)
        AlertDialog.Builder(this)
            .setTitle("桌宠活动范围 · " + (if (land) "横屏" else "竖屏"))
            .setView(box)
            .setPositiveButton("保存") { _, _ ->
                Prefs.setRange(this, lBar.progress, rBar.progress)
                val (l, r) = Prefs.range(this)
                toast("活动范围：$l% – $r%")
                pushRange()
                refreshOverlayRange()
            }
            .setNeutralButton("整屏") { _, _ ->
                Prefs.setRange(this, 0, 100)
                toast("活动范围：整屏")
                pushRange()
                refreshOverlayRange()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /** 打开系统的无障碍设置，让用户把「Coo · 安卓 CUA 接头」打开（一次性授权）。 */
    private fun openCuaBridgeSettings() {
        if (CuaBridgeService.ready()) {
            toast("CUA 接头已连接：看屏幕 / 点击都能用了")
            return
        }
        toast("在无障碍里找「Coo · 安卓 CUA 接头」并打开")
        runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            .onFailure { toast("打不开无障碍设置，手动去 设置 → 无障碍") }
    }

    /** 悬浮窗开着时也要改它的范围：那是另一个 WebView，得让它自己重新取一次。 */
    private fun refreshOverlayRange() {
        if (!Prefs.overlay(this)) return
        runCatching {
            startService(
                Intent(this, OverlayPetService::class.java).setAction(OverlayPetService.ACTION_REFRESH_RANGE),
            )
        }
    }

    private fun toggleOverlay() {
        val svc = Intent(this, OverlayPetService::class.java)
        if (Prefs.overlay(this)) {
            stopService(svc)
            Prefs.setOverlay(this, false)
            toast("悬浮桌宠已关闭")
            openPet()
            return
        }
        if (!Settings.canDrawOverlays(this)) {
            toast("先允许「显示在其他应用上层」，回来再点一次")
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")),
            )
            return
        }
        // 同一时刻只能有一个 pet 连接：先断开主界面，再起悬浮窗
        web.loadUrl("about:blank")
        // 本机反代由 ProxyHub 共享给悬浮窗（同一进程同一个端口），这里不用手动让出。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(svc) else startService(svc)
        Prefs.setOverlay(this, true)
        toast("悬浮桌宠已开启：按 Home 回到桌面看她")
        // 悬浮窗自己就是那只桌宠（和 PC 上一样是独立小窗），主界面留一条状态条反而不像 PC。
        // 收起主界面，让桌宠独占那只 pet 连接。
        moveTaskToBack(true)
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    private fun askHost() {
        val input = EditText(this).apply {
            hint = "例如 192.168.1.100"
            setText(pcHost.ifBlank { "192.168.1.100" })
            setSelection(text.length)
        }
        AlertDialog.Builder(this)
            .setTitle("Coopanion 主机")
            .setMessage("只填 PC 的局域网 IP（端口固定 ${LocalProxy.TARGET_PORT}）。\n需要 PC 上跑着 Coopanion，以及 tools/lan-proxy.py。")
            .setView(input)
            .setPositiveButton("连接") { _, _ ->
                val v = input.text.toString().trim()
                    .removePrefix("http://")
                    .substringBefore("/")
                    .substringBefore(":")
                pcHost = v.ifBlank { "192.168.1.100" }
                Prefs.setPcHost(this, pcHost)
                openPet()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun requestMic() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 2)
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        /** 日志标签（原先几处直接写字符串，新代码统一用这个）。 */
        private const val TAG = "CooMobile"

        /** 投屏授权的 requestCode，onActivityResult 里认它。 */
        private const val REQ_SCREEN = 0x5C01

        /** 家里 PC 的局域网地址；换网络时点顶部状态条改。 */
        private const val DEFAULT_HOST = "192.168.1.100"

        /** 在 ProxyHub 里代表本界面的持有者名字。 */
        private const val HOLDER = "activity"
    }
}