package lab.palailab.coo.mobile

import android.content.Context
import android.util.Log
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Paths

/**
 * 本机核心：把 Coopanion 的 Node 核心跑在平板自己身上。
 *
 * 原理：Android 的 libc 是 bionic，官方 node 的 linux-arm64 二进制（glibc）不能直接执行。
 * 所以 APK 里带一套 proot + Ubuntu arm64 的 rootfs，核心在那个用户态里跑，
 * 出来的 7797 端口就是本机的宠物页 —— 不需要 PC，也不需要反代。
 *
 * 目录：
 *   filesDir/runtime/rootfs/...          解包出来的 Linux 用户态（含 node 与 coopanion）
 *   filesDir/runtime/rootfs/opt/coopanion/app   应用树（core/、node_modules/）
 *   filesDir/runtime/rootfs/opt/coopanion/home  她的记忆与配置（CORTICO_HOME）
 *   filesDir/lib/libtalloc.so.2          proot 的 DT_NEEDED 要这个名字
 *   filesDir/core.log                    核心日志
 */
object CoreRuntime {

    /** 宠物页端口（与上游 PetServer 一致，页面里的 CSP 也写死了这个端口）。 */
    const val PORT = 7797

    private const val TAG = "CooCore"
    private const val ASSET = "runtime.tgz"

    /** 运行时内容一变就改这个号：下次启动会重新解包。 */
    const val VERSION = "2026-10-27.3"

    @Volatile
    private var proc: Process? = null

    fun root(c: Context): File = File(c.filesDir, "runtime")
    fun rootfs(c: Context): File = File(root(c), "rootfs")
    fun logFile(c: Context): File = File(c.filesDir, "core.log")
    private fun versionFile(c: Context) = File(root(c), ".version")

    /** 解包完成且版本一致。 */
    fun isExtracted(c: Context): Boolean {
        if (!File(rootfs(c), "opt/coopanion/app/core/boot.ts").isFile) return false
        val v = versionFile(c)
        return v.isFile && v.readText().trim() == VERSION
    }

    fun isAlive(): Boolean = proc?.isAlive == true

    /** 核心日志最后几行，给界面显示进度用。 */
    fun logTail(c: Context, lines: Int = 8): String = runCatching {
        logFile(c).readLines().takeLast(lines).joinToString("\n")
    }.getOrDefault("")

    /**
     * 首次启动（或版本变了）时把 assets 里的运行时解包到 filesDir。
     * 700MB 左右，平板上大约 1-2 分钟；期间界面显示进度。
     */
    fun ensureExtracted(c: Context, onStep: (String) -> Unit = {}): Boolean {
        if (isExtracted(c)) {
            // 已经解过：只补幂等的整理动作（node 软链），几乎不花时间
            prepareNode(c, rootfs(c))
            return true
        }
        val root = root(c)
        onStep("清理旧运行时…")
        root.deleteRecursively()
        root.mkdirs()
        // tar 里是 rootfs 的“内容”（./bin ./etc …），所以解到 root/rootfs 下
        val dest = File(root, "rootfs").apply { mkdirs() }

        // 直接流式解包，不再往 filesDir 复制一份 433MB
        onStep("解包运行时…")
        val totalBytes = runCatching { c.assets.openFd(ASSET).use { it.length } }.getOrDefault(0L)
        // 上一次失败留下的整包副本（旧版本才会产生），顺手清掉
        runCatching { File(c.filesDir, "runtime.tar.gz").takeIf { it.isFile }?.delete() }
        val ok = runCatching {
            c.assets.open(ASSET).use { ins ->
                TarGz.extractFrom(ins, totalBytes, dest) { done, _ ->
                    if (totalBytes > 0) onStep("解包 ${done * 100 / totalBytes}%")
                }
            }
        }.onFailure { Log.e(TAG, "解包异常：${it.message}", it) }.getOrDefault(false)
        if (!ok) {
            Log.e(TAG, "解包失败：${logTail(c, 4)}")
            return false
        }
        versionFile(c).writeText(VERSION)
        // 解包后补几件小事：DNS、node 目录归一化、宿主库名
        writeResolv(dest)
        prepareNode(c, dest)
        onStep("就绪")
        return isExtracted(c)
    }

