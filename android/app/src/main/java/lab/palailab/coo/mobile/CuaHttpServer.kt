package lab.palailab.coo.mobile

import android.content.Context
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket

/**
 * 安卓 CUA 接头的 HTTP 端点（只监听 127.0.0.1）。
 *
 * proot 里的 world 引擎（`src/cua/engine/android.ts`）就是照 PC 版 win32.ts 的形状调这里，
 * 所以插件（world/bot 扩展）一行都不用改 —— 它们看到的还是"能截图、能点"的 CUA。
 *
 * 端点：
 *   GET  /health                      → {"ok":true,"ready":true}
 *   GET  /size                        → {"width":3200,"height":2136}
 *   GET  /screen?max=1280&q=75        → image/jpeg
 *   GET  /ui                          → [{"text":"设置","x":..,"y":..,"w":..,"h":..}, ...]
 *   POST /tap    {"x":100,"y":200}    → {"ok":true}
 *   POST /swipe  {"x1":..,"y1":..,"x2":..,"y2":..,"ms":300}
 *   POST /path   {"points":[[x,y],..],"ms":600}
 */
object CuaHttpServer {
    private const val TAG = "CooCuaHttp"
    const val PORT = 18080

    @Volatile
    private var running = false
    private var server: ServerSocket? = null

    fun start(ctx: Context) {
        if (running) return
        running = true
        Thread({
            try {
                val ss = ServerSocket(PORT, 16, InetAddress.getByName("127.0.0.1"))
                server = ss
                Log.i(TAG, "CUA 接头在 127.0.0.1:$PORT 上等 proot 来调")
                while (running) {
                    val s = runCatching { ss.accept() }.getOrNull() ?: continue
                    Thread { runCatching { handle(s) }.onFailure { Log.w(TAG, "请求处理失败：${it.message}") } }.start()
                }
            } catch (e: Throwable) {
                Log.w(TAG, "接头停止：${e.message}")
            }
        }, "cua-http").start()
    }

    fun stop() {
        running = false
        runCatching { server?.close() }
        server = null
    }

    private fun handle(socket: Socket) {
        socket.use { s ->
            s.soTimeout = 15_000
            val input = BufferedInputStream(s.getInputStream())
            val out = BufferedOutputStream(s.getOutputStream())

            val requestLine = readLine(input) ?: return
            val parts = requestLine.split(' ')
            if (parts.size < 2) return
            val method = parts[0].uppercase()
            val path = parts[1].substringBefore('?')
            val query = parts[1].substringAfter('?', "")

            var contentLength = 0
            while (true) {
                val line = readLine(input) ?: break
                if (line.isEmpty()) break
                if (line.startsWith("Content-Length:", ignoreCase = true)) {
                    contentLength = line.substringAfter(':').trim().toIntOrNull() ?: 0
                }
            }
            val body = if (contentLength in 1..4_000_000) {
                val buf = ByteArray(contentLength)
                var read = 0
                while (read < contentLength) {
                    val n = input.read(buf, read, contentLength - read)
                    if (n <= 0) break
                    read += n
                }
                String(buf, 0, read, Charsets.UTF_8)
            } else ""

            val svc = CuaBridgeService.instance
            when {
                path == "/health" -> json(out, """{"ok":true,"ready":${svc != null}}""")
                path == "/size" -> {
                    val (w, h) = svc?.screenSize() ?: (0 to 0)
                    json(out, """{"width":$w,"height":$h}""")
                }
                path == "/ui" -> json(out, svc?.uiTree() ?: "[]")
                path == "/screen" -> {
                    val max = queryParam(query, "max")?.toIntOrNull() ?: 1280
                    val q = queryParam(query, "q")?.toIntOrNull() ?: 75
                    if (queryParam(query, "raw") == "1") {
                        // 原始 RGBA（8 字节宽高头 + 像素）：给 proot 里的引擎，不用解码。
                        // 实时流在跑就直接给最近一帧，否则回退无障碍按张截图。
                        val raw = ScreenStream.rgba() ?: svc?.screenshotRaw(max)
                        if (raw == null) json(out, """{"ok":false,"error":"screenshot-failed"}""", 503)
                        else bytes(out, raw, "application/octet-stream")
                    } else {
                        // 实时流在跑就拿最近一帧（几毫秒）；不在跑才回退到无障碍截图（约 500ms）
                        val live = ScreenStream.jpeg(max, q)
                        if (live != null) {
                            bytes(out, live, "image/jpeg")
                        } else if (svc == null) {
                            json(out, """{"ok":false,"error":"no-accessibility-service"}""", 503)
                        } else {
                            val jpg = svc.screenshot(max, q)
                            if (jpg == null) json(out, """{"ok":false,"error":"screenshot-failed"}""", 503)
                            else bytes(out, jpg, "image/jpeg")
                        }
                    }
                }
                // 只要实时帧：流没开就明说，别偷偷回退成慢截图
                path == "/frame" -> {
                    val max = queryParam(query, "max")?.toIntOrNull() ?: 1280
                    val q = queryParam(query, "q")?.toIntOrNull() ?: 75
                    val jpg = ScreenStream.jpeg(max, q)
                    if (jpg == null) json(out, """{"ok":false,"error":"no-live-stream"}""", 503)
                    else bytes(out, jpg, "image/jpeg")
                }
                path == "/live" -> json(out, ScreenStream.statusJson())
                // 浏览器直接打开的实时画面（multipart/x-mixed-replace）
                path == "/stream" -> {
                    mjpeg(out, query)
                    return
                }
                method == "POST" && path == "/tap" -> {
                    val j = runCatching { JSONObject(body) }.getOrNull()
                    val ok = svc != null && j != null &&
                        svc.tap(j.optDouble("x").toFloat(), j.optDouble("y").toFloat(), j.optLong("ms", 60))
                    json(out, """{"ok":$ok}""", if (ok) 200 else 409)
                }
                method == "POST" && path == "/swipe" -> {
                    val j = runCatching { JSONObject(body) }.getOrNull()
                    val ok = svc != null && j != null && svc.swipe(
                        j.optDouble("x1").toFloat(), j.optDouble("y1").toFloat(),
                        j.optDouble("x2").toFloat(), j.optDouble("y2").toFloat(),
                        j.optLong("ms", 300),
                    )
                    json(out, """{"ok":$ok}""", if (ok) 200 else 409)
                }
                method == "POST" && path == "/path" -> {
                    val j = runCatching { JSONObject(body) }.getOrNull()
                    val pts = mutableListOf<FloatArray>()
                    j?.optJSONArray("points")?.let { arr ->
                        for (i in 0 until arr.length()) {
                            val p = arr.optJSONArray(i) ?: continue
                            pts.add(floatArrayOf(p.optDouble(0).toFloat(), p.optDouble(1).toFloat()))
                        }
                    }
                    val ok = svc != null && pts.size >= 2 && svc.path(pts, j?.optLong("ms", 600) ?: 600)
                    json(out, """{"ok":$ok}""", if (ok) 200 else 409)
                }
                else -> json(out, """{"ok":false,"error":"not-found"}""", 404)
            }
        }
    }

