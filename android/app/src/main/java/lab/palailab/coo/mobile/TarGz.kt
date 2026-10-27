package lab.palailab.coo.mobile

import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.zip.GZIPInputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.attribute.PosixFilePermission

/**
 * 自己写的 tar.gz 解包器。
 *
 * 为什么不用系统的 tar：Android 的 toybox tar 会拒绝绝对符号链接
 * （Ubuntu rootfs 里有 20 个，比如 `/etc/rmt -> /usr/sbin/rmt`），
 * 解到一半直接报 "not under ..." 失败。这里按 POSIX ustar 自己解，
 * 绝对链接只是建一个符号链接，不需要特殊权限。
 *
 * 支持：普通文件、目录、符号链接、硬链接、GNU 长文件名(?L/?K)、pax 头(?x)；
 * 保留权限位（/bin 下的可执行位必须留住，否则 guest 里跑不了）。
 */
object TarGz {

    private const val TAG = "CooTar"
    private const val BLOCK = 512
    private const val BUF = 1 shl 18

    /** @param onProgress (已解出字节数, 总字节数) */
    fun extract(tarGz: File, dest: File, onProgress: (Long, Long) -> Unit = { _, _ -> }): Boolean =
        extractStream(tarGz.inputStream(), tarGz.length(), dest, onProgress)

    /** 直接从 assets 流解包，省掉"先复制一份 433MB 到 filesDir"的磁盘与时间。 */
    fun extractFrom(
        input: java.io.InputStream,
        totalBytes: Long,
        dest: File,
        onProgress: (Long, Long) -> Unit = { _, _ -> },
    ): Boolean = extractStream(input, totalBytes, dest, onProgress)

    private fun extractStream(
        input: java.io.InputStream,
        total: Long,
        dest: File,
        onProgress: (Long, Long) -> Unit,
    ): Boolean {
        var done = 0L
        dest.mkdirs()
        val destRoot = dest.canonicalFile.toPath()

        GZIPInputStream(BufferedInputStream(input, BUF), BUF).use { gz ->
            val head = ByteArray(BLOCK)
            var longName: String? = null
            var longLink: String? = null
            var paxPath: String? = null
            var paxLink: String? = null

            while (true) {
                if (!readFully(gz, head)) break
                if (head.all { it == 0.toByte() }) break // 末尾的零块

                var name = str(head, 0, 100)
                val mode = octal(head, 100, 8)
                var size = octal(head, 124, 12)
                val type = head[156].toInt().toChar()
                var link = str(head, 157, 100)
                val magic = str(head, 257, 6)
                val prefix = if (magic.startsWith("ustar")) str(head, 345, 155) else ""

                // 大文件用 base-256 编码
                if (head[124].toInt() and 0x80 != 0) {
                    size = 0L
                    for (i in 125 until 136) size = (size shl 8) or (head[i].toInt() and 0xFF).toLong()
                }

                if (prefix.isNotEmpty()) name = "$prefix/$name"
                if (longName != null) { name = longName!!; longName = null }
                if (longLink != null) { link = longLink!!; longLink = null }
                if (paxPath != null) { name = paxPath!!; paxPath = null }
                if (paxLink != null) { link = paxLink!!; paxLink = null }

                name = name.substringBefore('\u0000')
                link = link.substringBefore('\u0000')
                val rel = name.removePrefix("./").trimEnd('/')
                val payloadBlocks = ((size + BLOCK - 1) / BLOCK) * BLOCK

                when (type) {
                    'L' -> { longName = readStringBody(gz, size); skip(gz, payloadBlocks - size); continue }
                    'K' -> { longLink = readStringBody(gz, size); skip(gz, payloadBlocks - size); continue }
                    'x' -> {
                        val (p, l) = parsePax(readStringBody(gz, size))
                        if (p != null) paxPath = p
                        if (l != null) paxLink = l
                        skip(gz, payloadBlocks - size)
                        continue
                    }
                    'g' -> { skip(gz, payloadBlocks); continue }
                }

                if (rel.isEmpty() || rel == ".") {
                    skip(gz, payloadBlocks)
                    done += payloadBlocks
                    onProgress(done, total)
                    continue
                }
                val target: Path = destRoot.resolve(rel).normalize()
                if (!target.startsWith(destRoot)) {
                    Log.w(TAG, "跳过越界条目：$rel")
                    skip(gz, payloadBlocks)
                    continue
                }

                when (type) {
                    '5' -> Files.createDirectories(target)
                    '2' -> {
                        Files.createDirectories(target.parent)
                        runCatching {
                            Files.deleteIfExists(target)
                            Files.createSymbolicLink(target, Paths.get(link))
                        }.onFailure { Log.w(TAG, "符号链接失败 $rel -> $link: ${it.message}") }
                    }
                    '1' -> {
                        Files.createDirectories(target.parent)
                        val src = destRoot.resolve(link.removePrefix("./")).normalize()
                        runCatching {
                            Files.deleteIfExists(target)
                            Files.createLink(target, src)
                        }.onFailure {
                            // 跨设备等情况退化为复制
                            runCatching {
                                Files.deleteIfExists(target)
                                Files.copy(src, target)
                            }
                        }
                    }
                    '0', '\u0000' -> {
                        Files.createDirectories(target.parent)
                        BufferedOutputStream(FileOutputStream(target.toFile()), BUF).use { out ->
                            copyExactly(gz, out, size)
                        }
                        applyMode(target, mode)
                    }
                    else -> skip(gz, payloadBlocks) // 设备节点等，rootfs 里用不到
                }
                if (type != '0' && type != '\u0000') applyMode(target, mode)

                done += payloadBlocks
                onProgress(done, total)
            }
        }
        return true
    }

