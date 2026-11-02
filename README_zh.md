<!-- Owner: app/main.cjs, core/companion.ts, console/index.ts. -->
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
  <a href="https://coo.palailab.org">官网</a> ｜
  <a href="#安装">安装</a> ｜
  <a href="#快速上手">快速上手</a> ｜
  <a href="#日常使用">日常使用</a> ｜
  <a href="#费用与隐私">费用与隐私</a> ｜
  <a href="#常见问题">常见问题</a> ｜
  <a href="#社区">社区</a> ｜
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases">更新记录</a> ｜
  <a href="docs/DEVELOPMENT.md">参与开发</a>
</p>

Coopanion 是一只住在屏幕底边的桌宠，名叫 Coo。它在底边走来走去，用气泡跟你聊天，按住说话键它就能听你说话；你同意的话，它还能看屏幕、点鼠标、敲键盘，帮你操作电脑。Windows、macOS 和 Linux 都能用。

界面有简体中文、繁體中文、English、日本語、한국어、Français、Deutsch、Español (Latinoamérica)、Português (Brasil)、Italiano、Русский 11 种语言。第一次启动时跟随系统语言，系统语言不在其中就用英文，之后可以在「习惯」页的「语言」里改。Coo 也用界面语言跟你说话。除简体中文和英文外，译文由模型翻译，发现不通顺的地方欢迎提 PR。

<p align="center"><img src="image/README/start-zh.png" alt="Coopanion 设置窗口：连接模型与 Coo 预览" width="960"></p>

## 功能