    /**
     * 平板上没有键盘：桌面版靠全局说话键（X11 热键）开闸，这里用不了，hold 模式于是
     * 收得到字却提交不出句子（松开只 flush，流式识别器要靠静音自己断句）。改成 always
     * 模式，由 VAD 自己断句提交，麦克风常开——平板上的自然用法。
     * 只在还是 hold 的原始配置上动手，用户之后自己改过就不碰。
     */
    private fun tunePetConfig(rootfs: File) {
        runCatching {
            val f = File(rootfs, "opt/coopanion/home/companion/config.json")
            if (!f.isFile || f.length() > 4L * 1024 * 1024) return
            val s = f.readText()
            var out = s
            // 平板上没有说话键：hold/toggle 这两种老语义根本用不了，所以首次启动做一次性迁移 ——
            // 模式改成「手势收音」（gesture），并把语音总开关打开。
            // ★ 迁过之后就不再插手：语音按钮是三段切换（关闭 / 手势收音 / 持续收音），
            //   老大关掉或选了「持续」都得重启后保持，不能被启动逻辑改回去。
            val flag = File(f.parentFile, ".coo-voice-migrated")
            if (!flag.exists()) {
                val re = Regex("\"mic\"\\s*:\\s*\\{\\s*\"mode\"\\s*:\\s*\"(hold|toggle|always)\"")
                if (re.containsMatchIn(out)) out = re.replaceFirst(out, "\"mic\": {\"mode\": \"gesture\"")
                val asrOff = Regex("\"asr\"\\s*:\\s*\\{\\s*\"enabled\"\\s*:\\s*false")
                if (asrOff.containsMatchIn(out)) out = asrOff.replaceFirst(out, "\"asr\": {\"enabled\": true")
                runCatching { flag.writeText("1") }
                Log.i(TAG, "语音首次迁移：mic.mode → gesture，asr.enabled → true（之后交给三段按钮）")
            }
            if (out != s) f.writeText(out)
        }.onFailure { Log.w(TAG, "调整桌宠配置失败", it) }
    }

    /**
     * 她的自述与老大的档案里，「电脑」统一叫「设备」。
     *
     * 这两份文件是开机自述（CONSTITUTION.md）与伙伴档案（PARTNER.md），随 home 打进了 APK 资产；
     * 只在发现「电脑」时替换，幂等，且不动历史 handoff/日志。
     */
    private fun tuneWorkspaceMemory(rootfs: File) {
        val ws = File(rootfs, "opt/coopanion/home/companion/workspace")
        for (name in listOf("CONSTITUTION.md", "PARTNER.md")) {
            runCatching {
                val f = File(ws, name)
                if (!f.isFile || f.length() > 1L * 1024 * 1024) return@runCatching
                val s = f.readText()
                if (!s.contains("电脑") && !s.contains("左 Alt 按住说")) return@runCatching
                val out = s
                    .replace("电脑", "设备")
                    .replace(
                        "说话用语音输入（左 Alt 按住说）为主",
                        "说话用语音输入为主（在 PC 上按住左 Alt；在平板上先点一下我的身体、再按住我的身体说）",
                    )
                f.writeText(out)
                Log.i(TAG, "记忆用词：$name 已按平板说法对齐")
            }.onFailure { Log.w(TAG, "调整记忆用词失败：$name", it) }
        }
    }

