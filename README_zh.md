<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="Coopanion" width="806">
  </picture>
</p>

<p align="center">
  <a href="README.md">English</a> ｜
  简体中文
</p>

<p align="center">
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pal-AI-Lab/Coopanion?color=00a870"></a>
  <a href="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 / 11" src="https://img.shields.io/badge/Windows-10%20%2F%2011-1f6feb">
  <img alt="macOS 13+" src="https://img.shields.io/badge/macOS-13%2B-1f6feb">
  <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-1f6feb">
  <a href="LICENSE"><img alt="AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-8b8b8f"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> ｜
  <a href="#快速上手">快速上手</a> ｜
  <a href="#日常使用">日常使用</a> ｜
  <a href="#常见问题">常见问题</a> ｜
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases">更新记录</a> ｜
  <a href="docs/DEVELOPMENT.md">参与开发</a>
</p>

Coopanion 是一个桌宠。桌宠 **Coo** 待在屏幕底边，可以用气泡和你聊天、听你说话、在底边走动，经你同意后还能操作电脑。支持 Windows、macOS 和 Linux。

**语言**：应用和新手引导有简体中文、繁體中文、English、日本語、한국어、Français、Deutsch、Español (Latinoamérica)、Português (Brasil)、Italiano、Русский 11 种语言。新装时跟随系统语言，系统语言不在其中时用英文；从旧版本升级的保留原来的语言。在「习惯」页的「语言」里修改。Coo 用应用语言和你说话。

![1790222143546](image/README/1790222143546.png)

<p align="center"><img src="image/README/pet-desktop-zh.png" alt="Coo" width="640"></p>

## 功能

