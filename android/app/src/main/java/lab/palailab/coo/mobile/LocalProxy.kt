package lab.palailab.coo.mobile

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/**
 * 手机本地反代：127.0.0.1:[LOCAL_PORT] -> PC 上 Coopanion 的 LAN 反代端口。
 *
 * 为什么要有它：
 *  1. WebView 访问 http://127.0.0.1 属于"安全上下文"，getUserMedia（麦克风）才允许用；
 *     直接访问 http://192.168.x.x 会被 Chromium 判为不安全来源，麦克风被禁。
 *  2. 每个请求的 Host / Origin 改写成 PC 上 PetServer 自己的 loopback origin，
 *     因为 PetServer 只认 loopback（防 DNS rebinding）。
 *  3. HTTP/1.1 的 keep-alive 改成 close，保证每个请求都经过一次改写。
 *  4. WebSocket 升级后原样双向转发（raw tunnel）。
 */
class LocalProxy(
    val targetHost: String,
    private val targetPort: Int = TARGET_PORT,
    private val listenPort: Int = LOCAL_PORT,
) {
    @Volatile
    private var running = false

    private var server: ServerSocket? = null

    fun start() {
        if (running) return
        running = true
        thread(isDaemon = true, name = "coo-proxy-accept") {
            try {
                val ss = ServerSocket()
                ss.reuseAddress = true
                ss.bind(InetSocketAddress("127.0.0.1", listenPort))
                server = ss
                while (running) {
                    val client = try {
                        ss.accept()
                    } catch (_: IOException) {
                        break
                    }
                    handle(client)
                }
            } catch (_: IOException) {
                running = false
            }
        }
    }

    fun stop() {
        running = false
        try {
            server?.close()
        } catch (_: IOException) {
        }
        server = null
    }

    private fun handle(client: Socket) {
        thread(isDaemon = true, name = "coo-proxy-conn") {
            var upstream: Socket? = null
            try {
                client.tcpNoDelay = true
                val cin = BufferedInputStream(client.getInputStream())
                val head = readHead(cin) ?: run {
                    client.close()
                    return@thread
                }
                val text = String(head, Charsets.ISO_8859_1)
                upstream = Socket()
                upstream.tcpNoDelay = true
                upstream.connect(InetSocketAddress(targetHost, targetPort), 8000)
                val uout = upstream.getOutputStream()
                uout.write(rewrite(text).toByteArray(Charsets.ISO_8859_1))
                uout.flush()
                val uin = upstream.getInputStream()
                val cout = client.getOutputStream()

                val up = upstream
                thread(isDaemon = true, name = "coo-proxy-up") {
                    copy(cin, uout)
                    try {
                        up.close()
                    } catch (_: IOException) {
                    }
                }
                copy(uin, cout)
                try {
                    client.close()
                } catch (_: IOException) {
                }
            } catch (_: IOException) {
            } finally {
                try {
                    upstream?.close()
                } catch (_: IOException) {
                }
                try {
                    client.close()
                } catch (_: IOException) {
                }
            }
        }
    }

    /** 读到 \r\n\r\n 为止（含），上限 128 KiB；没有内容时返回 null。 */
    private fun readHead(input: InputStream): ByteArray? {
        val out = ByteArrayOutputStream(2048)
        var state = 0
        while (true) {
            val b = input.read()
            if (b < 0) return if (out.size() == 0) null else out.toByteArray()
            out.write(b)
            state = when {
                b == 13 && state == 0 -> 1
                b == 10 && state == 1 -> 2
                b == 13 && state == 2 -> 3
                b == 10 && state == 3 -> 4
                else -> 0
            }
            if (state == 4) return out.toByteArray()
            if (out.size() > 131072) return out.toByteArray()
        }
    }

    private fun rewrite(head: String): String {
        val isUpgrade = head.contains("upgrade:", ignoreCase = true) || head.contains("sec-websocket-key", ignoreCase = true)
        val lines = head.split("\r\n")
        val sb = StringBuilder(head.length + 64)
        for ((i, line) in lines.withIndex()) {
            if (i > 0) sb.append("\r\n")
            if (line.isEmpty()) continue
            val lower = line.lowercase()
            when {
                lower.startsWith("host:") -> sb.append("Host: ").append(REWRITE_HOST)
                // `Origin: null` 来自沙箱 iframe（不透明来源）：服务器对它回
                // `Access-Control-Allow-Origin: null`，形象包的 module/图片才过得去。
                // 一旦改写成 loopback，服务器就不回 ACAO，figure 脚本被 CORS 拦掉。
                lower.startsWith("origin:") && line.substringAfter(':').trim() != "null" ->
                    sb.append("Origin: http://").append(REWRITE_HOST)
                lower.startsWith("connection:") && !isUpgrade -> sb.append("Connection: close")
                else -> sb.append(line)
            }
        }
        return sb.toString().let { out ->
            // 给 PC 反代一个"这是手机"的标记：它据此把「按住说话」脚本注入 /web/pet-app.js
            if (!isUpgrade && out.endsWith("\r\n\r\n"))
                out.dropLast(4) + "\r\nX-Coo-Mobile: 1\r\n\r\n"
            else out
        }
    }

    private fun copy(from: InputStream, to: OutputStream) {
        val buf = ByteArray(32 * 1024)
        try {
            while (true) {
                val n = from.read(buf)
                if (n <= 0) break
                to.write(buf, 0, n)
                to.flush()
            }
        } catch (_: IOException) {
        }
    }

    companion object {
        /**
         * 手机本地端口（WebView 访问这个）。
         *
         * 不能用 7797：那是 PC 上 PetServer 的端口，平板上 7797 已被另一个应用占用
         * （实测 uid 10312，任何路径都回 404）。
         *
         * `/figure-frame` 的 CSP 把 `script-src` 写死成 `http://127.0.0.1:7797`，
         * 若端口不一致，形象包的沙箱 iframe 脚本会被 CSP 拦掉，表现是宠物本体永远不出现、
         * 20 秒后报"形象没有准备好"。所以由 PC 侧反代（tools/lan-proxy.py 的
         * rewrite_response_head）把响应头里的 `127.0.0.1:7797` 改写成
         * `127.0.0.1:<本端口>`，手机这边不必操心。
         */
        const val LOCAL_PORT = 17789

        /** PC 上 Coopanion LAN 反代（tools/lan-proxy.py）的端口。 */
        const val TARGET_PORT = 17789

        /** PC 上宠物页服务（PetServer）的 origin 主机端口，PC 端只认 loopback。 */
        const val REWRITE_HOST = "127.0.0.1:7797"
    }
}