    private fun prepareNode(c: Context, rootfs: File) {
        tunePetConfig(rootfs)
        tuneWorkspaceMemory(rootfs)
        installWorldPatches(c, rootfs)
        ensureNodeModules(c, rootfs)
        ensureCuaEsbuild(c, rootfs)
        runCatching {
            val opt = File(rootfs, "opt")
            val dirs = opt.listFiles()
                ?.filter { it.isDirectory && it.name.startsWith("node-v") && it.name.endsWith("-linux-arm64") }
                ?.sortedByDescending { v ->
                    // 按版本号倒序：每段补齐到 4 位再拼字符串，字符串比较即版本比较
                    vkey(v.name).joinToString(".") { it.toString().padStart(4, '0') }
                }
                ?: return@runCatching
            val node = dirs.firstOrNull() ?: return@runCatching
            // 资产里可能留着旧版本（比如顺手解过的 22.14），白占 150MB，直接清掉
            dirs.drop(1).forEach { old -> runCatching { old.deleteRecursively() } }
            val link = File(opt, "node")
            if (!link.exists()) runCatching {
                Files.createSymbolicLink(link.toPath(), Paths.get(node.name))
            }
            // PATH 首位是 /usr/local/bin，把 node/npm/npx 挂进去，省得依赖某个版本目录名
            val bin = File(rootfs, "usr/local/bin").apply { mkdirs() }
            for (n in listOf("node", "npm", "npx")) {
                val l = File(bin, n)
                if (!l.exists()) runCatching {
                    Files.createSymbolicLink(l.toPath(), Paths.get("/opt/node/bin/$n"))
                }
            }
            Log.i(TAG, "node = ${node.name}, link=${link.exists()}")
        }.onFailure { Log.w(TAG, "node 整理失败：${it.message}") }
    }

    /**
     * 平板专属的 World 补丁：上游只有 按住/切换/持续 三种收音模式，但它们都挂在键盘热键上，
     * 平板没有说话键。这里给 World 补一个「手势收音」（gesture）模式：
     * 只有按住她的身体时音频才进识别器，松手立即断句提交。
     *
     * 补丁随 APK 资产走（assets/coop/），每次启动覆盖写回应用树，
     * 所以重装 APK / 重新解包之后依旧是手势收音，不必再手工 adb push。
     */
    private fun installWorldPatches(c: Context, rootfs: File) {
        val app = File(rootfs, "opt/coopanion/app/node_modules/cortico-world-desktop-pet")
        if (!app.isDirectory) return
        val targets = mapOf(
            "coop/world.ts" to "src/world.ts",
            "coop/config.ts" to "src/config.ts",
            "coop/zh.ts" to "src/i18n/zh.ts",
            "coop/pet-app.js" to "web/pet-app.js",
            "coop/zh.js" to "web/i18n/zh.js",
            "coop/en.js" to "web/i18n/en.js",
            // 安卓 CUA 引擎：把"看屏幕/点击"接到 app 的无障碍接头上（见 CuaBridgeService）
            "coop/cua-android.ts" to "src/cua/engine/android.ts",
            // 让 CUA 在"linux 但没有 X11"的平板上不再判成不支持，否则工具根本挂不上
            "coop/cua.ts" to "src/cua/cua.ts",
            // 多一个 pet_cua_watch：连着看一小段（动的东西单张截图看不出来）
            "coop/cua-tools.ts" to "src/cua/tools.ts",
        )
        for ((asset, rel) in targets) {
            runCatching {
                val dst = File(app, rel)
                dst.parentFile?.mkdirs()
                c.assets.open(asset).use { i -> dst.outputStream().use { o -> i.copyTo(o, 64 * 1024) } }
            }.onFailure { Log.w(TAG, "写入世界补丁失败：$rel", it) }
        }
        patchCuaEngine(app)
        Log.i(TAG, "世界补丁已就位（手势收音 + 安卓 CUA 引擎）")
    }