    /**
     * 实时画面：multipart/x-mixed-replace，浏览器 / ffplay / 任何 <img> 直接能看。
     * 每帧都取 ScreenStream 的最近一张，所以推得快慢只由 ?fps= 决定（默认 4，最多 15）。
     */
    private fun mjpeg(out: BufferedOutputStream, query: String) {
        val max = queryParam(query, "max")?.toIntOrNull() ?: 1280
        val q = queryParam(query, "q")?.toIntOrNull() ?: 70
        val fps = (queryParam(query, "fps")?.toDoubleOrNull() ?: 4.0).coerceIn(1.0, 15.0)
        out.write(
            (
                "HTTP/1.1 200 OK\r\n" +
                    "Content-Type: multipart/x-mixed-replace; boundary=cooframe\r\n" +
                    "Cache-Control: no-store\r\n" +
                    "Connection: close\r\n\r\n"
                ).toByteArray(),
        )
        out.flush()
        val gap = (1000.0 / fps).toLong()
        var last = 0L
        while (ScreenStream.running) {
            val jpg = ScreenStream.jpeg(max, q)
            if (jpg == null) {
                Thread.sleep(150)
                continue
            }
            val wait = gap - (SystemClock.elapsedRealtime() - last)
            if (wait > 0) Thread.sleep(wait)
            last = SystemClock.elapsedRealtime()
            out.write(
                "--cooframe\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.size}\r\n\r\n".toByteArray(),
            )
            out.write(jpg)
            out.write("\r\n".toByteArray())
            out.flush()
        }
    }

    private fun queryParam(query: String, name: String): String? =
        query.split('&').map { it.split('=', limit = 2) }
            .firstOrNull { it.size == 2 && it[0] == name }?.get(1)

    private fun readLine(input: BufferedInputStream): String? {
        val sb = StringBuilder()
        while (true) {
            val b = input.read()
            if (b < 0) return if (sb.isEmpty()) null else sb.toString()
            if (b == '\n'.code) return sb.toString().trimEnd('\r')
            if (b != '\r'.code) sb.append(b.toChar())
            if (sb.length > 8192) return sb.toString()
        }
    }

    private fun json(out: BufferedOutputStream, text: String, code: Int = 200) =
        bytes(out, text.toByteArray(Charsets.UTF_8), "application/json; charset=utf-8", code)

    private fun bytes(out: BufferedOutputStream, data: ByteArray, type: String, code: Int = 200) {
        val head = "HTTP/1.1 $code OK\r\nContent-Type: $type\r\nContent-Length: ${data.size}\r\n" +
            "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
        out.write(head.toByteArray(Charsets.US_ASCII))
        out.write(data)
        out.flush()
    }

    /** 一次把库里要的东西都取回来（调试用：curl http://127.0.0.1:18080/health）。 */
    fun debugState(): String = ByteArrayOutputStream().use { it.toString("utf-8") }
}