- 支持 DeepSeek、通义千问、Kimi、智谱 GLM、豆包、MiniMax、阶跃星辰、百度千帆、OpenRouter、OpenAI、Anthropic、Gemini、xAI，选一家，贴上 API Key 就能用。也可以登录 ChatGPT 账号，用你的 ChatGPT 套餐。
- 按住说话键说话，或者打字，Coo 在气泡里回你。语音默认在本机识别，也可以交给你配置的转写服务。
- Coo 会记住你。它对你的了解写在 `PARTNER.md`，更长的记忆按主题和日期整理。电脑上有 Git 时，Coo 改过的文字都留有历史版本；Windows 版自带 Git，macOS 和 Linux 用系统里装的 Git。
- 你允许后，Coo 可以看屏幕、点击、打字、切换窗口。这个功能默认关着，什么时候问你可以自己定；你一动鼠标或键盘它就先停手，按说话键开口能直接打断它。
- Coo 在想事情、看文件、搜索、写东西或操作电脑时，头顶会冒出对应的小图标。
- 形象可以选 Coo，或者 **DeepSeek 大肥鱼**（会动的鲸鱼娘，八套厂商配色，三套衣服）；别的形象包在「装扮」页导入，见[形象包兼容承诺](packages/cortico-world-desktop-pet/README.md#形象包兼容承诺)。
- Coo 有奶Coo、灯、杯、铸、心、冬等配色，头顶可以戴帽子、兽耳或光环，耳侧可以挂耳机、耳环或蝴蝶结，还有眼镜和颈饰。桌宠、气泡和字的大小分开调。
- 跟 Coo 说几点或者几分钟后提醒你，它会定好闹钟。
- 在「World 扩展 → 扩展市场」装 World，比如 QQ 机器人、画室和小游戏。
- 可以把 Coo 和气泡导出成 OBS 的「浏览器」来源，背景透明，直播时能叠在画面上。

每个版本改了什么，见 [Releases](https://github.com/Pal-AI-Lab/Coopanion/releases)。

## 安装

你需要：

- Windows 10 / 11（64 位）、macOS 13 及以上（Apple 芯片和 Intel 都行），或者 64 位 Linux 桌面（X11，或 Wayland 下的 XWayland；语音识别要 glibc 2.32 及以上，也就是 Ubuntu 22.04、Debian 12 及更新的版本）；
- 一家模型服务的 API Key，按用量付费（见[费用与隐私](#费用与隐私)），或者一个开了套餐的 ChatGPT 账号。

每个版本的发布页都附有 `SHA256SUMS.txt`，可以用来核对下载的文件。

### Windows

- **安装包**：从[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)下载 `Coopanion-Setup-版本号.exe` 并运行。安装包没有数字签名，Windows 可能提示「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。默认装在 `%LOCALAPPDATA%\Programs\Coopanion`，程序和数据都在这个目录里。别装进 Program Files 这类要管理员权限的目录，Coopanion 在那里写不了数据，会提示后退出。开始菜单里没有它，从桌面图标打开。
- **一行命令**：在 PowerShell 里运行

  ```powershell
  irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
  ```

  如果杀毒软件拦下了图形界面的安装，脚本会保留下载好的安装包并打印路径。可以用 `Coopanion-Setup-版本号.exe /S` 静默安装，或者先把 Coopanion 加进杀毒软件的白名单再装。
- **便携版**：从[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)下载 `Coopanion-版本号-win-x64-portable.zip`，解压到任意文件夹，运行 `Coopanion.exe`。数据放在这个文件夹的 `data` 里。整个文件夹复制一份就是另一只 Coo，记忆和设置互不影响；安装版和便携版加起来最多同时开 5 只。便携版不会自动更新，升级时把新版解压到新文件夹，再把旧的 `data` 拷过去。

### macOS

1. 从[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)下载 `Coopanion-版本号-mac-arm64.dmg`（Apple 芯片）或 `…-mac-x64.dmg`（Intel），打开后把 Coopanion 拖进「应用程序」。
2. 应用没有 Apple 开发者签名，也没有经过公证，第一次打开会被拦下。先打开一次，在提示里点「完成」，再到「系统设置 → 隐私与安全性」点「仍要打开」，输入密码确认。
3. Coopanion 的图标在屏幕顶部的菜单栏里，只有打开设置窗口时才会出现在程序坞。

App Store 在前台时，Coo 会退到其他窗口后面，免得挡住购买时的触控 ID 确认。

> [!NOTE]
> 第一次用到时，macOS 会分别询问麦克风（语音输入）、输入监控（说话键）、录屏与系统录音和辅助功能（操作电脑）的权限；操作电脑时切换应用，还会请求控制「System Events」。录屏、输入监控和辅助功能改完要重启 Coopanion。更新后 macOS 不会把这些授权沿用到新版本：如果开关开着却提示没有权限，用「−」把 Coopanion 从那个列表里移除，再把 `/Applications/Coopanion.app` 加回来，然后重启。

### Linux

1. 从[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest)下载 `Coopanion-版本号-linux-x64.deb`（Debian / Ubuntu）或 `Coopanion-版本号-linux-x64.AppImage`（其他发行版）。
2. deb：`sudo apt install ./Coopanion-版本号-linux-x64.deb`。AppImage：先装好发行版提供的 FUSE 2 兼容库，执行 `chmod +x Coopanion-*.AppImage`，再运行它。

> [!NOTE]
> 桌宠是一个透明的置顶窗口，桌面要开着窗口合成（GNOME 和 KDE 默认开着）。托盘图标要桌面支持状态栏图标（GNOME 需要装 AppIndicator 扩展）；没有托盘也能右键 Coo 打开设置。操作电脑要用到 `xdotool` 和 `zenity`，deb 会自动装上；Wayland 下截屏还需要 `grim`、`spectacle`、`scrot` 或 ImageMagick 中的一个。

## 快速上手

1. **启动**：Coo 落到屏幕底边，任务栏（Mac 上是菜单栏，Linux 上是状态栏）多出一个图标，不会弹出窗口。
2. **跟着引导设置**：Coo 会在气泡里问你界面语言、从哪里知道它的（可以跳过）、希望它怎么称呼你、Coo 是什么性子、多久走动一次、哪些互动要回应、用哪家模型服务，最后下载语音识别模型：FunASR 约 230 MB；界面语言是法、德、西、葡、意、俄语时下载 Whisper，约 360 MB。模型从 ModelScope 下载，下不了时改用 Hugging Face。点气泡上的 × 可以结束引导，以后在「开始」页点「使用向导」重来。想调整它的性格和说话方式，引导结束后直接跟它说，它会自己把人设写进提示词。
3. **说第一句话**：快速按一下**左 Alt**（Mac 上是**左 Option**），紧接着按住，说「你好」，松开就发出去了。系统询问麦克风权限时选允许。

<details>
<summary><b>连接模型：API Key 或 ChatGPT 登录</b></summary>

在 Coo 的气泡或「开始」页选一家服务，到它的平台创建 API Key（DeepSeek 还要先充值），贴进来就行。

| 服务 | 申请 Key | 默认模型 |
| --- | --- | --- |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `deepseek-flash` |
| 通义千问（阿里云百炼） | 国内 [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key)，国际 [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/settings/api-key) | `qwen3.8-flash` |
| Kimi（月之暗面） | 国内 [platform.kimi.com](https://platform.kimi.com/console/api-keys)，国际 [platform.kimi.ai](https://platform.kimi.ai/console/api-keys) | `kimi-k3` |
| 智谱 GLM | 国内 [bigmodel.cn](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)，国际（Z.ai）[z.ai](https://z.ai/manage-apikey/apikey-list) | `glm-5.3-flash`（国内平台连不上可以换成 `glm-5.3`，但它不能看图，没法操作电脑） |
| 豆包（火山方舟） | [ark.volcengine.com](https://ark.volcengine.com/region:cn-beijing/apikey) | `doubao-seed-2-1-lite-260915`（要先在方舟控制台「开通管理」里开通） |
| MiniMax | 国内 [platform.minimax.cn](https://platform.minimax.cn/user-center/basic-information/interface-key)，国际 [platform.minimax.io](https://platform.minimax.io/user-center/basic-information/interface-key) | `MiniMax-M3` |
| 阶跃星辰 | [platform.stepfun.com](https://platform.stepfun.com/interface-key) | `step-3.7-flash` |
| 阶跃 Step Plan | [platform.stepfun.com](https://platform.stepfun.com/interface-key) | `step-5-preview`（扣 Step Plan 套餐额度） |
| 百度千帆 | [console.bce.baidu.com](https://console.bce.baidu.com/iam/#/iam/apikey/list) | `glm-5.3-flash` |
| OpenRouter | [openrouter.ai](https://openrouter.ai/settings/keys) | `deepseek/deepseek-v4.1-flash` |
| OpenAI | [platform.openai.com](https://platform.openai.com/settings/organization/api-keys) | `gpt-6-luna` |
| Anthropic | [platform.claude.com](https://platform.claude.com/settings/keys) | `claude-haiku-5-5` |
| Gemini（Google AI Studio） | [aistudio.google.com](https://aistudio.google.com/apikey) | `gemini-3.5-flash-lite` |
| xAI | [console.x.ai](https://console.x.ai/team/default/api-keys) | `grok-4.3` |

表里是应用[供应商表](packages/cortico-provider-coo/src/vendors.ts)中的默认模型。想用别的模型，在「开始」页的「模型」框里改；要让 Coo 操作电脑，模型得支持图片输入。通义千问、Kimi、智谱 GLM、MiniMax 分国内和国际两个平台，账号和 Key 不通用。新建连接时，界面语言是简体中文就默认用国内平台，其他语言默认用国际平台，可以在「开始」页切换。豆包、百度千帆、阶跃星辰和阶跃 Step Plan 只能用中国大陆账号。我们拿真实 Key 测过的只有 DeepSeek、Anthropic 和阶跃 Step Plan，其他几家连不上请开 issue。

**ChatGPT** 不需要 Key：选它，点「使用 ChatGPT 继续」，在打开的浏览器里登录。Coo 用的是这个账号的 ChatGPT 套餐额度，用到上限后它会暂时不说话，每 5 分钟重试一次。

</details>

## 日常使用

### 说话与互动

- **说话**：快速按一下**左 Alt**（Mac 上是**左 Option**），紧接着按住说话，松开发送。说话键、麦克风、说话门槛和收音方式（按住说话键时收音、用说话键切换收音、持续收音）在「语音输入」页改。麦克风选系统默认时，你换了系统的默认输入设备，Coo 也跟着换。所选的麦克风拔掉或找不到时，Coo 改用系统默认输入设备，插回后再换回来。收音开着回声消除和降噪，不开自动增益，Coo 不会改动系统的麦克风音量；声音太小时，在系统设置里调高输入音量。
- **打字**：鼠标移到 Coo 身上，点旁边的气泡按钮；也可以在「对话」页里打字。打开「习惯 → 打字键」后，在任何窗口都能叫出打字框（默认双击左 Ctrl）。打字框一条消息最多贴 4 张图，「对话」页最多 8 张。
- **换键**：说话键和打字键都可以改成别的键、组合键或鼠标侧键，按一到三下触发。两个设成同一个键时，快速双击打开打字框；最后一下按住超过 300 毫秒才开始收音，这时不会打开打字框。这 300 毫秒里说的话也会收进去；开了「按住时才打开麦克风」时，麦克风要到这时才打开，请等倾听气泡出现再说话。
- **气泡**：鼠标停在气泡上，气泡就不会收起。状态气泡、输入气泡、气泡和字的大小、出字速度在「习惯」页调。
- **闹钟**：定好的闹钟在「应用通知」页的「闹钟」里能看到，也能删掉，删了 Coo 会知道。每天的闹钟遇到夏令时切换，仍按原来的当地时间响。应用关着时错过的闹钟，下次启动会补上。
- **互动**：点一下是戳它，在它头上来回划是摸头，按住拖动是把它拎起来。拖到一半松手能把它甩出去，拎到另一块屏幕上松手，它就留在那块屏幕上。哪些互动它会马上回应，在「习惯 → 回应模式」里选。

语音默认在本机识别：中、英、日、韩语用 FunASR，法、德、西、葡、意、俄语用 Whisper，Windows 上还可以用系统自带的识别。也可以在「语音输入」页改用 **OpenAI 兼容**的转写服务，这时每句录音都会发给那个服务。

右键 Coo 可以打开设置、打字框和装扮，开关语音输入、音效和夜间模式，也能暂停 / 继续、隐藏和退出。关掉设置窗口不会退出应用。托盘菜单（Mac 上是菜单栏图标）里还有「开机自动启动」「重新启动」和「鼠标穿透」。打开鼠标穿透后，点击都会穿过 Coo 落到下面的窗口，它照常走动和说话，玩游戏时比较方便；这个开关只在本次运行有效，再点一次或退出应用就恢复。

### 装扮与声音

在「装扮」页换形象、配色和配件，配件的主色和点缀色也能调，改了马上生效。形象包可以从 zip 或文件夹导入，也可以直接拖到页面上；导入的形象包也在这里卸载。

也可以直接让 Coo 给自己换。默认它能自己改形象、配色、走动和打呼，改大小、音效、夜间模式、称呼这些会先问你；放宽或收紧在「习惯 → 自主配置权限」里调。

<p align="center"><img src="image/README/dress-zh.png" alt="装扮：Coo 配色、帽子和配件" width="960"></p>

在「习惯 → 音效」里可以选要响的声音、调桌宠所有声音的音量，还可以让声音跟着 Coo 在屏幕上的位置偏左或偏右。打开「说话声 → 念出气泡文字」后，Coo 出字时会念出一串短音节，代替原来的说话音效，音高和语速都能调。这些设置只管桌宠的声音，其他 World 的声音在它们自己的页面里设置。

<p align="center"><img src="image/README/habits-zh.png" alt="习惯：桌宠音量、左右声道与说话声配置" width="960"></p>

想在 OBS 里放 Coo：打开「习惯 → 其他 → 导出 OBS 画面」，把显示的地址加成 OBS 的「浏览器」来源，宽高填屏幕分辨率。画面里只有 Coo 和气泡，背景透明。

### 让 Coo 操作电脑

这个功能默认关着。在「习惯 → 电脑操作」打开「让 Coo 操作这台电脑」，看完风险说明后确认。只想让它看屏幕、不碰鼠标键盘，就关掉「允许操作鼠标和键盘」。

什么时候问你，有四档可选：

| 询问时机 | 什么时候问 |
| --- | --- |
| 每轮询问 | 每一轮第一次看屏幕或动鼠标键盘之前 |
| 操作前询问 | 看屏幕不问；每一轮第一次动鼠标键盘之前问 |
| 询问一次（默认） | 看屏幕不问；动手前问一次，同意后在有效期内不再问，有效期默认 30 分钟 |
| 从不询问 | 都不问 |

- 平时在气泡里问你，桌宠隐藏时改用系统对话框。
- Coo 在终端里打字或按 Win+R 之前，会另外问你一次，同意后同样在有效期内不再问。不想被问，可以在高级模式的「桌宠 → 配置」里关掉。
- 只有你在桌宠这边说的话、打的字和选的选项能让 Coo 动手。其他 World 发来的操作请求，它会先在气泡里问你。
- 你一动鼠标或键盘，Coo 就先停下，等你停手两秒（默认）再继续；你一直在用、等满 15 秒，它就放弃这一步。你给它打字时，它也会先等你打完。
- 用说话键说的话转写完就会打断 Coo：正在生成的回复和还没做的步骤都会停下，已经开始的点击、拖拽或一串按键会做完再停。收音方式是「持续收音」时，听到的话不会打断它。
- 登录、输密码、付款这些步骤请自己来。一次唤醒默认最多请求模型 40 次，到上限它会停下，想继续就再跟它说一声；上限可以在高级模式里改「单次唤醒上限」。

### 设置窗口

点托盘图标，或者右键 Coo 选设置，就能打开设置窗口。

| 页面 | 内容 |
| --- | --- |
| 开始 | 连接模型、显示或隐藏桌宠、界面配色、重新走一遍引导 |
| 习惯 | 语言和称呼、自动更新、使用统计、走动和回应、Coo 能自己改哪些设置、快捷键、显示、声音、电脑操作、OBS 画面 |
| 装扮 | 形象、配色和配件，导入或卸载形象包 |
| 语音输入 | 识别引擎或转写服务、下载模型、说话键、麦克风、收音方式、说话门槛 |
| 系统提示词 | 人设和提示词模板；Ctrl+S 保存，点「立即应用」后当前对话就用上新提示词 |
| 用量与成本 | 按日期和模型看 token 用量和花费 |
| 对话 | 聊天记录、打字、图片 |
| World 扩展 | 已装的 World、分组和排序，扩展市场 |

侧栏底部可以暂停和继续运行，也能切到「高级模式」。高级模式多出「模型供应商」、Persona、Memory、「控制台」和「运行诊断」几页。在「模型供应商」里可以换模型、调推理强度、接入其他兼容的服务、给没有内置价目的服务填价目，也可以装供应商扩展。

### World 扩展

在「World 扩展 → 扩展市场」里可以搜索 World，按类别或标签筛选，点卡片上的「添加到我的 World」安装，也可以先点开详情看看。收录在[官方索引](https://github.com/Pal-AI-Lab/cortico-extensions)里的扩展还有标签、投票和评论，评论要登录 GitHub。注意事项标签可以排除，排除后带这个标签的扩展不再出现，下次打开也还记得。

装好的扩展会先出现在「待生效」里，点「重启进程」后生效。在「我的 World」里，你可以：

- 给 World 分组、拖动排序，侧栏也按这个顺序排；
- 点名字或头像看扩展详情，进入它的配置；
- 把 World 从侧栏藏起来，或者让它照常运行、但不让 Coo 看到它的工具和消息，也可以停用、单独重启或删除它。

运行中的 World 不能删除，要先停用。删除的 World 会标红留在「待生效」里，重启进程后才消失。

<p align="center"><img src="image/README/worlds-zh.png" alt="World 扩展：已安装的 World、状态与分组入口" width="960"></p>

供应商扩展在「高级模式 → 模型供应商 → 扩展市场」里，还有连接在用的不能删除，要先删掉这些连接。装的扩展都放在数据目录中，重装应用后还在。

### 更新

Windows 安装版和 AppImage 会在后台下载新版本，下好后 Coo 会问你要不要重启更新；选「下次再说」，就等你退出应用时再装。不想自动更新，可以关掉「习惯 → 通用 → 自动更新」，之后不再检查和下载，已经下好的更新也不会装。

Mac 版、deb 和 Windows 便携版不会自动更新。有新版本时，设置窗口的标题栏会出现下载链接，下载后自己安装。

## 费用与隐私

- **费用**：Coopanion 免费。聊天的费用由你选的模型服务按用量收取，在「用量与成本」页能看到。DeepSeek、OpenAI、Anthropic、Gemini 付费档和 xAI 有内置价目，金额可以按实时汇率换算成别的币种（取不到汇率时用内置汇率）。登录 ChatGPT 时用的是套餐额度，不显示费用。
- **会发给模型服务的**：你说的话、打的字、附带的图片、你和 Coo 的互动，以及操作电脑时的截图。只发给你配置的那一家。
- **留在你电脑上的**：API Key 和 ChatGPT 的登录状态、记忆、聊天记录、设置和日志。语音在本机识别，只发出识别出来的文字；如果在「语音输入」页选了转写服务，每句录音会发给那个服务。
- **匿名使用统计**：发到 `survey.palailab.org`，内容是版本号、系统和硬件概况、用的哪家模型、装了哪些扩展、使用次数和时长、设置、程序崩溃时出错的位置，以及一个随机生成的安装编号；不含对话、截图、Key、错误消息和你的文件。每个字段见 [docs/TELEMETRY.md](docs/TELEMETRY.md)。在「习惯 → 通用 → 使用统计」里可以关掉。
- **其他联网**：向 GitHub 查询新版本（Windows 安装版和 AppImage 在启动时和之后每 6 小时查一次，关掉自动更新就不查；其他版本在打开设置窗口时查）；扩展市场访问 npm 和 GitHub 上的官方扩展索引，投票和评论要访问 GitHub；下载语音模型时访问 ModelScope，失败了改用 Hugging Face。

## 数据与卸载

| 系统 | 数据位置 | 卸载 |
| --- | --- | --- |
| Windows | 安装目录下的 `data`；便携版是它所在文件夹的 `data` | 在「设置 → 应用」里卸载；便携版先关掉托盘里的「开机自动启动」，再删文件夹 |
| macOS | `~/Library/Application Support/Coopanion` | 把「应用程序」里的 Coopanion 拖进废纸篓 |
| Linux | `~/.config/Coopanion` | deb：`sudo apt remove coopanion`；AppImage：删掉文件 |

卸载安装版不会删数据。便携版的 `data` 就在它的文件夹里，删文件夹前记得备份。确定不要了，就手动删掉数据目录；Windows 上删整个安装目录，再删掉记录数据位置的 `%LOCALAPPDATA%\Coopanion`。数据目录里，`home` 放记忆、聊天记录、设置和 API Key，`home/models` 放语音模型，`extensions` 放扩展，`logs` 放日志。

在 Windows 上重装到新目录后，第一次启动会问你：接着用之前的数据，还是新建一只。

## 常见问题

<details>
<summary><b>桌宠不见了</b></summary>

右键托盘图标，选「显示桌宠」；托盘图标被收起来时，先点任务栏右下角的 `^`。再打开一次程序也行。Mac 上点菜单栏图标，选「显示桌宠」。

</details>

<details>
<summary><b>点不到 Coo，点击直接穿过了它</b></summary>

托盘菜单里的「鼠标穿透」开着。再点一次把它关掉，或者重启 Coopanion。

</details>

<details>
<summary><b>Coo 不说话 / 没反应</b></summary>

先看「开始 → 已连接的模型」和侧栏底部的运行状态。显示**已暂停**，点「继续运行」。显示**暂未连接**，检查 API Key 有没有贴全、账户有没有余额，再点「保存并开始」；已经连上的可以点「测试连接」再查一次。通义千问、Kimi、智谱 GLM、MiniMax 的 Key 只能在申请它的平台（国内或国际）上用；豆包要先在方舟控制台开通默认模型。

模型请求连续失败 5 次后，Coo 会在气泡里告诉你出了什么错。Key 被拒或者模型名不对时，气泡上有打开设置的按钮；被限流或服务出错时，它会让你等一会儿再试。

</details>

<details>
<summary><b>它听不到我说话</b></summary>

- Coo 旁边的麦克风按钮没有被划掉；
- 先快速按一下左 Alt，再按住（两下隔得太久不算）；
- 「语音输入」页显示识别服务已就绪（提示模型没下载就点「下载」），说话时电平条在跳；
- Windows：在「设置 → 隐私和安全性 → 麦克风」里允许桌面应用使用麦克风；
- Mac：在「系统设置 → 隐私与安全性」里给 Coopanion 打开「麦克风」和「输入监控」，改完重启 Coopanion。

</details>

<details>
<summary><b>需要走代理</b></summary>

Coopanion 用系统代理（HTTP 或 HTTPS 代理，SOCKS 代理不生效），每次请求都按当时的系统设置走，所以开关代理软件不用重启 Coopanion，PAC 脚本也会按网站分别生效。启动 Coopanion 的环境里设了 `HTTP_PROXY` / `HTTPS_PROXY` 时，以环境变量为准。本机内部的通信不走代理。

</details>

<details>
<summary><b>Linux 上 Coo 走过的地方留下方块残影</b></summary>

用 Intel 核显（Mesa 的 iris 驱动）时，快速清屏会在透明窗口里留下旧画面。启动时设置环境变量 `INTEL_DEBUG=nofc` 把它关掉，比如 deb 版运行 `INTEL_DEBUG=nofc coopanion`；有独立显卡的话，改用独显渲染也能解决。

</details>

<details>
<summary><b>桌宠所在的屏幕整块变黑</b></summary>

有些 Windows 电脑开着硬件加速时，透明窗口会画成黑色。可以在快捷方式「目标」一栏的末尾加上 ` --disable-gpu-compositing` 试试。

</details>

<details>
<summary><b>想看它在想什么</b></summary>

「对话」页有完整记录。遇到问题时，打开高级模式，在「运行诊断」页点「导出诊断」，把诊断包附在 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues) 里。

</details>

## 社区

- QQ 4 群：1080323271
- QQ 5 群：702451490
- 1 群 1080755910、2 群 1129285246、3 群 1132082279 已满
- [Discord](https://discord.gg/DR37WB5zJf)

## 反馈与参与

- 有问题或建议请提 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues)，写上系统版本、Coopanion 版本和复现步骤。
- 想从源码构建或改代码，见[开发文档](docs/DEVELOPMENT.md)。

## 致谢

谢谢每一位给 Coopanion 写过代码的朋友：

<a href="https://github.com/Pal-AI-Lab/Coopanion/graphs/contributors"><img src="https://contrib.rocks/image?repo=Pal-AI-Lab/Coopanion" alt="Coopanion 的贡献者"></a>

也谢谢在 Issue、QQ 群和 Discord 里报问题、提建议的各位。

Coopanion 用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装：Cortico Core + Cormini Persona + [桌宠 World](packages/cortico-world-desktop-pet)（含电脑操作）。

## Star 趋势

<a href="https://star-history.com/#Pal-AI-Lab/Coopanion&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Pal-AI-Lab/Coopanion&type=Date&theme=dark">
    <img src="https://api.star-history.com/svg?repos=Pal-AI-Lab/Coopanion&type=Date" alt="Coopanion 的 Star 趋势" width="720">
  </picture>
</a>

## 许可

[AGPL-3.0-or-later](LICENSE)，按第 7 条附加许可：允许与 Steam 版加载的 Steamworks API 库链接。0.1.10 及之前发布的版本是 MIT。框架 Cortico 是 MIT，以子模块随附。提 PR 前请看 [CONTRIBUTING.md](CONTRIBUTING.md)，第一次提交需要签[贡献者许可协议](CLA.md)。

DeepSeek 大肥鱼形象（`packages/cortico-world-desktop-pet/web/whale/` 下的贴图）不在 AGPL 授权范围内，来源和各家标志的说明见[桌宠 World 的第三方声明](packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md)。随附或运行时下载的第三方组件：Electron（MIT）、Cortico（MIT）、sherpa-onnx（Apache-2.0）、FunASR 的 SenseVoiceSmall 模型（[FunASR 模型开源协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)，用到时下载）、OpenAI 的 Whisper small 模型（MIT，用到时下载）、koffi（MIT）、jpeg-js（BSD-3-Clause）、pnpm（MIT），Windows 版还带有 Git for Windows 的 MinGit（GPL-2.0）；各家模型服务的标志取自 [lobe-icons](https://github.com/lobehub/lobe-icons)（MIT，标志归各自公司所有，只用来标明是哪家服务）。