    /**
         * CUA 子进程引擎要用 esbuild 转译 TS，而 esbuild 本体只是个外壳，
         * 真正的可执行文件在 `@esbuild/<平台>-<架构>` 包里面。平板上这个包根本不存在
         * （rootfs 是从 PC 拷来的），引擎一启动就 TransformError，工具全废。
         * 这里把 linux-arm64 那份（约 10 MB）跟着 APK 走，缺了就解到 node_modules 下。
         */
        private fun ensureCuaEsbuild(c: Context, rootfs: File) {
            val mods = File(rootfs, "opt/coopanion/app/node_modules")
            val shell = File(mods, "esbuild/package.json")
            if (!shell.isFile) return
            val ver = runCatching {
                Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(shell.readText())?.groupValues?.get(1)
            }.getOrNull() ?: return
            val dest = File(mods, "@esbuild/linux-arm64")
            val marker = File(dest, ".coop-ver")
            if (File(dest, "bin/esbuild").isFile && runCatching { marker.readText().trim() }.getOrNull() == ver) return
            runCatching {
                val tmp = File(mods, "@esbuild/__tmp")
                tmp.deleteRecursively()
                c.assets.open("coop/esbuild-arm64.tgz").use { input -> TarGz.extractFrom(input, 0L, tmp) }
                val inner = File(tmp, "package")
                if (!inner.isDirectory) error("esbuild 包里没有 package/")
                dest.deleteRecursively()
                dest.mkdirs()
                inner.copyRecursively(dest, overwrite = true)
                tmp.deleteRecursively()
                File(dest, "bin/esbuild").setExecutable(true, false)
                marker.writeText(ver)
                Log.i(TAG, "esbuild arm64 就位 = $ver")
            }.onFailure { Log.w(TAG, "装 esbuild arm64 失败", it) }
        }

        /**
         * 装 npm 与 corepack 进 rootfs 的 node 里。
     *
     * 平板上的 node 是从官方发行版精简来的：`/opt/node/lib/node_modules` 是个空目录，
     * 于是 `/opt/node/bin/{npm,npx,corepack}` 三个符号链接全是断的 —— 面板的「扩展市场」
     * 要 spawn corepack 做 npm 搜索，直接 `spawn corepack ENOENT`，市场永远是 0 个。
     *
     * 两个 tarball 跟着 APK 走（约 2.9 MB），首次启动解到 `/opt/node/lib/node_modules/` 下。
     * 解出来的目录顶层是 `package/`，重命名成包名即可（符号链接本来就这么指）。
     */
    private fun ensureNodeModules(c: Context, rootfs: File) {
        val dest = File(rootfs, "opt/node/lib/node_modules").apply { mkdirs() }
        // 版本标记：APK 里换了 npm/corepack，设备上旧的要重解一次（否则还留着老 keyid 的 corepack）
        val marker = File(dest, ".coop-ver")
        val want = "npm-10.9.2+corepack-0.36.0"
        if (runCatching { marker.readText().trim() }.getOrNull() == want) return
        for ((asset, pkg) in listOf("coop/npm.tgz" to "npm", "coop/corepack.tgz" to "corepack")) {
            val installed = File(dest, "$pkg/package.json")
            val tmp = File(dest, "__$pkg")
            runCatching {
                tmp.deleteRecursively()
                c.assets.open(asset).use { input -> TarGz.extractFrom(input, 0L, tmp) }
                val inner = File(tmp, "package")
                if (!inner.isDirectory) error("$asset 里没有 package/")
                File(dest, pkg).deleteRecursively()
                if (!inner.renameTo(File(dest, pkg))) error("重命名失败 $pkg")
            }.onFailure { Log.w(TAG, "装 $pkg 失败", it) }
            tmp.deleteRecursively()
            Log.i(TAG, "node_modules/$pkg = ${installed.exists()}")
        }
        runCatching { marker.writeText(want) }
        // 断掉的链接补一个 /usr/local/bin 副本（PATH 首位），面板 spawn 时更稳
        runCatching {
            val bin = File(rootfs, "usr/local/bin").apply { mkdirs() }
            for (n in listOf("corepack")) {
                val l = File(bin, n)
                if (!l.exists()) Files.createSymbolicLink(l.toPath(), Paths.get("/opt/node/bin/$n"))
            }
        }.onFailure { Log.w(TAG, "corepack 链接失败：${it.message}") }
    }

