package lab.palailab.coo.mobile

import android.content.Context
import android.webkit.WebView

/**
 * 「先点身体、再按住说话」的注入器。
 *
 * 常驻的「按住说话」胶囊挡视线，用户要的是两段式交互。这个胶囊是页面运行时注入的，
 * 一次性改 DOM 会在页面重载/重连后失效，所以这里每次 onPageFinished 都重新注入一段
 * 幂等的控制器（assets/coo-tap-talk.js，第二次进来只做 refresh）。
 */
object TapTalk {
    private const val ASSET = "coo-tap-talk.js"

    @Volatile
    private var source: String? = null

    fun inject(ctx: Context, web: WebView) {
        val js = source ?: runCatching {
            ctx.assets.open(ASSET).bufferedReader(Charsets.UTF_8).use { it.readText() }
        }.getOrNull()?.also { source = it }
        if (js.isNullOrBlank()) return
        runCatching { web.evaluateJavascript(js, null) }
    }
}