package lab.palailab.coo.mobile

import android.content.Context
import android.content.Intent
import android.speech.tts.TextToSpeech
import android.util.Log
import org.json.JSONObject
import java.util.Locale

/**
 * 系统语音：把 Coo 说的话交给安卓自带的 TTS 引擎念出来。
 *
 * 平板上的 Coo 没有自己的发声器官（PC 版那套语音依赖桌面端），但每台安卓设备都带
 * 系统 TTS —— 直接借它念，中文断句、语气停顿都是现成的。
 *
 * 单例：主界面和悬浮窗两个 WebView 共用同一个引擎，否则两边会抢着说话。
 *
 * 找引擎的顺序（各种品牌 ROM 都能用，不用在代码里写死某一家）：
 *   1. 系统默认引擎（设置里「首选引擎」那个）
 *   2. 默认不行，就把设备上所有声明了 TTS_SERVICE 的引擎挨个起一遍
 *   3. 优先挑「会中文」的；都不会中文就退而用第一个能出声的，语言跟系统走
 * 小米自带的 com.xiaomi.mibrain.speech、华为的 com.huawei.hiai、三星的 com.samsung.SMT、
 * Google 的 com.google.android.tts 走的都是这条路，没有分支判断。
 */
object CooTts {
    private const val TAG = "CooTts"
    private const val DEFAULT_KEY = "<默认>"

    private var tts: TextToSpeech? = null
    private var pending: TextToSpeech? = null
    private var ready = false
    private var failed: String? = null
    private var inited = false

    /** 起不来的、或者起来但不会中文的，都记在这儿，免得反复试同一个。 */
    private val tried = LinkedHashSet<String>()
    private var spare: TextToSpeech? = null
    private var spareName: String? = null
    private var chosen: String? = null

    var enabled = true
        private set
    var rate = 1f
        private set
    var pitch = 1f
        private set

    @Synchronized
    fun init(c: Context) {
        if (inited) return
        inited = true
        val app = c.applicationContext
        enabled = Prefs.ttsEnabled(app)
        rate = Prefs.ttsRate(app)
        pitch = Prefs.ttsPitch(app)
        probe(app, null)
    }

    /** engine = null 表示「系统默认那个」。回调里靠 pending 拿到刚建好的实例。 */
    private fun probe(app: Context, engine: String?) {
        tried.add(engine ?: DEFAULT_KEY)
        pending = null
        val listener = TextToSpeech.OnInitListener { status -> onInited(app, status, engine, pending) }
        val t = if (engine == null) TextToSpeech(app, listener) else TextToSpeech(app, listener, engine)
        pending = t
    }

    private fun onInited(app: Context, status: Int, engine: String?, t: TextToSpeech?) {
        if (status == TextToSpeech.SUCCESS && t != null) {
            val zh = speaksChinese(t)
            if (zh) {
                adopt(t, engine, true)
                return
            }
            // 能出声但不会中文：先留着兜底，同时继续找会中文的
            if (spare == null) {
                spare = t
                spareName = engine ?: runCatching { t.defaultEngine }.getOrNull()
                Log.i(TAG, "引擎 ${engine ?: "系统默认"} 不会中文，先留着兜底，继续找")
            } else {
                runCatching { t.shutdown() }
            }
        } else {
            runCatching { t?.shutdown() }
            Log.i(TAG, "引擎 ${engine ?: "系统默认"} 起不来（$status），换下一个")
        }

        val next = enginesOnDevice(app).firstOrNull { it !in tried }
        if (next != null) {
            probe(app, next)
            return
        }
        // 该试的都试过了
        val s = spare
        if (s != null) {
            adopt(s, spareName, false)
        } else {
            failed = "这台设备上没有能用的语音引擎（试过 ${tried.size} 个）"
            Log.w(TAG, failed ?: "TTS 初始化失败")
        }
    }

    /** 设备上所有声明了 TTS_SERVICE 的包（Android 11 起靠 Manifest 的 <queries> 才看得见）。 */
    private fun enginesOnDevice(app: Context): List<String> = runCatching {
        app.packageManager
            .queryIntentServices(Intent("android.intent.action.TTS_SERVICE"), 0)
            .mapNotNull { it.serviceInfo?.packageName }
            .distinct()
    }.getOrDefault(emptyList())

    private fun speaksChinese(t: TextToSpeech): Boolean = runCatching {
        val r = t.setLanguage(Locale.SIMPLIFIED_CHINESE)
        r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
    }.getOrDefault(false)

    private fun adopt(t: TextToSpeech, engine: String?, chinese: Boolean) {
        // 不会中文的引擎把语言退回系统默认，至少能念出点什么
        if (!chinese) runCatching { t.setLanguage(Locale.getDefault()) }
        runCatching {
            t.setSpeechRate(rate)
            t.setPitch(pitch)
        }.onFailure { Log.w(TAG, "TTS 配置失败：${it.message}") }
        tts = t
        chosen = engine ?: runCatching { t.defaultEngine }.getOrNull()
        ready = true
        failed = null
        Log.i(TAG, "系统语音就绪：engine=$chosen voice=${runCatching { t.voice?.name }.getOrNull()} 中文=$chinese")
    }

    /** 她说的这一句要不要念、念多快，都在「习惯」页里调。 */
    fun speak(text: String) {
        if (!enabled) return
        val clean = clean(text)
        if (clean.isEmpty()) return
        if (!ready) {
            Log.i(TAG, "引擎还没就绪，跳过：${clean.take(30)}")
            return
        }
        // QUEUE_ADD：她连着说几句时按顺序念完，不打断前一句
        runCatching { tts?.speak(clean, TextToSpeech.QUEUE_ADD, null, "coo-" + System.nanoTime()) }
            .onFailure { Log.w(TAG, "朗读失败：${it.message}") }
    }

    fun stop() = runCatching { tts?.stop() }.let { }

    fun set(c: Context, on: Boolean, r: Double, p: Double) {
        enabled = on
        rate = r.toFloat().coerceIn(0.5f, 2.5f)
        pitch = p.toFloat().coerceIn(0.5f, 2.5f)
        Prefs.setTts(c, on, rate, pitch)
        runCatching {
            tts?.setSpeechRate(rate)
            tts?.setPitch(pitch)
        }
    }

    fun statusJson(): String = JSONObject().apply {
        put("ready", ready)
        put("enabled", enabled)
        put("rate", rate.toDouble())
        put("pitch", pitch.toDouble())
        put("engine", chosen ?: runCatching { tts?.defaultEngine }.getOrNull() ?: "")
        put("voice", runCatching { tts?.voice?.name }.getOrNull() ?: "")
        put("probed", tried.size)
        if (failed != null) put("error", failed)
    }.toString()

    /**
     * 舞台提示（【开心】这类）和 markdown 符号不念 —— 念出来会变成"左括号开心右括号"。
     * 只留真正要说的字。
     */
    private fun clean(s: String): String = s
        .replace(Regex("【[^】]*】"), "")
        .replace(Regex("\\[(.*?)]\\((.*?)\\)"), "$1")
        .replace(Regex("[*`#>_~]+"), "")
        .replace(Regex("\\s+"), " ")
        .trim()
}