    /**
     * 让 CUA 的子进程引擎改用安卓那一套。
     *
     * 上游 `src/cua/engine-child.ts` 里是按 `process.platform` 三选一（darwin/linux/win32），
     * 平板上是 linux，于是它去调 X11 的 scrot/xdotool —— 一样都没有，CUA 全废。
     * 这里只在那一行的开头插一个判断（`COO_ANDROID_CUA` 由 CoreRuntime 放进环境变量），
     * 文件其余部分原样保留，所以上游更新时不会整段被我们覆盖掉。
     */
    private fun patchCuaEngine(app: File) {
        val f = File(app, "src/cua/engine-child.ts")
        if (!f.isFile) return
        runCatching {
            var s = f.readText()
            // 已经按正确形状改过了（必须连 `= ` 一起匹配 —— 早先的坏版本是
            // `= (process.env.COO_ANDROID_CUA ? ...`，光看后半段会误判成已修好而跳过）
            val good = "const os: typeof import('./engine/win32.ts') = process.env.COO_ANDROID_CUA ? await import('./engine/android.ts')"
            if (s.contains(good)) {
                Log.i(TAG, "CUA 引擎已是安卓分支")
                return@runCatching
            }
            // 把整个 `const os: ... = ...;` 语句换掉（早先版本只插了半句，括号没闭合，
            // esbuild 会报 Expected ")" — 这里按语句边界重建，坏过的也能修回来）
            val startMark = "const os: typeof import('./engine/win32.ts') ="
            val start = s.indexOf(startMark)
            val end = if (start >= 0) s.indexOf(';', start) else -1
            if (start < 0 || end < 0) {
                Log.w(TAG, "CUA 引擎结构变了，没敢打补丁")
                return@runCatching
            }
            val neu = "// 平板：开了 CUA 接头就用安卓引擎（engine/android.ts 走 127.0.0.1:18080），否则按平台挑\n" +
                "const os: typeof import('./engine/win32.ts') = process.env.COO_ANDROID_CUA ? await import('./engine/android.ts') " +
                ": process.platform === 'darwin' ? await import('./engine/darwin.ts') " +
                ": process.platform === 'linux' ? await import('./engine/linux.ts') " +
                ": await import('./engine/win32.ts');"
            s = s.substring(0, start) + neu + s.substring(end + 1)
            f.writeText(s)
            Log.i(TAG, "CUA 引擎已改指安卓接头")
        }.onFailure { Log.w(TAG, "CUA 引擎补丁失败", it) }
    }

    /** node-v22.23.4-linux-arm64 → [22,23,4]，用于挑最新 */
    private fun vkey(name: String): List<Int> =
        name.removePrefix("node-v").removeSuffix("-linux-arm64")
            .split('.').map { it.takeWhile(Char::isDigit).toIntOrNull() ?: 0 }

    private fun writeResolv(root: File) {
        runCatching {
            File(root, "etc").mkdirs()
            File(root, "etc/resolv.conf").writeText("nameserver 223.5.5.5\nnameserver 119.29.29.29\n")
        }
    }

