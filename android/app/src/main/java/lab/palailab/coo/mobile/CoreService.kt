package lab.palailab.coo.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * 本机核心的前台服务：负责解包 + 拉起 proot 里的 Node 核心，并让它一直活着。
 *
 * 为什么要前台服务：核心是一个常驻进程，被系统回收掉宠物就"死"了；
 * 前台服务带常驻通知，同时也满足 Android 14+ 对长时间运行的要求。
 */
class CoreService : Service() {

    @Volatile
    private var busy = false

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIF_ID, notification("正在准备本机核心…"))
        boot()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_RESTART -> {
                Thread {
                    CoreRuntime.stop()
                    Thread.sleep(800)
                    boot()
                }.start()
            }
            ACTION_STOP -> {
                CoreRuntime.stop()
                updateNotification("本机核心已停止")
                stopSelf()
            }
            else -> if (!CoreRuntime.isAlive()) boot()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        // 用户主动退出应用时不要杀掉核心：悬浮桌宠还要用。只有 stopSelf 才收。
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun boot() {
        if (busy) return
        busy = true
        Thread {
            try {
                if (!CoreRuntime.ensureExtracted(this) { step ->
                        Log.i(TAG, "解包：$step")
                        updateNotification(step)
                    }
                ) {
                    updateNotification("运行时解包失败，看日志")
                    return@Thread
                }
                if (CoreRuntime.portOpen()) {
                    updateNotification("本机核心已在运行 · 127.0.0.1:${CoreRuntime.PORT}")
                    return@Thread
                }
                updateNotification("正在启动本机核心…")
                if (!CoreRuntime.start(this)) {
                    updateNotification("核心启动失败，看日志")
                    return@Thread
                }
                val ok = CoreRuntime.waitReady(90_000)
                updateNotification(
                    if (ok) "本机核心就绪 · 127.0.0.1:${CoreRuntime.PORT}"
                    else "核心 90 秒没起来，看日志",
                )
                Log.i(TAG, "core ready=$ok")
            } catch (t: Throwable) {
                Log.e(TAG, "boot 失败：${t.message}", t)
                updateNotification("核心异常：${t.message}")
            } finally {
                busy = false
            }
        }.start()
    }

    private fun notification(text: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            nm.getNotificationChannel(CHANNEL) == null
        ) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "本机核心", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val restart = PendingIntent.getService(
            this, 1, Intent(this, CoreService::class.java).setAction(ACTION_RESTART),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Coo · 本机核心")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "重启核心", restart).build())
            .build()
    }

    private fun updateNotification(text: String) {
        runCatching {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, notification(text))
        }
    }

    companion object {
        private const val TAG = "CooCoreSvc"
        private const val CHANNEL = "coo-core"
        private const val NOTIF_ID = 4701
        const val ACTION_RESTART = "lab.palailab.coo.mobile.RESTART_CORE"
        const val ACTION_STOP = "lab.palailab.coo.mobile.STOP_CORE"

        fun start(ctx: android.content.Context) {
            val i = Intent(ctx, CoreService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i)
            else ctx.startService(i)
        }
    }
}