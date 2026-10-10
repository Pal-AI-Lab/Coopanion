<!-- Owner: src/definition.ts -->

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="cortico-world-desktop-pet" width="806">
  </picture>
</p>

[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的桌宠 World,一个独立的扩展包。
[Coopanion](https://github.com/Pal-AI-Lab/Coopanion) 桌面上的 Coo 就是它。

bot 在屏幕底边有一个小身体,由一个形象包提供(见下文):内置的 Coo(C 形的身体,两只 0 形的眼睛,两条短腿)、内置的大肥鱼,或者装上的其他包。它用气泡说话、用选项提问、
沿屏幕底边走动、做表情和动作;人可以对它说话(FunASR 或 Whisper 在本机识别,Windows 上也可用系统自带的识别)、打字、点选项、戳它、摸它、
把它拎起来甩出去,这些都作为事件送回 bot。

## 工具

| 工具 | 作用 | 回执 |
|---|---|---|
| `pet_say(script)` | 冒气泡说话;`【词】` 先做动作再换新气泡,`<词>` 打字到那里时做 | 立即返回,报约显示多久、前面排了多久 |
| `pet_ask(question, options, allowOwnAnswer)` | 提问气泡,最多 3 个选项,默认再加一格自己写 | 立即返回;回答以 `[回答]` 事件送达 |
| `pet_walk_to(to, run)` | 走(跑)到桌宠所在屏幕横向 0–1 处,或 `left` `center` `right` `cursor` | 走到或被打断才返回,最多 30 秒;`interruptible`,收到 interrupt 时停在原地并写明位置 |
| `pet_act(actions)` | 不说话,依次做一串表情或动作 | 立即返回;词表里标着保持的词(Coo 的 `sit` `sleep`)保持到下个动作 |
| `pet_set(…)` | 改自己的外观和习惯,见「自己调整」 | 自己能改的立即返回;要问的等对方回答 |
| `pet_quiet(minutes, sound, roam)` | 临时安静:默认关音效、站着不动,到点恢复,设置不变 | 立即返回 |

表情和动作的词表是当前形象包的 `vocab`(解析在 `src/script.ts`),词的 id 与各语言的名字都认;环境提示词 `src/ENV_PROMPT.md`(英文版 `src/ENV_PROMPT.en.md`)把它渲染成表格,前缀重建时更新。
运行中换了形象,`[形象]` 事件或 `pet_set` 的回执写明词表相对 bot 上次得知的变化:用不了的词,以及新增或样子变了的词的表格行。
身体加载好时报出它认得的词(kit 的身体都报),`vocab` 里身体不认得的词不给 bot 用,并在日志里记一条。
词表里没有的词,`pet_say` 和 `pet_act` 的回执会写明略过了哪些。

## 事件

| `type` | 正文 | 投递 |
|---|---|---|
| `desktop-pet.speech` | `[语音] 伙伴:…` | flush |
| `desktop-pet.message` | `[打字] 伙伴:…`(悬停按钮;`worlds.desktop-pet.doubleClickChat` 打开时也可双击;或对话页,可附图片) | preempt |
| `desktop-pet.answer` | `[回答] 伙伴回答「问题」:选了第 2 项「…」` / 自己写的 / 关掉没答 | flush,关掉没答为 debounce |
| `desktop-pet.touch` | `[互动] 伙伴戳了你 3 下` / 摸了摸 / 拎起来甩了出去 / 摔晕 | `worlds.desktop-pet.touch.wakeOn` 让它唤醒的种类 debounce,其余 piggyback |
| `desktop-pet.figure` | `[形象] 你现在的样子:…`(对方换了形象或打扮;bot 用 `pet_set` 自己换的不报) / `[形象] …没能显示出来(原因),你现在是 Coo 的样子` / `[形象] 词表变了。…`;词表有变化时都附上 | 换装 debounce,显示失败 flush |

每条事件的正文前是对方那边的本地时间 `[HH:MM]`;一次运行的第一条、换了日期后的第一条带日期和星期 `[MM-DD 周X HH:MM]`。
表里是中文版;模型文本是英文时,标签是 `[voice]` `[typed]` `[answer]` `[touch]` `[figure]`,星期写 `Sun` 这样的英文缩写。

同一种互动 2.5 秒内连着来,并成一条带次数的事件。`wakeOn`(「习惯」页的「回应模式」)默认 `poke`:只有戳唤醒,摸头、放下和甩出跟着下一批送;`all` 都唤醒;`none` 都跟着下一批送;`custom` 只有 `touch.wakeKinds` 里的种类(`poke` `pet` `throw` `drop`,摔晕算在它结束的那次甩出或放下里)唤醒。鼠标划过桌宠也算摸头,拖开挡路的桌宠也算放下。一条互动按 debounce 送出后,到 bot 下一次结束一轮前,其余互动都按 piggyback 送。「伙伴」取自 `worlds.desktop-pet.user`,空着时是应用语言的默认称呼(`src/i18n`)。

## 桌宠窗口

World 在 `127.0.0.1:7797`(被占向上顺延)起一个页面服务:`/pet` 是桌宠本身,`/dress` 是装扮页。
桌宠内置两个形象,和导入的形象包(见「形象包」)一起在装扮页最上面一行选,存在配置 `skin.figure` 里:`coo` 是 Coo,`whale` 是 DeepSeek 大肥鱼
(鲸鱼女仆,`web/whale`,用 `web/rig` 画的 Live2D 式分件模型,八套配色存在 `skin.scheme`,见 [examples/whale](examples/whale/README.md))。
选大肥鱼时装扮页的配色和配件换成大肥鱼的八套配色;桌宠页第一次用到大肥鱼时才加载这套贴图,只加载选中的那套。
桌宠窗口是一个 Electron 进程(`host/electron-main.cjs`):透明、无边框、置顶,盖住一块显示器的工作区
(启动时是主显示器)。桌宠被拎着拖到另一块显示器上时,窗口当场挪到那块显示器,拖动中桌宠一直跟着光标,松手就在那块显示器上落下;
走路只在当前这块显示器上。窗口所在的显示器被拔掉时回到主显示器。`pet_walk_to` 的 0–1 和事件里的横向位置都按当前这块显示器算。
鼠标只在身体、气泡、右键菜单和悬停按钮上时才接收点击,其余位置点击穿透。托盘图标可以显示、隐藏、关闭它。
鼠标停在桌宠身上时,身旁出现两个按钮:打字说话;语音输入开关(点一下开关 `asr.enabled`,
正在听时长按半秒把听到的这句话立刻送出,不等停顿;按 toggle 方式开着的说话键同时关上)。黑白模式在右键菜单里切换。窗口打开时桌宠从屏幕顶上掉到底边。
右键菜单顶上一行是 bot 的头像(部署目录的 `avatar.png`,没有时画桌宠自己)和名字;内嵌应用借出运行控制时,
旁边还有暂停/继续、退出按钮,最下面多一行「打开设置」。点退出先在这一行问一次,菜单宽度不变。
下面六个圆按钮两行三列:打字、语音输入、夜间模式、音效、隐藏、装扮。走动多少只在「习惯」页和悬停按钮里改。
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

开启状态气泡后,干活时头顶会冒一个小泡(`src/status.ts`、`web/pet-app.js`)。什么时候显示由 Core 的运行阶段(`onRunPhase`)决定:
请求模型、等待重试和上下文交接时是想事情,新一轮请求从想事情开始,一批结束(`idle`)时收起。显示什么来自主 session 的
`outputTap` 流事件里的工具调用,包括其他 World 和 Persona 的工具;参数里的文件名一闭合就显示,不等整份正文流完。
调用按 item id 和到达顺序记录,连续同类工作合并成「第一个文件 等 N 个」。哪个工具显示成什么由嵌入的应用给出
(`desktopPetDefinition({ describeTool })`,Coopanion 的在 `core/pet-status.ts`);没给出的工具显示「在忙」,`pet_*` 不显示。
下表是 Coopanion 给出的样子。

| 类别 | 气泡里的样子与文案 |
|---|---|
| 想事情 | 三点依次起伏,不写字;无障碍文本是「在想」 |
| 读文件 | 纸上的扫描线往下走,「在看 · 文件名」 |
| 翻找文件 | 文件夹开合,「在翻 · 目录/」(未指定是「记忆」)或「在找 · 匹配模式」 |
| 搜内容 | 放大镜绕小圈,「在搜 · 「关键词」」 |
| 写文件 | 铅笔来回划,「在写 / 在改 / 在补记 · 文件名」 |
| 删文件 | 桶盖抖动,「在删 · 文件名」 |
| 存附件 | 箭头落进托盘,「在存 · 文件名」 |
| 看屏幕 | 眼睛左右扫,「在看屏幕 / 在看开着的窗口」 |
| 鼠标与切窗口 | 指针加波纹,「在点 / 在双击 / 在右键 / 在挪鼠标 / 在拖 / 在切窗口」;「在滚动」用滚轮动画 |
| 键盘 | 键帽起落,「在打字」或「在按 · 按键」 |
| 等待 | 沙漏翻转,「等 · N 秒」 |
| 闹钟 | 闹钟摇动,「在定闹钟 · 时间或 N 分钟后 / 在看闹钟 / 在取消闹钟」 |
| 其他扩展工具 | 齿轮转动,只写「在忙」 |

状态与对话共用原来的说话气泡,保留实线边框和尖角;显示状态时整块点击穿透,不会挡住电脑操作的点击。
对话优先:说话、提问、确认、引导对话、打字框和聆听气泡出现时立即让位,对话结束后恢复仍在进行的状态,
不会同时显示两种气泡。状态气泡开着时,自动思考保留身体的眼神,不再另外画一组思考小圆泡。工作状态直接显示,
思考持续 0.6 秒才显示;每条至少停留 1.2 秒,只改文件名或数量时原地更新,换类时轻弹,结束用 0.2 秒淡出。
路径只显示最后一段,细节最多 20 字加省略号;打字内容、闹钟备注、窗口名和坐标不显示,未知工具也不显示名字和参数。

`worlds.desktop-pet.statusBubble` 默认开启,可在「习惯」页关闭「显示 Coo 在忙什么」。关闭时不画状态气泡,
身体的思考表情和思考小圆泡照常。这个开关不在 `pet_set` 的可改项中,也不进入统计。
页面协议新增 `{ t: 'status', status: { kind, text, detail?, count? } | null }`;`init` 和 `prefs` 同样带
`status`、`statusBubble`,供重连时恢复。`status` 变化只发状态消息,不会触发整份偏好广播;原来的 `thinking` 消息由它替代,
kit 的身体(`web/kit/body.js`)另收 `set({ thoughtShown })`,表示页面正在气泡里显示思考。

## 语音输入

桌宠窗口里的页面用麦克风收音,16 kHz 单声道 PCM 经 WebSocket 送到 World,按能量门限切句
(`src/asr/segmenter.ts`),交给识别引擎,挡掉已知幻觉后作为 `desktop-pet.speech` 投递;应用语言是简体中文且 `asr.simplified` 开着时先把繁体转成简体。
说话时桌宠歪头倾听,虚线气泡里边说边显示听到的字,还没定下来的部分是灰色的;用 Whisper 时一句说完才出字。

识别引擎存在 `asr.engine`:

| `asr.engine` | 引擎 |
|---|---|
| 空(默认) | 按应用语言选:SenseVoice 认的语言(中、英、日、韩)用 `funasr`,其余(法、德、西、葡、意、俄)用 `whisper` |
| `funasr` | FunASR 的 SenseVoiceSmall(int8),经 sherpa-onnx 的 Node 插件在 World 进程里识别 |
| `whisper` | OpenAI 的 Whisper small(int8),同样经 sherpa-onnx 在 World 进程里识别 |
| `system` | Windows 自带的语音识别(SAPI 听写,System.Speech),不用下载,准确度低一些;其他系统上按空处理 |

旧版本写下的 `auto` 按空处理。

`sherpa-onnx-node` 是本包的依赖,随包安装(Windows 约 24 MB,macOS 约 35 MB,Linux x64 约 33 MB),不在运行时下载;
Windows x64、macOS arm64 / x64、Linux x64 / arm64 都有预编译包,Linux 上要 glibc 2.32 与 GCC 11 的 libstdc++ 以上(Ubuntu 22.04、Debian 12 起)。
只有模型要下载:「语音输入」面板(或应用的新手引导)点一下「下载」,下的是当前引擎的模型;当前是 `system` 时下应用语言对应的那个,下完就换过去。
文件依次从 ModelScope 取(国内可直接访问),取不到再从 Hugging Face 取,逐个按固定的 SHA-256 校验:

| 引擎 | 文件 | 放在 `<模型根>/desktop-pet/` 下 |
|---|---|---|
| `funasr` | `model.int8.onnx`(228 MB)、`tokens.txt` | `sensevoice-small-int8-2024-07-17/` |
| `whisper` | `small-encoder.int8.onnx`(107 MB)、`small-decoder.int8.onnx`(250 MB)、`small-tokens.txt` | `whisper-small-int8-2024-07-13/` |

两个模型都一次识别整句。SenseVoice 在说话过程中每 0.5 秒把这句到目前为止的音频重新识别一遍,拿来边说边显示,
一句收尾后再识别一次定稿(3 秒的一句在两个线程上约 0.1 秒)。
Whisper 每输出一个词元约 70 ms,3 秒的一句约 1 秒、8 秒的一句约 3 秒(4 核笔记本 CPU 上两个线程;4 核上开 4 个线程更慢),
所以只在一句收尾后识别一次:边说边重识别会让 CPU 在人说话时一直满着,定稿也要排在正在跑的那次后面。
Whisper 对静音和底噪也会写出字(字幕署名、`[Musik]` 这类声音标注),兜底有两层:最响的 20 ms 不到 -50 dBFS 的一句不送去识别,
识别出来的声音标注(以 `[`、`(`、`*`、`♪` 开头)和字幕署名按幻觉挡掉。
`asr.language` 取 ISO 639-1 代码或 auto,空着时跟随应用语言;SenseVoice 认 zh、en、ja、ko、yue,Whisper 认近百种,不认的代码两者都按 auto(模型自己判断语言)。
`asr.threads` 是一次识别用的线程数,0 表示 2。

`system` 起一个常驻的 PowerShell 进程(`src/asr/system-sapi.ps1`,经 `-EncodedCommand` 传入,不受执行策略影响),
一句话边说边送:切句器判定开口后(连同门限之前那几帧)每帧一行 base64 PCM 送进去,
进程约每 0.4 秒回报一次这句到目前为止的文字(`listen` 的 `partial` 带上 `interim`),一句收尾后几十毫秒内定稿,不必再整句识别一遍。
按 `asr.language`(空着时取应用语言的语种)挑系统里装着的识别器,同一语种有几个时优先应用语言的地区(繁体中文 zh-TW,拉美西语 es-MX 等),再看 Windows 显示语言。中文 Windows 自带 zh-CN 识别器;
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

## 形象包

桌宠的身体都来自形象包,Coo 也是一个。形象包是一个目录,根上有 `figure.json`;内置的 Coo 在 `web/coo/`、大肥鱼在 `web/whale/`,
其余的从数据目录的 `figures/<目录>/` 和应用给的 `packRoots` 里找。`skin.figure` 是包的 id,`skin.scheme` 是它的打扮(Coo 的打扮存在 skin 自己的配色和配件字段里)。

包里的代码只在沙箱里跑:桌宠页把它放进 `/figure-frame`,这个页面的 CSP 把它设成不透明源、禁止一切网络连接,
脚本和图片只能从桌宠服务读,和桌宠页之间只有 postMessage(`web/figure-frame.js`、`web/body-host.js`)。
它连不到桌宠的 socket,也没法替对方说话或改设置。身体整个归包管:走、跳、被拎、表情、动作、画法都是包的代码,
桌宠页只转发指针、下指令,读回它报告的位置和发生的事。多数包用 `web/kit/body.js` 这套现成的身体,只自己画。

桌宠页替对方把着几条线(`web/body-host.js`):身体报告的框不超出舞台,也不超过 kit 自己能把身体拉伸到的大小,
只有框里的命中圆接收鼠标;摸、戳、拎这类互动只在页面刚转给它真实指针输入之后才算数,摔晕只在甩出去之后才算;
声音由页面播放,按设置里的类别和总开关静音。

`figure.json`(`manifest: 2`,`api: 2`,读取与校验在 `src/packs.ts`):

| 字段 | 含义 |
|---|---|
| `id` | 小写字母、数字和 `-`,不能和内置包(`coo`、`whale`)重名 |
| `name`、`about` | 按语言的名字;`about` 写这个身体长什么样,原样放进 bot 的环境提示词 |
| `entry`、`export` | 模块路径和它导出的工厂函数 |
| `model` | 交给工厂的 JSON(`opts.model`),可省 |
| `axes` | 打扮的维度,每维一组选项(`id`、`name`、`thumb`);装扮页每维一行 |
| `presets` | 维度组合的命名,可带 `accent` 和设置窗口配色 `console` |
| `vocab` | 这个身体做的全部表情和动作,也就是它在场时 bot 的整张词表:每个词 `id`、`kind`(`expression` / `motion`)、`names`(按语言的名字列表)、`about`(它做这个词的样子)、`seconds`(连着做时等多久再做下一个),`lasting: true` 表示保持到下一个动作;`kind` 是这一版不认识的值时跳过那个词 |
| `sounds` | 包自带的音频:名字 → `{ file, kind, volume }`,文件是包里的 `.ogg` `.mp3` `.wav`,`kind` 是 `move` `touch` `face` `snore` 之一;不存在的文件、这一版不认识的 `kind` 或文件类型,在扫描时记一条问题,那个声音不响 |
| `can` | `{ walk: false }` 表示不会走,`pet_walk_to` 会拒绝 |
| `author`、`license`、`credits`、`thumb`、`version` | 署名与展示 |

`skin.scheme` 是一个预设的 id,或者各维的选项 id 按维度顺序用 `-` 连起来(所以选项 id 里不能有 `-`)。词的名字不能带
`【】<>`、逗号、顿号或空白,也不能长过行内标记能装下的长度,不然脚本里写不出来。

工厂按 `factory(base, { model, scheme, kit, loadImage, asset, host })` 调用,返回一个身体;契约写在 `web/figure-frame.js` 开头。
用 kit 的包只要 `kit.createBody(host, { figure, words })`:`figure` 每帧画一次,`words` 是 kit 本身没有的词怎么做。
`examples/whale/README.md` 是写形象包的完整说明。20 秒内没准备好、或者跑的时候抛错,桌宠换回 Coo,并告诉 bot 词表的变化。

### 导入

装扮页形象那一行的最后一格是「导入」:选一个 zip 或一个文件夹,也可以直接把 zip 或文件夹拖到装扮页上(`src/pack-import.ts`)。
形象包是带 `figure.json` 的那个文件夹,从所选的位置往下最多找 3 层(GitHub 下载的 zip 外面会多套一层),找到一个包就不再往它里面找。
找到的包先列出来:缩略图、名字、版本、作者、署名、打扮和词的数量、这一版用不上的部分;已经装了同 id 的包时,写明会换成哪一版。
勾选的包装到数据目录的 `figures/<id>/`,替换同 id 的旧包,旧包所在的文件夹叫别的名字也一样;和内置形象同 id 的包导入不了。
一次最多 128 MB。装了但没加载成功的包列在形象那一行下面,写明原因。直接构造 `DesktopPetWorld` 时不给 `packDir`,装扮页就不显示导入。

### 形象包兼容承诺

形象包对外的部分有四块:`figure.json`、沙箱里的契约(`web/figure-frame.js` 开头)、作为 `kit` 交给包的 `web/kit/body.js`,
以及用户存下的打扮(`skin.scheme`)。对它们的承诺:

1. **manifest 只升不拒。** 从 `manifest: 2`、`api: 2` 起,应用一直读得了更早的版本(`MANIFEST_OLDEST`、`FIGURE_API_OLDEST` 不再往上调)。
   哪个版本替换了它们,就在 `readManifest` 里把旧 manifest 升成新格式,并在沙箱里继续按旧契约运行旧包。
   只有包的版本比应用新时才拒绝,并说明要先更新应用。
2. **同一个 api 里只做加法。** 新字段、新的可选方法和消息、kit 新的导出和词,都不升 api,旧写法照常工作。比如 api 2 里后加的身体 `words`。
3. **kit 跟着 api 冻结。** api 2 期间,kit 的导出名、函数签名和交给 `figure.draw` 的 `frame` 字段只增不改;修 bug 照常对所有包生效。
   哪天必须不兼容地改,就升 api,把当时的 kit 原样留一份,旧 api 的包继续拿到它。
4. **旧应用碰到不认识的东西,跳过那一项。** 不认识的字段不读;不认识的词 `kind`、音效 `kind` 或文件类型、`can` 的值,跳过那一项并记一条问题,
   包照常加载。只有缺了必需字段、字段的类型不对、路径出了包,才拒绝整个包。
5. **用户存的打扮不失效。** 包更新后 `skin.scheme` 指的选项没了,就退回那一维的第一个选项(`web/body-host.js` 的 `knownScheme`:包的代码只拿到它认得的打扮)。
   给作者的规矩:发布过的选项 id 和词 id 不删、不改名。
6. **CI 守着。** `tests/fixtures/api2-pack/` 是照 api 2 写好后冻结的包:`tests/packs.test.ts` 读它的 manifest,
   主仓库的 `tests/figure-frame-contract.test.js` 在 `figure-frame.js` 里跑它的身体(就绪、报词、出帧、包自己的手势、换打扮、走路)。
   改坏契约,这两个测试就会红;不要为了让测试通过去改这个包。升 api 时再冻结一个新版本的夹具包,旧的留着。

## 自己调整

`pet_set` 让 bot 改自己的外观和习惯,每项要么直接改,要么先在气泡里征得对方同意、同意了才改(`src/self.ts`)。
哪项归哪档由 `worlds.desktop-pet.selfAdjust`(「习惯」页的「自主配置权限」)定:

- `default`(默认):形象和打扮(Coo 的配色和配件也是打扮)、走动多少、呼噜多久直接改;音效、大小、黑白模式、悬停按钮、对对方的称呼先征得同意;
- `any`:都直接改;
- `custom`:按 `selfAdjustCustom` 逐项定,`true` 直接改,`false` 先征得同意;
- `off`:都不能改,`pet_quiet` 也不行。

0.1.20 及之前写下的 `true` 读作 `default`,`false` 读作 `off`。征得同意的气泡有三个按钮:可以、以后都可以、不用了(按应用语言);
选「以后都可以」时照改,并把 `selfAdjust` 设成 `custom`,`selfAdjustCustom` 取当时的直接改项加上这次问的几项,回执里写明。
这次写入和改动一样算 bot 自己改的(`onBotChange`)。环境提示词的 `{{pet.self}}` 列出当前直接改的和先征得同意的项。

其余设置(语音输入、麦克风、记住位置等)不是 bot 能改的。
`pet_quiet` 只在内存里覆盖音效和走动,不写配置;对方在这期间自己改了音效或走动,就按对方的来。

## 给内嵌应用

`desktopPetDefinition({ controls, onCreate, onSkin, packRoots, onBotChange, language })` 生成定义(`packRoots` 是更多形象包目录,`onBotChange` 在 bot 用 `pet_set` 改了设置之后调用,`language` 见下面「文字」一节):`controls`(`PetBotControls`)给右键菜单借出暂停、设置、退出,
借了哪个就只画哪个按钮或菜单行(暂停要 `isPaused` 和 `setPaused`,设置要 `openSettings`,退出要 `quit` 与可选的 `quitLabel`,可以是每次开菜单时调用的函数);
`onCreate` 拿到 World 实例,应用可以调 `world.confirm(问题, [同意, 不同意])` 弹一个两选项气泡(或 `[同意, 以后都同意, 不同意]` 三选项,中间那项答 `always`),
结果是 `yes` / `no` / `dismissed` / `timeout`(60 秒没人答) / `unavailable`(没有桌宠页),不会作为事件送给 bot。

应用自己的一问一答(比如首次启动的引导)用 `world.dialog(步骤)`:Coo 在气泡里说一句,下面接一个输入组件,
回答同样只交给调用方。组件有按钮行(可带一个反复演示按法的按键帽)、可试选的卡片(可带图标或一张 `data:image/…` 图,比如服务的标志,名字下可带一行小字 `note`;选中时 Coo 当场演示对应动作:站着、溜达、跑来跑去)、
文本框(可以是密钥框,带一个外链和一个「以后再说」)、进度条(调用方用 `update({ progress })` 推进,`close()` 收起)。
`step` 在气泡顶上画步骤点,`closable` 画一个关闭钮;页面不在时结果是 `{ unavailable: true }`,页面回来后调用方重发即可。
`controls.guide` 借出后,控制台的 `pet.guide` 面板方法会调它,应用借此重放引导。
`/api/config` 写不了列表和对象,所以「习惯」页的两个自定义弹窗经 `pet` 面板方法保存:`setWakeKinds(种类数组)` 把 `touch.wakeOn` 设成 `custom` 并写 `touch.wakeKinds`,
`setSelfAdjustCustom({ 项: true/false })` 把 `selfAdjust` 设成 `custom` 并写 `selfAdjustCustom`;`pet.state` 的 `wake`、`selfAdjust` 给出当前值(旧的布尔值已按新含义读出)。

### 对话页

控制台页 `world:desktop-pet` 的 `chat` 面板是一条推送连接(`src/chat.ts`),应用拿它做对话页:

- 页面发 `send` 的文字和图片作为 `desktop-pet.message` 投递;送达前在页面上排队,`now` 让它以 interrupt 立即送达,`withdraw` 撤回(需要宿主提供 `promotePending` / `withdrawPending`);World 的 `onEventsSettled` 告诉页面何时送达。
- `pet_say` 的每一拍、`pet_ask` 的问题、两句话之间调用过的工具名记为 `desktop-pet.self` 事件,只落库不投递;`hello` 时 World 从事件库还原历史,排过队的消息放在送达的位置。`blob`(GET)取消息里的图片。
- `pet_ask` 在页面上也能回答,回答后桌宠上的气泡关掉。页面还收到 Core 的运行阶段(`phase`)与暂停状态。
- `controls.openChat` 借出后,打字气泡多一个展开钮,带着草稿打开对话页;环境提示词的 `{{pet.chat}}` 也只在这时说明对话页。

### 模型文本的语言

给人看的文字(桌宠页、装扮页、菜单、语音提示、报错、控制台的配置项、面板与对话页)每种语言一个文件:World 与控制台面板在 `src/i18n/<语言>.ts`,页面在 `web/i18n/<语言>.js`。`zh`、`en` 是全的;其余语言只写译好的键(`src/i18n` 按顶层键,一组键要整组给),缺的键繁体读简体,其余读英文。气泡与页面按 `desktopPetDefinition({ language })` 给的应用语言(缺省 `zh`),页面从 snapshot 里拿到并随时切换;控制台按请求的语言。称呼与 `pet_ask` 选项按字形计数,中日韩 20 / 40 字,其他语言加倍,上限写在工具说明里。

bot 从这个 World 读到的文字(事件、回执、环境提示词和词表)有中文、英文两版(`src/model-text.ts`),由 `desktopPetDefinition({ modelLanguage })` 每次用到时选,缺省中文;用户打的字、说的话和回答原样放进去。工具说明只有英文一版。
`replyLanguage` 返回要 bot 对使用者说的语言的名字(按模型文本的语言写,比如 `Japanese`、`繁体中文`),渲染成环境提示词里的 `{{pet.reply}}` 一句;返回 null 时这句为空。语言变了,环境提示词在下一次前缀重建时换。
形象包 `about` 和 `vocab` 的 `about` 没有 `en` 时,英文版用中文的;英文词表只列 id 和 `names.en`,名字没有 `en` 的维度、选项和预设在英文版里用 id。

形象的身体可以实现 `stopWalk(id)`:interrupt 停下 `pet_walk_to` 时页面经 `figure-frame` 调它;没实现时这次走路照常走完。

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
npx tsx scripts/check-voice.ts <模型根> <语音.wav> [应用语言]   # 连真模型手动检查(fr 等走 Whisper),模型不在就先下载
```

`tsconfig.json` 与 `vitest.config.ts` 把 `cortico/*` 指到主仓库的 `vendor/cortico/src/`;
装进 Cortico 运行时由框架的模块钩子解析。网页部分不依赖 World:`web/kit/` 是现成的身体(动作模拟、表情、粒子,
和画大肥鱼用的 rig),`web/coo/` 是 Coo 的造型、配件与形象包入口,`web/sound.js` 是合成音效与包自带音频的播放,
`web/body-host.js` 是桌宠页、装扮页这一侧的身体代理。
