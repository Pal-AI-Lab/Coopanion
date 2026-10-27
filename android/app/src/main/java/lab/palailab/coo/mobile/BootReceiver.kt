package lab.palailab.coo.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 开机（或本应用被覆盖安装后）把本机核心拉起来 —— 桌宠是"常驻"的东西，
 * 不该等用户点开 App 才醒。
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }
        if (!Prefs.localMode(context)) {
            Log.i("CooBoot", "PC 模式，不在本机起核心")
            return
        }
        Log.i("CooBoot", "boot: $action → 启动本机核心")
        runCatching { CoreService.start(context) }
    }
}