    /**
     * 同一个包名内的 WebView 与核心在同机：直接连 127.0.0.1。
     * 起核心前先等端口空出来（上次的 proot 可能还在）。
     */
    fun start(c: Context): Boolean {
        if (isAlive() && portOpen()) return true
        val libDir = c.applicationInfo.nativeLibraryDir
        val proot = File(libDir, "libproot.so")
        val loader = File(libDir, "libprootloader.so")
        if (!proot.isFile || !loader.isFile) {
            Log.e(TAG, "缺少 proot 二进制：$libDir")
            return false
        }
        val rootfs = rootfs(c)
        val tmp = File(root(c), "tmp").apply { mkdirs() }
        val libFiles = File(c.filesDir, "lib").apply { mkdirs() }
        // DT_NEEDED 写的是 libtalloc.so.2，APK 的 lib 目录只认 lib*.so，这里复制一份真名。
        runCatching {
            val talloc = File(libDir, "libtalloc.so")
            if (!talloc.isFile) error("libtalloc.so 不在 $libDir")
            talloc.copyTo(File(libFiles, "libtalloc.so.2"), overwrite = true)
        }.onFailure { Log.e(TAG, "libtalloc 准备失败：${it.message}") }

        val cmd = listOf(
            proot.absolutePath,
            "--link2symlink",
            "--kill-on-exit",
            "-0",
            "-r", rootfs.absolutePath,
            "-b", "/dev", "-b", "/proc", "-b", "/sys", "-b", "/dev/urandom",
            "-w", "/opt/coopanion/app",
            "/usr/bin/env", "-i",
            "PATH=/usr/local/bin:/usr/bin:/bin:/opt/node/bin",
            "HOME=/root",
            "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "TERM=dumb",
            "UV_USE_IO_URING=0",
            "NODE_OPTIONS=--no-warnings",
            "CORTICO_HOME=/opt/coopanion/home",
            "CORTICO_EXTENSIONS_DIR=/opt/coopanion/ext",
            // 让 CUA 引擎挑安卓那套（src/cua/engine/android.ts → 127.0.0.1:18080 的无障碍接头）
            "COO_ANDROID_CUA=1",
            "COO_ANDROID_CUA_URL=http://127.0.0.1:${CuaHttpServer.PORT}",
            // corepack 的签名密钥校验在离线/镜像环境下会失败（Cannot find matching keyid）；
            // 扩展市场只是用 corepack 去问 pnpm/npm 的 registry，这里关掉校验即可
            "COREPACK_INTEGRITY_KEYS=0",
            "COREPACK_ENABLE_DOWNLOAD_PROMPT=0",
            "npm_config_update_notifier=false",
            "node", "--import", "/opt/coopanion/ts-anywhere.mjs",
            "--experimental-transform-types", "core/boot.ts",
        )
        val pb = ProcessBuilder(cmd)
            .directory(File(c.filesDir, "runtime"))
            .redirectErrorStream(true)
            .redirectOutput(ProcessBuilder.Redirect.appendTo(logFile(c)))
        pb.environment().apply {
            put("LD_LIBRARY_PATH", "${libFiles.absolutePath}:$libDir")
            put("PROOT_LOADER", loader.absolutePath)
            put("PROOT_TMP_DIR", tmp.absolutePath)
            put("PROOT_NO_SECCOMP", "1")
            put("PROOT_L2S_DIR", File(root(c), "l2s").apply { mkdirs() }.absolutePath)
        }
        return runCatching {
            proc = pb.start()
            Log.i(TAG, "核心已启动")
            true
        }.onFailure { Log.e(TAG, "启动失败：${it.message}") }.getOrDefault(false)
    }

    fun stop() {
        runCatching {
            val p = proc ?: return
            // proot 带 --kill-on-exit，杀掉它等于收掉整棵 guest 进程树
            p.destroy()
            if (!p.waitFor(4, java.util.concurrent.TimeUnit.SECONDS)) p.destroyForcibly()
        }
        proc = null
    }

    fun portOpen(timeoutMs: Int = 300): Boolean = runCatching {
        Socket().use { it.connect(InetSocketAddress("127.0.0.1", PORT), timeoutMs) }
        true
    }.getOrDefault(false)

    /** 等核心把 7797 打开。返回是否就绪。 */
    fun waitReady(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (portOpen()) return true
            if (proc?.isAlive == false && proc != null) return false
            Thread.sleep(400)
        }
        return false
    }
}