    private fun applyMode(p: Path, mode: Long) {
        val perms = mutableSetOf<PosixFilePermission>()
        if (mode and 0x100 != 0L) perms += PosixFilePermission.OWNER_READ
        if (mode and 0x80 != 0L) perms += PosixFilePermission.OWNER_WRITE
        if (mode and 0x40 != 0L) perms += PosixFilePermission.OWNER_EXECUTE
        if (mode and 0x20 != 0L) perms += PosixFilePermission.GROUP_READ
        if (mode and 0x10 != 0L) perms += PosixFilePermission.GROUP_WRITE
        if (mode and 0x8 != 0L) perms += PosixFilePermission.GROUP_EXECUTE
        if (mode and 0x4 != 0L) perms += PosixFilePermission.OTHERS_READ
        if (mode and 0x2 != 0L) perms += PosixFilePermission.OTHERS_WRITE
        if (mode and 0x1 != 0L) perms += PosixFilePermission.OTHERS_EXECUTE
        runCatching { Files.setPosixFilePermissions(p, perms) }
    }

    /**
     * GNU 的 'L'/'K' 长名头：body 是按块补齐的，尾部全是 NUL，必须截断。
     */
    private fun readStringBody(ins: java.io.InputStream, size: Long): String {
        val b = ByteArray(size.toInt())
        var off = 0
        while (off < b.size) {
            val n = ins.read(b, off, b.size - off)
            if (n < 0) break
            off += n
        }
        return String(b, 0, off, Charsets.UTF_8).substringBefore('\u0000')
    }

    /**
     * pax 扩展头：每条记录是 "<长度> <key>=<value>\n"，长度含长度字段自身。
     */
    private fun parsePax(blob: String): Pair<String?, String?> {
        var path: String? = null
        var link: String? = null
        var i = 0
        while (i < blob.length) {
            val sp = blob.indexOf(' ', i)
            if (sp < 0) break
            val len = blob.substring(i, sp).trim().toIntOrNull() ?: break
            if (len <= 0 || i + len > blob.length) break
            val rec = blob.substring(sp + 1, i + len).trimEnd('\n')
            val eq = rec.indexOf('=')
            if (eq > 0) {
                when (rec.substring(0, eq)) {
                    "path" -> path = rec.substring(eq + 1)
                    "linkpath" -> link = rec.substring(eq + 1)
                }
            }
            i += len
        }
        return path to link
    }

    private fun copyExactly(ins: java.io.InputStream, out: java.io.OutputStream, size: Long) {
        var left = size
        val buf = ByteArray(BUF)
        while (left > 0) {
            val n = ins.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
            if (n < 0) break
            out.write(buf, 0, n)
            left -= n
        }
        val pad = ((size + BLOCK - 1) / BLOCK * BLOCK) - size
        if (pad > 0) skip(ins, pad)
    }

    private fun skip(ins: java.io.InputStream, count: Long) {
        var left = count
        while (left > 0) {
            val n = ins.skip(left)
            if (n <= 0) {
                if (ins.read() < 0) return
                left -= 1
            } else left -= n
        }
    }

    private fun readFully(ins: java.io.InputStream, buf: ByteArray): Boolean {
        var off = 0
        while (off < buf.size) {
            val n = ins.read(buf, off, buf.size - off)
            if (n < 0) return off != 0 && false
            off += n
        }
        return true
    }

    private fun str(b: ByteArray, off: Int, len: Int): String {
        val end = (off until off + len).firstOrNull { b[it] == 0.toByte() } ?: (off + len)
        return String(b, off, end - off, Charsets.UTF_8)
    }

    private fun octal(b: ByteArray, off: Int, len: Int): Long {
        var v = 0L
        for (i in off until off + len) {
            val c = b[i].toInt()
            if (c == 0 || c == ' '.code) continue
            if (c < '0'.code || c > '7'.code) break
            v = v * 8 + (c - '0'.code)
        }
        return v
    }
}