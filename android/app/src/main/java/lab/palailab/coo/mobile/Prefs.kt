package lab.palailab.coo.mobile

import android.content.Context

object Prefs {
    private const val FILE = "coo"
    private const val KEY_HOST = "pc_host"
    private const val KEY_OVERLAY = "overlay"
    private const val KEY_LOCAL = "local_core"
    /** 活动范围：屏宽百分比 "left,right"，横屏/竖屏各一份。 */
    private const val KEY_RANGE_PORT = "range_portrait"
    private const val KEY_RANGE_LAND = "range_landscape"
    /** 桌宠大小（倍数，页面里 S = .42 × scale）。 */
    private const val KEY_SCALE = "pet_scale"
    /** 拖动多少 dp 就当"拖动"、取消语音输入。 */
    private const val KEY_DRAG_CANCEL = "drag_cancel_dp"
    /** 按住之后等多久才开始收音（毫秒）：按住说话的两个参数之一。 */
    private const val KEY_HOLD_DELAY = "hold_delay_ms"
    /** 系统语音：用安卓自带的 TTS 念她自己说的话。 */
    private const val KEY_TTS_ON = "tts_enabled"
    private const val KEY_TTS_RATE = "tts_rate"
    private const val KEY_TTS_PITCH = "tts_pitch"

    fun ttsEnabled(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY_TTS_ON, true)

    fun ttsRate(c: Context): Float =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getFloat(KEY_TTS_RATE, 1f).coerceIn(0.5f, 2.5f)

    fun ttsPitch(c: Context): Float =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getFloat(KEY_TTS_PITCH, 1f).coerceIn(0.5f, 2.5f)

    fun setTts(c: Context, on: Boolean, rate: Float, pitch: Float) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_TTS_ON, on)
            .putFloat(KEY_TTS_RATE, rate.coerceIn(0.5f, 2.5f))
            .putFloat(KEY_TTS_PITCH, pitch.coerceIn(0.5f, 2.5f))
            .apply()
    }

    /** 按住到开始收音的延迟：默认 180 ms，0 表示按下即开麦。 */
    fun holdDelayMs(c: Context): Int =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getInt(KEY_HOLD_DELAY, 180).coerceIn(0, 2000)

    fun setHoldDelayMs(c: Context, v: Int) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putInt(KEY_HOLD_DELAY, v.coerceIn(0, 2000)).apply()
    }

    /** 桌宠大小：默认 3.5 倍（PC 上的窗口缩放原值）。 */
    fun scale(c: Context): Float =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getFloat(KEY_SCALE, 3.5f).coerceIn(0.8f, 8f)

    fun setScale(c: Context, v: Float) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putFloat(KEY_SCALE, v.coerceIn(0.8f, 8f)).apply()
    }

    /** 拖动取消阈值（dp）：手指按住她移动超过这个距离，就不算"按住说话"了。 */
    fun dragCancelDp(c: Context): Int =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getInt(KEY_DRAG_CANCEL, 40).coerceIn(8, 200)

    fun setDragCancelDp(c: Context, v: Int) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putInt(KEY_DRAG_CANCEL, v.coerceIn(8, 200)).apply()
    }

    /** 默认主机：没设置过就用它（与 MainActivity.DEFAULT_HOST 保持一致）。 */
    const val DEFAULT_HOST = "192.168.1.100"

    /** PC 地址：用户没设置过时回落到 [DEFAULT_HOST]，不要返回空串。 */
    fun pcHost(c: Context): String =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_HOST, "")?.ifBlank { DEFAULT_HOST }
            ?: DEFAULT_HOST

    fun setPcHost(c: Context, v: String) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY_HOST, v).apply()
    }

    fun overlay(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY_OVERLAY, false)

    fun setOverlay(c: Context, v: Boolean) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(KEY_OVERLAY, v).apply()
    }

    /**
     * 本机模式：核心跑在平板自己身上（proot 里的 Node），界面直连 127.0.0.1:7797。
     * 默认开 —— 这是"整机搬到平板"的形态；需要时可以在菜单里切回 PC 模式。
     */
    fun localMode(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean(KEY_LOCAL, true)

    fun setLocalMode(c: Context, v: Boolean) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean(KEY_LOCAL, v).apply()
    }

    /**
     * 桌宠活动范围：她在屏幕上允许出现的横向区间，单位是屏宽的百分比 [left, right]。
     *
     * 横屏和竖屏分开存 —— 横屏时左右更宽、需要留出给别人操作的区域，跟她站在竖屏底部时的
     * 需求不一样。默认整屏（0..100），即不限制。
     */
    fun range(c: Context): Pair<Int, Int> {
        val land = c.resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val s = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .getString(if (land) KEY_RANGE_LAND else KEY_RANGE_PORT, null) ?: return 0 to 100
        val parts = s.split(',').mapNotNull { it.trim().toIntOrNull() }
        if (parts.size != 2) return 0 to 100
        return normRange(parts[0], parts[1])
    }

    fun setRange(c: Context, left: Int, right: Int) {
        val land = c.resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE
        val (l, r) = normRange(left, right)
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString(if (land) KEY_RANGE_LAND else KEY_RANGE_PORT, "$l,$r").apply()
    }

    /** 把任意输入夹成 [0..100] 且至少留 8% 宽，避免把活动范围收成一条线。 */
    fun normRange(left: Int, right: Int): Pair<Int, Int> {
        var l = left.coerceIn(0, 100)
        var r = right.coerceIn(0, 100)
        if (l > r) { val t = l; l = r; r = t }
        if (r - l < 8) {
            r = (l + 8).coerceAtMost(100)
            l = (r - 8).coerceAtLeast(0)
        }
        return l to r
    }

    /**
     * 左上角那个入口有没有被点过。没点过就一直给它"招手"（呼吸动画 + 更直白的文案），
     * 点过一次就收起来，免得老用户看着闪。
     */
    fun entrySeen(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean("entry_seen", false)

    fun markEntrySeen(c: Context) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean("entry_seen", true).apply()
    }

    /**
     * 用户是不是想开着"实时看屏幕"。
     *
     * Android 14 起屏幕一关，投屏会话就被系统收掉（屏幕不可见就不许投射），重新开必须
     * 再弹一次授权。这个标记让 app 回到前台时自动把授权框再要一次，用户点一下就行，
     * 不用自己去面板里翻开关。
     */
    fun screenWant(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean("screen_want", false)

    fun setScreenWant(c: Context, on: Boolean) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean("screen_want", on).apply()
    }

    /**
     * 看屏幕期间要不要让屏幕别灭。
     *
     * 屏幕一灭投影就断（系统行为，改不了），所以想长时间连着看，就得让屏幕亮着。
     * 默认关：由用户自己决定要不要为此多耗电。
     */
    fun screenKeepOn(c: Context): Boolean =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).getBoolean("screen_keepon", false)

    fun setScreenKeepOn(c: Context, on: Boolean) {
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putBoolean("screen_keepon", on).apply()
    }
}