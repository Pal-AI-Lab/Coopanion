package lab.palailab.coo.mobile

/**
 * 本机反代的唯一持有者。
 *
 * 全屏页（MainActivity）和悬浮窗（OverlayPetService）跑在**同一个进程**里，
 * 而本机反代只能占用一个端口（127.0.0.1:17789）。以前两边各自 new 一个 LocalProxy：
 * 第二个 bind 失败时是**静默**的（LocalProxy.start 里 catch 了 IOException，只把
 * running 置 false），表现就是后来者页面一片空白，非常难查。
 *
 * 现在统一走这里：按持有者名字登记（重复 acquire 不会重复计数），
 * 最后一个持有者 release 时才真正关掉。
 */
object ProxyHub {
    private var proxy: LocalProxy? = null
    private val holders = linkedSetOf<String>()

    @Synchronized
    fun acquire(host: String, holder: String): LocalProxy {
        val p = proxy
        if (p != null && p.targetHost == host) {
            holders.add(holder)
            return p
        }
        // 主机换了（或还没起）：停掉旧的，按新主机重来
        if (p != null) {
            p.stop()
            proxy = null
        }
        val fresh = LocalProxy(host)
        fresh.start()
        proxy = fresh
        holders.clear()
        holders.add(holder)
        return fresh
    }

    @Synchronized
    fun release(holder: String) {
        holders.remove(holder)
        if (holders.isEmpty()) {
            proxy?.stop()
            proxy = null
        }
    }

    /** 全部停掉（切主机/彻底断开时用）。 */
    @Synchronized
    fun stopAll() {
        proxy?.stop()
        proxy = null
        holders.clear()
    }
}