- **多家模型**：DeepSeek、通义千问、Kimi、智谱 GLM、豆包、MiniMax、阶跃星辰、百度千帆、OpenRouter、OpenAI、Anthropic、Gemini、xAI。选一家，贴上 API Key 就能用。
- **聊天**：按说话键说话，或者打字，Coo 在气泡里回复。语音在本机用 FunASR 或 Whisper 识别，按应用语言选。
- **记忆**：记得聊过的内容，也知道你戳了它、摸了它的头。
- **操作电脑**：点按钮、打字、切窗口。动手前先问你。
- **状态气泡**：想事情、看文件、搜索、写入、操作电脑时，头顶用各不相同的小图标和动画显示在做什么，也会显示文件名；气泡点击穿透。默认开启，可在「习惯」关闭。
- **形象**：Coo，或者 **DeepSeek 大肥鱼**（全动态的鲸鱼女仆，八套厂商配色）。其他形象包在装扮页从 zip 或文件夹导入；按形象 API 2 写的包在之后的版本里照常加载（见[形象包兼容承诺](packages/cortico-world-desktop-pet/README.md#形象包兼容承诺)）。
- **装扮**：Coo 的配色、帽子、耳饰、眼镜、颈饰，以及大小和走动频率。
- **扩展**：在扩展页安装 QQ 机器人、画室、小游戏等 World。

每个版本的改动见 [Releases](https://github.com/Pal-AI-Lab/Coopanion/releases)。

## 安装

需要以下系统之一：

- Windows 10 / 11（64 位）
- macOS 13 及以上（Apple 芯片和 Intel 都可以）
- 64 位 Linux 桌面（X11，或 Wayland 下的 XWayland）；语音识别要 glibc 2.32 及以上（Ubuntu 22.04、Debian 12 起）

另外需要一家模型服务的 API Key，按用量付费，见[费用与隐私](#费用与隐私)。应用语言是简体中文时引导把 DeepSeek 排在第一，其他语言把 OpenAI 排在第一。安装不需要管理员权限。

### Windows：下载安装包

1. 打开[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)，下载 `Coopanion-Setup-版本号.exe`。
2. 双击运行，安装界面跟随系统语言。安装包没有数字签名，Windows 可能弹出「Windows 已保护你的电脑」，点 **更多信息** → **仍要运行**。
3. 选安装位置（默认 `C:\Users\你的用户名\Coopanion`），点安装。装好后自动启动，桌面上有图标。

> [!NOTE]
> 程序和它的数据都在安装目录里，不写 AppData，所以开始菜单里没有它，从桌面图标打开。

### Windows：一行命令

打开 PowerShell，粘贴下面这行并回车：

```powershell
irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
```

它会下载最新的安装包并运行，装完删掉下载的文件。

### macOS

1. 打开[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)。Apple 芯片下载 `Coopanion-版本号-mac-arm64.dmg`，Intel 下载 `…-mac-x64.dmg`。
   不确定是哪种：苹果菜单 →「关于本机」，「芯片」一栏写 Apple M 系列就是 Apple 芯片。
2. 双击 dmg，把 Coopanion 拖进「应用程序」。
3. 应用没有 Apple 开发者签名，第一次打开会被拦下：先双击打开一次，在提示里点「完成」；再到「系统设置 → 隐私与安全性」，页面底部点「仍要打开」并输入密码。之后就能正常打开。
4. 图标在屏幕顶部的菜单栏里。程序坞里没有，打开设置窗口时才出现。

> [!NOTE]
> 数据在 `~/Library/Application Support/Coopanion`。第一次用到时系统会分别询问麦克风（语音输入）、输入监控（说话键）、录屏与系统录音和辅助功能（操作电脑）。不想让 Coo 操作电脑，后两项不给即可。改了「输入监控」「辅助功能」「录屏」后要重启 Coopanion。应用没有 Apple 开发者签名,更新后 macOS 不把这几项授权算给新版本:开关开着却提示没有权限时,用「−」把 Coopanion 移出那个列表,再把 `/Applications/Coopanion.app` 加回来并重启。

### Linux

1. 打开[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)，下载 `Coopanion-版本号-linux-x64.deb`（Debian / Ubuntu）或 `Coopanion-版本号-linux-x64.AppImage`（其他发行版）。
2. deb：`sudo apt install ./Coopanion-版本号-linux-x64.deb`，然后从应用菜单打开。
   AppImage：`chmod +x Coopanion-*.AppImage` 后运行。Ubuntu 22.04 及以后要先装 `libfuse2`（`sudo apt install libfuse2t64`）。
3. 桌宠是透明置顶窗口，需要桌面开启窗口合成（GNOME、KDE 默认开启）。Wayland 下通过 XWayland 运行。

> [!NOTE]
> 数据在 `~/.config/Coopanion`。托盘图标需要桌面支持状态栏图标（GNOME 要装 AppIndicator 扩展）；没有托盘时右键 Coo 也能进设置。
> 操作电脑要用 `xdotool` 和 `zenity`，deb 会自动安装；Wayland 下截屏还需要 `grim`、`spectacle`、`scrot` 或 ImageMagick 之一。

## 快速上手

1. **启动**：Coo 落到屏幕底边，任务栏（Mac 是菜单栏，Linux 是状态栏）多出一个图标，不弹窗口。
2. **引导**：第一次启动时 Coo 在气泡里带你完成设置，直接在气泡里点选或填写：
   1. 你希望它怎么称呼你，以及你从哪里知道 Coopanion（可以选「不告诉你」；开着匿名使用统计时，回答随统计发出）；
   2. 走动频率：不乱动 / 多待着 / 常走动；
   3. 选模型服务（拿不准就选排第一的那家），贴上 API Key，当场测试连接；
   4. 下载语音识别模型（FunASR 约 230 MB；应用语言是法、德、西、葡、意、俄语时是 Whisper，约 360 MB；从 ModelScope 下载），然后教你怎么说话；
   5. 按钮、菜单和设置在哪，以及人设在设置窗口的「系统提示词」页。

   引导结束后，可以直接和 Coo 商量它的性格、说话方式和称呼，它能自己把人设写进提示词。

   应用语言是简体或繁体中文时，Coo 的人设和提示词是中文，其他语言是英文；简体中文和英文以外的语言，还会告诉 Coo 用应用语言和你说话。没改过的初始人设会随语言换成另一版，Coo 从下一个 session 起读到；改过的保持原样。

   气泡右上角的 × 可以随时结束引导，之后在设置窗口「开始」页点「使用向导」重来。Key 选了「稍后再填」也没关系，Coo 过一阵会再问；没接通模型时每次跟它说话，它也会先问要不要去接通。
3. **说第一句话**：快速按一下**左 Alt**（Mac 是**左 Option**），紧接着按住，说「你好」，松开发送。第一次会询问麦克风权限，选允许。

<details>
<summary><b>怎么拿到 API Key？</b></summary>

以 DeepSeek 为例：

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys)，注册并登录；
2. 充值（按用量计费）；
3. 「API Keys」→「创建 API key」，复制 `sk-` 开头的字符串，贴进 Coo 的气泡或「开始」页。

其他几家，在气泡或「开始」页选中后点「去 … 申请」。下表按应用语言是简体中文时的顺序排列：

| 服务                   | 申请 Key                                                                                                                                                                         | 默认模型                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| DeepSeek               | [platform.deepseek.com](https://platform.deepseek.com/api_keys)                                                                                                                  | `deepseek-flash`                                                           |
| 通义千问（阿里云百炼） | 国内 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key)，国际 [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/settings/api-key) | `qwen3.8-flash`                                                            |
| Kimi（月之暗面）       | 国内 [platform.kimi.com](https://platform.kimi.com/console/api-keys)，国际 [platform.kimi.ai](https://platform.kimi.ai/console/api-keys)                                          | `kimi-k3`                                                                  |
| 智谱 GLM               | 国内 [bigmodel.cn](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)，国际（Z.ai）[z.ai](https://z.ai/manage-apikey/apikey-list)                                                  | `glm-5.3-flash`（国内平台连不上就换成 `glm-5.3`）                          |
| 豆包（火山方舟）       | [ark.volcengine.com](https://ark.volcengine.com/region:cn-beijing/apikey)                                                                                                        | `doubao-seed-2-1-lite-260915`（要先在方舟控制台「开通管理」里开通）        |
| MiniMax                | 国内 [platform.minimax.cn](https://platform.minimax.cn/user-center/basic-information/interface-key)，国际 [platform.minimax.io](https://platform.minimax.io/user-center/basic-information/interface-key) | `MiniMax-M3`                                                               |
| 阶跃星辰               | [platform.stepfun.com](https://platform.stepfun.com/interface-key)                                                                                                               | `step-3.7-flash`                                                           |
| 百度千帆               | [console.bce.baidu.com](https://console.bce.baidu.com/iam/#/iam/apikey/list)                                                                                                     | `glm-5.3-flash`                                                            |
| OpenRouter             | [openrouter.ai](https://openrouter.ai/settings/keys)                                                                                                                             | `deepseek/deepseek-v4.1-flash`                                             |
| OpenAI                 | [platform.openai.com](https://platform.openai.com/settings/organization/api-keys)                                                                                                | `gpt-6-luna`                                                               |
| Anthropic              | [platform.claude.com](https://platform.claude.com/settings/keys)                                                                                                                 | `claude-haiku-5-5`                                                         |
| Gemini（Google AI Studio） | [aistudio.google.com](https://aistudio.google.com/apikey)                                                                                                                    | `gemini-3.5-flash-lite`                                                    |
| xAI                    | [console.x.ai](https://console.x.ai/team/default/api-keys)                                                                                                                       | `grok-4.3`                                                                 |

默认模型是每家快、便宜且能看图的一档。要换，在引导里改模型名，或在「开始」页的「模型」框里填。

通义千问、Kimi、智谱 GLM、MiniMax 各有国内和国际两个平台，账号和 Key 不通用。新建连接时，应用语言是简体中文用国内平台，其他语言用国际平台；「开始」页可以切换。豆包、百度千帆、阶跃星辰只收中国大陆账号，简体中文以外的语言把它们收在「更多」里。

拿真实 Key 测过的只有 DeepSeek 和 Anthropic，其他几家是照文档接入的。连不上请开 issue。

</details>

## 日常使用

### 和 Coo 说话

| 方式       | 怎么做                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 语音       | **快速按一下左 Alt，紧接着按住**（Mac 是左 Option）说话，松开算一句。识别中的文字显示在虚线气泡里。                           |
| 打字       | 鼠标停在 Coo 身上，点旁边的气泡按钮。在「习惯」页打开「双击 Coo 打开打字框」后，双击也行。                                      |
| 麦克风按钮 | 鼠标停在 Coo 身上时出现，用来开关语音输入。按键收音时角标显示说话键（默认 `ALT×2`），一直在听时显示 AUTO。正在听时长按，这句话立即发出。           |
| 回答选项   | Coo 给出选项时，点一下或按 1–3；都不合适就在最后一格自己写。                                                                  |

说话键、麦克风和收音方式（按住说 / 按一下开关 / 一直听）在「语音输入」页修改。点「说话键」按钮后按下单键、组合键（如 `Ctrl + Space`）或鼠标侧键；旁边选「双击再按住」（默认）或「直接按住」。说话键不可用时会退回一直听，按钮显示 AUTO。

语音在本机识别，录音不上传：应用语言是中、英、日、韩文时用 **FunASR**（SenseVoiceSmall 模型，约 230 MB），法、德、西、葡、意、俄语时用 **Whisper**（small 模型，约 360 MB，一句说完才出字）。模型在引导或「语音输入」页下载一次即可。Windows 上也可以用系统自带的识别，不用下载，准确率低一些。

### 和 Coo 互动

- **点一下**是戳它，**在头上来回划**是摸头，**按住拖动**是拎起来，松手可以甩出去。默认戳它会让它回应，摸头和拎起只在下次它说话时一并告诉它。在「习惯」页的「回应模式」里可以改：安静是互动都先记着、和它说话时一起回应，积极是所有互动都回应，自定义…可以勾选哪些互动让它马上回应。
- **表情和动作**：Coo 说话时会配上表情和动作。表情有开心、眨眼、喜欢、害羞、惊讶、生气、难过、犯困、思考、得意、嘟嘴、担心、认真、慌张、害怕、期待（星星眼）、大哭、疑惑；动作有点头、摇头、张望、转身、转圈、跳、坐下、睡觉、招手、鞠躬、发抖、扑腾、跳舞等。换成大肥鱼时，点头和摇头是真的低头、转脸，招手举起靠近你的那只手，鞠躬时上身往前倾。
- **右键**打开菜单：暂停 / 继续、设置、退出，以及打字、语音输入、行为模式、夜间模式、音效、装扮、隐藏。
- **悬停按钮**：鼠标停在 Coo 身上时旁边的按钮，默认是打字和语音，在「习惯」页最多可选六个。
- **记住位置**：在「习惯」页打开后，下次启动 Coo 回到上次的横向位置。
- **多块显示器**：Coo 启动时在主屏。拎到另一块屏幕松手，它就留在那块屏幕上；那块屏幕断开时回到主屏。

### 让 Coo 操作电脑

电脑操作默认开启。Coo 看屏幕不问，第一次动鼠标键盘之前问你，点「可以」之后 30 分钟内不再问。在这个默认之前装的保留原来的每轮都问。

- 在「电脑操作」页的「什么时候先问你」里可以改，由严到松四档：
  - `ask-each-turn`：每轮都问；
  - `ask-before-acting`：看屏幕不问，动鼠标键盘前每轮问；
  - `ask-once`（默认）：看屏幕不问，动手前问一次，之后在「同意管多久」（默认 30 分钟）内不再问；
  - `never-ask`：都不问。
- 你一动鼠标或键盘，它就停下来等你。
- 登录、密码、付款这类步骤交给你自己做。
- 一次唤醒最多请求模型 40 次，到上限就结束这一轮，要继续就再跟它说。上限在高级模式「Cormini」页修改，重启后生效。

不想让它操作电脑：在「电脑操作」页取消勾选「让 Coo 操作这台电脑」。

### 托盘 / 菜单栏

程序常驻后台。关掉设置窗口不会退出；再次打开程序只会把 Coo 叫回来。

托盘图标（Mac 是菜单栏，Linux 是状态栏）的菜单里可以打开设置、显示桌宠、设置开机启动、重启和退出。Windows 上左键单击图标直接打开设置。

## 设置窗口

点托盘图标，或右键 Coo 点齿轮，打开设置窗口。默认是**普通模式**，只有和桌宠相关的页面：

| 页面       | 内容                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| 开始       | 连接模型（已连接的模型和可选择的供应商在同一处）、在桌面上显示或隐藏桌宠、预览桌宠、配色方案与调色盘、重看引导。左栏底部显示「运行中 / 已暂停」，旁边是暂停 / 继续和关机 |
| 习惯       | 应用语言、称呼、走动频率、颜色、大小、记住位置、悬停按钮、双击打字、状态气泡、音效（可按类关闭）、帧率(60/120/144/不限)、全屏时自动隐藏（Windows）、回应模式、自主配置权限（哪些设置 Coo 直接改、哪些先征得你同意）、匿名使用统计      |
| 装扮       | 形象（Coo、DeepSeek 大肥鱼，或装上的形象包）、配色和配件，改动立即生效。形象一行最后的「导入」从 zip 或文件夹安装形象包（一次最多 128 MB），也可以直接拖到页面上 |
| 语音输入   | 开关、识别引擎、模型下载、说话键、麦克风、收音方式                                                          |
| 电脑操作   | 开关、是否允许动鼠标键盘、什么时候先问你、同意管多久                                                        |
| 系统提示词 | Coo 的系统提示词，人设在「CONSTITUTION」一段。Ctrl+S 保存，「重载当前 session」生效；「清空重开」清掉当前对话 |
| 用量与成本 | 每天的 token 用量和花费                                                                                    |
| 对话       | 当前对话的记录，也可以在这里直接和 Coo 说话                                                                |

<p align="center"><img src="image/README/habits-zh.png" alt="Habits" width="720"></p>
<p align="center"><img src="image/README/dress-zh.png" alt="Dress up" width="720"></p>

左上角显示当前版本，有新版本时下面会出现下载链接。Windows 版和 AppImage 会在后台自动下载新版本，下好后 Coo 会在气泡里问你要不要重启更新，不急的话下次退出时自动装上；下载卡住时可以去 GitHub 手动下载。Mac 版和 deb 仍需手动下载。更新之后，Coo 会告诉你新版本有什么变化；你在这里改了称呼、装扮、走动或电脑操作这些设置，它也会知道并回应。

左栏底部的「**高级模式**」显示全部页面（World、模型、扩展、记忆、运行诊断），「回到普通模式」收起。

### 换模型

在「开始」页的「连接模型」里选一家服务，填模型名（已有默认值）和 Key 就换过去了。每家（有两个平台的，每个平台）的 Key 分别保存，换回来不用重填。

<p align="center"><img src="image/README/start-zh.png" alt="Start" width="720"></p>

默认是新装时应用语言排第一的那家：简体中文是 DeepSeek 的 `deepseek-flash`，其他语言是 OpenAI 的 `gpt-6-luna`。操作电脑需要模型能看图，各家的默认模型都可以。各平台按它文档里的接口调用：Anthropic 用 Messages API，Gemini 用 Gemini API，百度千帆和智谱国际平台 Z.ai 用 Chat Completions，其余用 Responses API。高级模式的「模型」页还可以：

- 换模型、调整思考档位；
- 新建「OpenAI Responses Compatible」连接，接入其他兼容 Responses API 的服务；
- 为 DeepSeek、OpenAI、Anthropic、Gemini、xAI 以外的服务填写价目，让「用量与成本」页算出花费。

### 装扩展

高级模式的「扩展」页列出 npm 上带 `cortico-world` 关键字的 World，例如：

- QQ 机器人（`cortico-world-qq-better`）
- 画室与你画我猜（`cortico-world-canvas`）
- 植物大战僵尸（`cortico-world-pvz`）
- 杀戮尖塔（`cortico-world-sts-1`）

安装后点「重启进程」，再到「World 总览」里启用。重装应用不会丢失扩展。

## 费用与隐私

- **费用**：Coopanion 免费。聊天的费用由你选的模型服务按用量收取，可在「用量与成本」页查看（内置价目的有 DeepSeek、OpenAI、Anthropic、Gemini 付费档、xAI）。
- **发给模型服务的内容**：你说的话、打的字、和 Coo 的互动，以及操作电脑时的截图。只发给你配置的那一家。
- **留在本机的内容**：API Key、记忆、对话记录、设置、日志。语音在本机识别，只把识别出的文字发出去。
- **匿名使用统计**：发到 `survey.palailab.org`，只有使用次数、时长、设置和随机生成的安装编号，不含对话、截图、Key 和文件。字段见 [docs/TELEMETRY.md](docs/TELEMETRY.md)，可在「习惯」页关闭。
- **其他联网**：打开设置窗口时向 GitHub 查询新版本；安装扩展时访问 npm；下载语音模型时访问 ModelScope（失败时用 Hugging Face）。

## 数据与卸载

| 系统    | 数据位置                                 | 卸载                                                         |
| ------- | ---------------------------------------- | ------------------------------------------------------------ |
| Windows | 安装目录下的 `data`                       | 「设置 → 应用」里卸载                                        |
| macOS   | `~/Library/Application Support/Coopanion` | 把「应用程序」里的 Coopanion 拖进废纸篓                      |
| Linux   | `~/.config/Coopanion`                     | deb：`sudo apt remove coopanion`；AppImage：删除文件         |

卸载不会删除数据，重装后记忆和设置还在。不再需要时，手动删掉数据目录（Windows 上删整个安装目录）。

数据目录里，`home` 是记忆、对话记录、设置和 API Key，`extensions` 是扩展，`logs` 是日志，`home/models` 是语音模型。

## 常见问题

<details>
<summary><b>桌宠不见了</b></summary>

右键托盘图标 →「显示桌宠」。托盘图标被折叠时，点任务栏右下角的 `^`。也可以再打开一次程序。Mac 上点菜单栏图标 →「显示桌宠」。

</details>

<details>
<summary><b>Coo 不说话 / 没反应</b></summary>

看设置窗口「开始」页标题旁的状态：

- **没有连接模型**：检查 API Key 是否完整、账户是否有余额，再点「测试连接」。通义千问、Kimi、智谱 GLM、MiniMax 的 Key 只在申请它的平台（国内或国际）上能用。豆包要先在方舟控制台开通默认模型。
- **已暂停**：点左栏底部的「继续」。

模型请求连续失败 5 次时，Coo 会在气泡里说出错误原因（如模型名不存在、Key 无效、余额不足），点「打开设置」去改。

</details>

<details>
<summary><b>它听不到我说话</b></summary>

- 确认 Coo 身旁的麦克风按钮没有被划掉；
- 先快速按一下左 Alt，再按住（两下间隔太久不算）；
- 「语音输入」页显示识别服务就绪；提示模型未下载就点「下载」。说话时电平条会跳动；
- Windows：设置 → 隐私和安全性 → 麦克风，允许桌面应用使用麦克风；
- Mac：「系统设置 → 隐私与安全性」里给 Coopanion 打开「麦克风」和「输入监控」，改完重启。

用 Windows 自带引擎时提示「没有语音识别器」，到设置 → 时间和语言 → 语言，给应用语言装上「语音识别」，或者换回 FunASR 或 Whisper。

</details>

<details>
<summary><b>需要走代理</b></summary>

在启动 Coopanion 的环境里设置 `HTTP_PROXY` / `HTTPS_PROXY`，本机通信会自动绕过代理。详见[开发文档](docs/DEVELOPMENT.md)。

</details>

<details>
<summary><b>想看它在想什么</b></summary>

「对话」页有完整的记录。遇到问题时在这一页点「导出诊断」，把诊断包附在 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues) 里。

</details>

## 反馈与参与

- 问题和建议请提 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues)，写上系统版本、Coopanion 版本和复现步骤。
- 从源码构建或修改代码见[开发文档](docs/DEVELOPMENT.md)。

## 致谢

Coopanion 用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装：Cortico Core + Cormini Persona + [桌宠 World](packages/cortico-world-desktop-pet) + [电脑操作 World](packages/cortico-world-cua)。

## 许可

[AGPL-3.0-or-later](LICENSE)。0.1.10 及之前发布的版本是 MIT。框架 Cortico 是 MIT，以子模块随附。提 PR 见 [CONTRIBUTING.md](CONTRIBUTING.md)，首次提交需要签[贡献者许可协议](CLA.md)。

DeepSeek 大肥鱼形象（`packages/cortico-world-desktop-pet/web/whale/` 的贴图）不在 AGPL 授权范围内，来源与各家标志的说明见[桌宠 World 的第三方声明](packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md)。随附或运行时下载的第三方组件：Electron（MIT）、Cortico（MIT）、sherpa-onnx（Apache-2.0）、FunASR 的 SenseVoiceSmall 模型（[FunASR 模型开源协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)，用时下载）、OpenAI 的 Whisper small 模型（MIT，用时下载）、koffi（MIT）、jpeg-js（BSD-3-Clause）、pnpm（MIT）；各家模型服务的标志取自 [lobe-icons](https://github.com/lobehub/lobe-icons)（MIT，标志归各自公司所有，只用于标明服务）。
