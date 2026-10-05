<!-- Owner: src/definition.ts -->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="cortico-world-desktop-pet" width="806">
  </picture>
</p>

[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的桌宠 World,一个独立的扩展包。
[Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 桌面上的 Coo 就是它。

bot 在屏幕底边有一个小身体:C 形的身体,两只 0 形的眼睛,两条短腿。它用气泡说话、用选项提问、
沿屏幕底边走动、做表情和动作;人可以对它说话(FunASR 在本机识别,Windows 上也可用系统自带的识别)、打字、点选项、戳它、摸它、
把它拎起来甩出去,这些都作为事件送回 bot。

## 工具

| 工具 | 作用 | 回执 |
|---|---|---|
| `pet_say(script)` | 冒气泡说话;`【词】` 先做动作再换新气泡,`<词>` 打字到那里时做 | 立即返回,报约显示多久、前面排了多久 |
| `pet_ask(question, options, allowOwnAnswer)` | 提问气泡,最多 3 个选项,默认再加一格自己写 | 立即返回;回答以 `[回答]` 事件送达 |
| `pet_walk_to(to, run)` | 走(跑)到桌宠所在屏幕横向 0–1 处,或 `left` `center` `right` `cursor` | 走到或被打断才返回,最多 30 秒 |
| `pet_act(actions)` | 不说话,依次做一串表情或动作 | 立即返回;`sit` `sleep` 保持到下个动作 |

表情和动作的词表在 `src/script.ts`,英文词与中文名都认;环境提示词 `src/ENV_PROMPT.md` 把它渲染成表格。

## 事件

| `type` | 正文 | 投递 |
|---|---|---|
| `desktop-pet.speech` | `[语音] 伙伴:…` | flush |
| `desktop-pet.message` | `[打字] 伙伴:…`(悬停按钮;`worlds.desktop-pet.doubleClickChat` 打开时也可双击) | flush |
| `desktop-pet.answer` | `[回答] 伙伴回答「问题」:选了第 2 项「…」` / 自己写的 / 关掉没答 | flush,关掉没答为 debounce |
| `desktop-pet.touch` | `[互动] 伙伴戳了你 3 下` / 摸了摸 / 拎起来甩了出去 / 摔晕 | `worlds.desktop-pet.touch.wakeOn` 选中的种类 debounce,其余 piggyback |

同一种互动 2.5 秒内连着来,并成一条带次数的事件。`wakeOn` 默认 `poke`:只有戳唤醒,摸头、放下和甩出跟着下一批送;鼠标划过桌宠也算摸头,拖开挡路的桌宠也算放下。一条互动按 debounce 送出后,到 bot 下一次结束一轮前,其余互动都按 piggyback 送。「伙伴」取自 `worlds.desktop-pet.user`。

## 桌宠窗口

World 在 `127.0.0.1:7797`(被占向上顺延)起一个页面服务:`/pet` 是桌宠本身,`/dress` 是装扮页。
桌宠有两个形象,在装扮页最上面一行选,存在配置 `skin.figure` 里:`coo` 是 Coo,`whale` 是 DeepSeek 大肥鱼
(鲸鱼女仆,`web/whale`,用 `web/rig` 画的 Live2D 式分件模型,八套配色存在 `skin.scheme`,见 [examples/whale](examples/whale/README.md))。
选大肥鱼时装扮页的配色和配件换成她的八套配色;桌宠页第一次用到她时才加载她的贴图,只加载选中的那套。
桌宠窗口是一个 Electron 进程(`host/electron-main.cjs`):透明、无边框、置顶,盖住一块显示器的工作区
(启动时是主显示器)。桌宠被拎着拖到另一块显示器上时,窗口当场挪到那块显示器,拖动中桌宠一直跟着光标,松手就在那块显示器上落下;
走路只在当前这块显示器上。窗口所在的显示器被拔掉时回到主显示器。`pet_walk_to` 的 0–1 和事件里的横向位置都按当前这块显示器算。
鼠标只在身体、气泡、右键菜单和悬停按钮上时才接收点击,其余位置点击穿透。托盘图标可以显示、隐藏、关闭它。
鼠标停在桌宠身上时,身旁出现两个按钮:打字说话;语音输入开关(点一下开关 `asr.enabled`,
正在听时长按半秒把听到的这句话立刻送出,不等停顿;按 toggle 方式开着的说话键同时关上)。黑白模式在右键菜单里切换。窗口打开时桌宠从屏幕顶上掉到底边。
右键菜单顶上一行是 bot 的头像(部署目录的 `avatar.png`,没有时画桌宠自己)和名字;内嵌应用借出运行控制时,
旁边还有暂停/继续、退出按钮,最下面多一行「打开设置」。点退出先在这一行问一次,菜单宽度不变。
「行为模式」展开二级菜单选常走动、多待着、不乱动。
提问气泡的选项出来时,窗口把键盘从前台窗口那里接过来(Windows 不让后台进程直接抢前台,
所以借 `AttachThreadInput` 与前台线程共享一次输入),按 1–9(主键盘或小键盘)选对应的选项;
答完、关掉或被新问题替换时还给原来那个窗口,期间人点了别处就不还。
World 进程退出后窗口在 2 秒内自己关掉。
窗口是否接收鼠标由两处判定:页面的 `pointermove`,和窗口进程每 100 毫秒读一次的光标位置。每次切换、以及
`pointermove` 的 `pointerType` 变化时,页面往运行日志写一行 `[pointer] {…}`(两处各自最后看到的位置、
是否碰到身体或界面、距今多少毫秒),最多每秒一行,中间略过的条数记在下一行。
桌宠身后的屏幕颜色和身体相近时(比如浅色身体停在白色窗口前),身体背后会亮起一圈浅灰色的柔光:
Windows 上每 0.8 秒用 GDI 取一小块身体周围的屏幕像素来比,其他系统读屏代价大,光圈一直亮着。

用哪个 Electron,依次是:

1. 环境变量 `CORTICO_DESKTOP_PET_HOST`:内嵌应用给的 JSON 数组命令,末尾追加 `--pet-url=<url>`。
   应用在自己的主进程里调 `require('cortico-world-desktop-pet/host/electron-main.cjs').runPetHost({ url, parentPid })`;
2. 配置 `worlds.desktop-pet.window.electronFile`;
3. 「桌宠」面板安装的托管运行时(Electron 44.4.4,装到 `<运行时根>/electron/44.4.4/`);
4. 本包能解析到的 `electron` 包。

没有窗口时,在浏览器里打开 `/pet` 也能看到桌宠;窗口连着时浏览器标签页只旁观,不接收指令,
打字和偏好改动照样送到 World。

黑白模式存在 `worlds.desktop-pet.theme`,默认 `dark`(浅色身体、深色气泡)。桌宠窗口、`/pet`、`/dress` 和控制台面板里的
预览都按这一项画,与系统和控制台的深浅色设置无关。

## 语音输入

桌宠窗口里的页面用麦克风收音,16 kHz 单声道 PCM 经 WebSocket 送到 World,按能量门限切句
(`src/asr/segmenter.ts`),交给识别引擎,繁体转简体、挡掉已知幻觉后作为 `desktop-pet.speech` 投递。
说话时桌宠歪头倾听,虚线气泡里边说边显示听到的字,还没定下来的部分是灰色的。

识别引擎存在 `asr.engine`:

| `asr.engine` | 引擎 |
|---|---|
| `funasr`(默认) | FunASR 的 SenseVoiceSmall(int8),经 sherpa-onnx 的 Node 插件在 World 进程里识别;Windows x64、macOS arm64 / x64、Linux x64 都有预编译包 |
| `system` | Windows 自带的语音识别(SAPI 听写,System.Speech),不用下载,准确度低一些;其他系统上按 `funasr` 处理 |

旧版本写下的 `auto`、`whisper` 都按 `funasr` 处理。

`funasr`:`sherpa-onnx-node` 是本包的依赖,随包安装(Windows 约 24 MB,macOS 约 35 MB),不在运行时下载。
只有模型要下载:「语音输入」面板(或应用的新手引导)点一下「下载」,
`model.int8.onnx`(228 MB)和 `tokens.txt` 依次从 ModelScope 取(国内可直接访问),取不到再从 Hugging Face 取,
逐个按固定的 SHA-256 校验,放到 `<模型根>/desktop-pet/sensevoice-small-int8-2024-07-17/`。
SenseVoice 一次识别整句;说话过程中每 0.5 秒把这句到目前为止的音频重新识别一遍,拿来边说边显示,
一句收尾后再识别一次定稿(3 秒的一句在两个线程上约 0.1 秒)。`asr.language` 取 zh、en、ja、ko、yue 或 auto,
`asr.threads` 是一次识别用的线程数,0 表示 2。

`system` 起一个常驻的 PowerShell 进程(`src/asr/system-sapi.ps1`,经 `-EncodedCommand` 传入,不受执行策略影响),
一句话边说边送:切句器判定开口后(连同门限之前那几帧)每帧一行 base64 PCM 送进去,
进程约每 0.4 秒回报一次这句到目前为止的文字(`listen` 的 `partial` 带上 `interim`),一句收尾后几十毫秒内定稿,不必再整句识别一遍。
按 `asr.language` 挑系统里装着的识别器。中文 Windows 自带 zh-CN 识别器;
没有时面板写明去 Windows 设置 → 时间和语言 → 语言里装「语音识别」。

下载都先写 `.partial`,完整后才改名到位。

收音方式存在 `asr.mic`,在「语音输入」面板里改:

| `asr.mic.mode` | 行为 |
|---|---|
| `hold`(默认) | 按住说话键时收音,整段都算话,松开即一句结束;连按的键是最后一下按住时收音 |
| `toggle` | 按一下说话键开始,再按一下停;中间按停顿切句 |
| `always` | 一直收音,按停顿切句 |

说话键 `asr.mic.hotkey` 用 `+` 连写组合键(`Ctrl+Space`、`F8`、`Mouse4`),结尾加 `*2` / `*3` 表示连按:前面几下是快速的一按一放(每下不超过 300 ms,两下之间隔不超过 400 ms),最后一下按住才算按下。
默认 `LeftAlt*2`:快速按一下左 Alt(Mac 上是左 Option),紧接着按住说话。按完快速的那一下,World 给桌宠页发 `listen` 的 `ready`,Coo 先抬头看一眼,按住时立刻进入聆听。
在哪个窗口里按都算;「语音输入」面板的说话键按钮录下组合键,旁边的下拉框选「双击再按住」(`*2`)或「直接按住」(不带 `*`),录键时保留当前的按法。桌宠麦克风按钮的角标显示说话键的简写(`Alt×2`、`F8`、`M4`),一直收音时显示 `AUTO`。
Windows 上经 koffi 轮询 Win32 `GetAsyncKeyState` 读取;macOS 上轮询 CoreGraphics 的 `CGEventSourceKeyState`,要在「系统设置 → 隐私与安全性 → 输入监控」里允许,第一次会弹出询问;Linux 上轮询 X11 的 `XQueryKeymap`(Wayland 下经 XWayland,只在 X11 窗口有键盘焦点时读得到;鼠标侧键读不到)。读不到时退回 `always`,面板上写明原因。
`asr.mic.deviceId` 选麦克风,留空用系统默认;设备列表由桌宠页在拿到麦克风权限后报上来。
麦克风在「开启语音输入」总开关开着时一直打开,电平条随时显示音量,说话键只决定哪一段送去识别。

## 给内嵌应用

`desktopPetDefinition({ controls, onCreate })` 生成定义:`controls`(`PetBotControls`)给右键菜单借出暂停、设置、退出,
借了哪个就只画哪个按钮或菜单行(暂停要 `isPaused` 和 `setPaused`,设置要 `openSettings`,退出要 `quit` 与可选的 `quitLabel`);
`onCreate` 拿到 World 实例,应用可以调 `world.confirm(问题, [同意, 不同意])` 弹一个两选项气泡,
结果是 `yes` / `no` / `dismissed` / `timeout`(60 秒没人答) / `unavailable`(没有桌宠页),不会作为事件送给 bot。

应用自己的一问一答(比如首次启动的引导)用 `world.dialog(步骤)`:Coo 在气泡里说一句,下面接一个输入组件,
回答同样只交给调用方。组件有按钮行(可带一个反复演示按法的按键帽)、可试选的卡片(可带图标或一张 `data:image/…` 图,比如服务的标志;选中时 Coo 当场演示对应动作:站着、溜达、跑来跑去)、
文本框(可以是密钥框,带一个外链和一个「以后再说」)、进度条(调用方用 `update({ progress })` 推进,`close()` 收起)。
`step` 在气泡顶上画步骤点,`closable` 画一个关闭钮;页面不在时结果是 `{ unavailable: true }`,页面回来后调用方重发即可。
`controls.guide` 借出后,控制台的 `pet.guide` 面板方法会调它,应用借此重放引导。

## 安装

```bash
corepack pnpm install
corepack pnpm build        # 面板产物 dist/,不进版本库
```

然后在 Cortico 控制台「扩展」页安装(填本目录的绝对路径),整进程重启。bot 的 `declares` 里加上 `desktop-pet`,或在「World 总览」启用它。

## 开发

```bash
corepack pnpm test
corepack pnpm typecheck
npx tsx scripts/check-voice.ts <模型根> <语音.wav>   # 连真 FunASR 手动检查,模型不在就先下载
```

`tsconfig.json` 与 `vitest.config.ts` 把 `cortico/*` 指到主仓库的 `vendor/cortico/src/`;
装进 Cortico 运行时由框架的模块钩子解析。`web/pet-core.js` 是身体本身(造型、表情、配件、合成音效、
动作模拟),桌宠页、装扮页都从它构建,不依赖 World。
