<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="CortiCompanion" width="806">
  </picture>
</p>

<p align="center"><b>你的小小万能桌面伴侣</b></p>

<p align="center">
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pal-AI-Lab/Coopanion?color=00a870"></a>
  <a href="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 / 11" src="https://img.shields.io/badge/Windows-10%20%2F%2011-1f6feb">
  <img alt="macOS 13+" src="https://img.shields.io/badge/macOS-13%2B-1f6feb">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-8b8b8f"></a>
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#快速上手">快速上手</a> ·
  <a href="#日常使用">日常使用</a> ·
  <a href="#常见问题">常见问题</a> ·
  <a href="docs/DEVELOPMENT.md">参与开发</a>
</p>

桌宠 **Coo** 住在你的屏幕底边。它会用气泡和你聊天、听你说话、在屏幕底边走来走去,也能在你允许时帮你操作电脑。Windows 和 macOS 都能用。

![设置窗口的「开始」页与桌面上的桌宠](docs/images/home.png)

## 它能做什么

- **换哪家模型都行**:DeepSeek、通义千问、Kimi、智谱 GLM、豆包、百度千帆、MiniMax、阶跃星辰、OpenRouter,点一下标志、贴上 Key 就能用。
- **陪你聊天**:快速按一下左 Alt(Mac 是左 Option)、紧接着按住说话,或者直接打字,Coo 在气泡里回你。语音用 FunASR 在你电脑上识别。
- **记得你**:会记住你们聊过的事,也知道你刚才戳了它、摸了它的头。
- **帮你动手**:让它帮你点按钮、打字、切窗口。每次动手前它都会先问你。
- **打扮它**:换配色、帽子、耳饰、眼镜、颈饰,调它的大小和走动习惯。
- **装新本事**:从扩展页装上 QQ 机器人、画室、小游戏等 World。

## 安装

需要 **Windows 10 / 11(64 位)** 或 **macOS 13 以上**(Apple 芯片和 Intel 都行),还需要一家模型服务的 API Key(默认推荐 [DeepSeek](https://platform.deepseek.com/),按用量付费,见[费用与隐私](#费用与隐私))。
安装不需要管理员权限。

### Windows:下载安装包

1. 打开[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest),下载 `CortiCompanion-Setup-版本号.exe`。
2. 双击运行。安装包没有数字签名,Windows 可能弹出「Windows 已保护你的电脑」:点 **更多信息** → **仍要运行**。
3. 选安装位置(默认 `C:\Users\你的用户名\CortiCompanion`),点安装。装好后会自动启动,桌面上会有它的图标。

> [!NOTE]
> 程序和它写下的所有文件都在安装目录里,AppData 里不放任何东西,所以开始菜单里没有它,从桌面图标打开。

### Windows:一行命令

在开始菜单搜 **PowerShell**,打开后粘贴这一行,回车:

```powershell
irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
```

它会下载最新的安装包并运行,效果和上面相同,装完会删掉下载的安装包。

### macOS

1. 打开[最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest),Apple 芯片的 Mac 下载 `CortiCompanion-版本号-mac-arm64.dmg`,Intel 的下载 `…-mac-x64.dmg`。
   不确定是哪种:点左上角苹果菜单 →「关于本机」,「芯片」一栏写着 Apple M 系列就是 Apple 芯片。
2. 双击 dmg,把 CortiCompanion 拖进「应用程序」。
3. 第一次打开:应用没有 Apple 开发者签名,系统会拦下。先双击打开一次,看到提示后点「完成」;
   再到「系统设置 → 隐私与安全性」,页面底部有一行说 CortiCompanion 被阻止,点「仍要打开」,输入密码确认。之后就能正常打开。
4. 它住在屏幕顶部的**菜单栏**里,程序坞里没有它的图标(打开设置窗口时才出现)。

> [!NOTE]
> Mac 上的数据在 `~/Library/Application Support/CortiCompanion`。第一次用到时,系统会分别询问:
> 麦克风(语音输入)、输入监控(说话键)、录屏与系统录音和辅助功能(让 Coo 操作电脑)。
> 不想让它碰电脑,后两项不给就行。改了「输入监控」「辅助功能」「录屏」之后要重启 CortiCompanion 才生效。

## 快速上手

1. **启动**:Coo 从屏幕顶上掉到底边,任务栏右下角(Mac 是屏幕顶部菜单栏)多一个图标。不会弹出任何窗口。
2. **跟着引导走**:第一次启动时,Coo 就在屏幕底边冒气泡和你对话,答案直接在气泡里点选或填写:
   1. 打个招呼,问你怎么称呼;
   2. 问你希望它安静还是活泼:点「不乱动 / 多待着 / 常走动」三张卡片,它马上站着不动、溜达起来或者跑来跑去给你看;
   3. 问你用哪家模型服务:气泡里是一排带标志的卡片,DeepSeek 排第一,拿不准就选它;再把那一家的 API Key 贴进气泡里的输入框,当场连一下,连上了它会高兴地跳起来;
   4. 一键下载语音识别模型(FunASR,约 230 MB,从国内的 ModelScope 下载,气泡里有进度条),再教你怎么和它说话;
   5. 告诉你按钮、菜单和设置在哪。

   气泡右上角的 × 随时可以结束引导。之后在设置窗口「开始」页右上角点「使用引导」,Coo 会在屏幕底边再带你走一遍。
   引导里选了「稍后再填」Key 也没关系:只要还没填,它过一阵会在气泡里再问你要;你对它说话时也会提醒。
3. **打个招呼**:快速按一下**左 Alt**(Mac 是**左 Option**),紧接着按住它说「你好」,松开发送。第一下按完 Coo 会先抬头看你,按住时它就开始听。第一次系统会问能不能用麦克风,选「允许」。

<details>
<summary><b>怎么拿到 API Key?</b></summary>

以 DeepSeek 为例:

1. 打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys),注册并登录;
2. 在「充值」里充值(按用量计费,注意 token 消耗);
3. 进入「API Keys」→「创建 API key」,复制那串 `sk-` 开头的字符,贴进 Coo 的气泡或「开始」页里。

别家的申请页,在气泡或「开始」页选中那一家后点「去 … 申请」就能打开:

| 服务 | 申请 Key | 默认模型 |
|---|---|---|
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `deepseek-flash` |
| 通义千问(阿里云百炼) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key) | `qwen3.8-flash` |
| Kimi(月之暗面) | [platform.kimi.com](https://platform.kimi.com/console/api-keys) | `kimi-k3` |
| 智谱 GLM | [bigmodel.cn](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) | `glm-5.3-flash`(智谱的 Responses 文档只示范了 `glm-5.3`,连不上就换成它) |
| 豆包(火山方舟) | [ark.volcengine.com](https://ark.volcengine.com/region:cn-beijing/apikey) | `doubao-seed-2-1-lite-260915`(要先在方舟控制台「开通管理」里开通这个模型) |
| 百度千帆 | [console.bce.baidu.com](https://console.bce.baidu.com/iam/#/iam/apikey/list) | `glm-5.1`(千帆的 Responses 接口没有文心模型,也没有能看图的) |
| MiniMax | [platform.minimax.cn](https://platform.minimax.cn/user-center/basic-information/interface-key) | `MiniMax-M3` |
| 阶跃星辰 | [platform.stepfun.com](https://platform.stepfun.com/interface-key) | `step-3.7-flash` |
| OpenRouter | [openrouter.ai](https://openrouter.ai/settings/keys) | `deepseek/deepseek-v4.1-flash` |

默认模型是每家最新一代里便宜、能看图的那档(千帆没有这样的模型)。想用别的,在引导里选完服务后把模型名改掉,或者在「开始」页的「模型」框里填,输入时会列出几个推荐的。

DeepSeek 以外的几家是按各自文档接入的,还没拿真实的 Key 逐家试过;哪家连不上或回话出错,欢迎开 issue。

</details>

## 日常使用

### 和 Coo 说话

| 方式 | 怎么做 |
|---|---|
| 语音 | **快速按一下左 Alt、紧接着按住**(Mac 是左 Option)说话,松开就算一句。Coo 会歪头听,在虚线气泡里边听边显示听到的字(灰色部分还可能改)。 |
| 打字 | 鼠标停在 Coo 身上,点身旁的气泡按钮;或者双击 Coo。 |
| 麦克风按钮 | 鼠标停在 Coo 身上时,身旁的麦克风按钮能开关语音输入(角上的 KEY / AUTO 表示按键收音还是一直在听);正在听时**长按**它,这句话马上发出,不用等停顿。 |
| 回答提问 | Coo 有时会给几个选项:点一下,或者按键盘上的 1–3;都不合适就在最后一格自己写。 |

说话键、麦克风、收音方式(按住说 / 按一下开关 / 一直听)都在设置窗口的「语音输入」页里改。说话键可以是单个键、组合键(比如 `Ctrl + Space`),也可以是连按:在「说话键」按钮上点一下,再把想要的键连按两下,就设成「快速按一下再按住」。

语音默认用 **FunASR**(阿里巴巴通义实验室的 SenseVoiceSmall 模型)在你自己的电脑上识别,中文准,录音不上传。
模型约 230 MB,第一次用时在引导的气泡里或「语音输入」页点一下「下载」就行,从 ModelScope 下载(国内直连),下完就一直能用。
Windows 上也可以换成系统自带的识别,不用下载,但没那么准。

### 和 Coo 互动

- **点一下**:戳戳它;**在它头上来回划**:摸头;**按住拖起来**:拎起来,还能甩出去。它会有反应,也会知道你做了什么。
- **右键**打开菜单,全是圆形图标按钮,鼠标停上去有说明:
  - 上面一排是 Coo 的头像和名字,然后是继续 / 暂停、打开设置、退出(点一下先问,再点才退出);
  - 下面是各项功能:打字、语音输入(开 / 关,角上标着 KEY 或 AUTO)、行为模式(仪表盘图标,低 · 中 · 高三档轮换)、
    夜间模式(月亮 / 太阳)、音效(开 / 静音)、装扮(小衣服,鼠标停上去会变色)、隐藏。开着的开关会亮起来。
- **悬停按钮**:鼠标停在 Coo 身上,旁边默认出现「打字」「语音」两个按钮。想换成别的、最多放六个,在设置窗口「习惯」页的「悬停按钮」里点选。

### 让 Coo 操作电脑

电脑操作默认开着,但 Coo 每一轮要看屏幕或动鼠标键盘之前,都会冒气泡问你:

- 点「可以」它才动手;选「这次不行」,这一轮它就不动。
- 你一碰鼠标或键盘,它会先停下来等你。
- 登录、密码、付款这些步骤,它会交给你自己来。

不想让它碰电脑:打开设置窗口的[高级模式](#设置窗口),在左栏「电脑操作」页关掉。

### 托盘 / 菜单栏

程序一直在后台运行。关掉设置窗口不会退出;再打开一次程序(Windows 双击桌面图标,Mac 在「应用程序」里打开),只会把 Coo 叫回来。

Windows:右键任务栏右下角的托盘图标,可以打开设置、显示桌宠、设为开机自动启动、重新启动或退出;左键单击直接打开设置。
Mac:点屏幕顶部菜单栏里 Coo 的图标,是同一份菜单。

## 设置窗口

点托盘(菜单栏)图标,或者在 Coo 身上右键点齿轮,都能打开设置窗口。默认是**普通模式**,只有关于桌宠的几页:

| 页面 | 能做什么 |
|---|---|
| 开始 | 连接模型、看 Coo 醒着没有、显示桌宠、重看引导。左栏底部是暂停 / 继续。 |
| 习惯 | 怎么称呼你、走动多少、颜色、大小(拖动时 Coo 跟着变)、音效、悬停按钮 |
| 装扮 | 配色、帽子、耳饰、眼镜、颈饰,改动立刻生效 |
| 语音输入 | 开关、识别引擎、识别模型下载、说话键、麦克风、收音方式,还有电平条和听到的内容 |
| 用量与成本 | 每天用了多少 token、花了多少钱 |

左栏底部的「**高级模式**」会显示全部页面:对话记录、World、模型、扩展、记忆、系统提示词、电脑操作、运行诊断。
点「回到普通模式」可以收起。你选的模式会被记住。

### 换模型

「开始」页的「连接模型」一栏列着 Coo 支持的几家服务,点一家、填好模型名(默认已填好)、贴上它的 Key,就换过去了。每家各存一份 Key,换回来不用重填;只改正在用的这家的模型时 Key 可以留空。
默认用 DeepSeek 的 `deepseek-flash`。它能看截图,电脑操作需要这个能力;除百度千帆外,各家的默认模型都能看图。在高级模式的「模型」页里可以:

- 换模型、调整思考档位:不思考 / 快 / 标准 / 最深(各家接受的档位不同,会自动换成那一家支持的值);
- 新建连接,选「OpenAI Responses Compatible」,接入其他兼容 Responses API 的服务;
- 在「用量与成本」页看花了多少钱。DeepSeek 的高峰和错峰价格已经按时段计入;别家没有内置价目,可以在「模型」页的价目里自己填。

### 装扩展

高级模式的「扩展」页列出 npm 上带 `cortico-world` 关键字的 World,例如:

- QQ 机器人(`cortico-world-qq-better`)
- 画室与你画我猜(`cortico-world-canvas`)
- 植物大战僵尸(`cortico-world-pvz`)
- 杀戮尖塔(`cortico-world-sts-1`)

点安装,装好后点「重启进程」,再到「World 总览」里启用。重装应用不会丢扩展。

## 费用与隐私

- **费用**:CortiCompanion 本身免费。和 Coo 聊天要调用你选的模型服务,费用由那一家按用量从你的账户扣,在「用量与成本」页能看到(内置价目的只有 DeepSeek)。
- **会发给模型服务的内容**:你说的话和打的字、你和 Coo 的互动,以及电脑操作时的屏幕截图。这些内容只发给你配置的模型服务(默认 DeepSeek)。
- **留在你电脑上的内容**:API Key、记忆、对话记录、设置、日志,全部存在数据文件夹里(Windows 在安装目录的 `data`,Mac 在 `~/Library/Application Support/CortiCompanion`)。
  语音识别在本机完成,不管用 FunASR 还是 Windows 自带的引擎,录音都不会上传,发出去的只有识别出来的文字。
- **其他联网**:只在你安装扩展(从 npm 下载)或下载语音识别模型(从 ModelScope,取不到时从 Hugging Face)时才会联网。

## 数据与卸载

Windows 上所有数据都在安装目录的 `data` 文件夹里:

| 内容 | 位置(相对安装目录) |
|---|---|
| Coo 的记忆、对话记录、设置、API Key | `data\home` |
| 安装的扩展 | `data\extensions` |
| 运行日志 | `data\logs` |
| 语音识别模型(FunASR,下载后才有) | `data\home\models` |
| 临时文件、扩展安装缓存、窗口缓存 | `data\tmp`、`data\pnpm`,以及 `data` 下的其余文件夹 |

**卸载**:在 Windows「设置 → 应用」里找到 CortiCompanion 卸载。`data` 文件夹会保留,重装后记忆和设置还在;彻底不要了,就手动删掉整个安装目录。

Mac 上数据在 `~/Library/Application Support/CortiCompanion`,里面的分法同上。卸载时把「应用程序」里的 CortiCompanion 拖进废纸篓;
彻底不要了,再删掉这个文件夹。

<details>
<summary>从 0.1.0 升级</summary>

第一次启动新版时,会把 `%APPDATA%\CortiCompanion` 里的记忆、设置和日志搬进 `data`,再删掉旧目录。
旧版装过的扩展,要在「扩展」页重新安装一次。

</details>

## 常见问题

<details>
<summary><b>桌宠不见了</b></summary>

右键托盘图标 →「显示桌宠」。托盘图标被折叠时,点任务栏右下角的 `^` 找到它。也可以再双击一次桌面图标。
Mac 上点菜单栏里 Coo 的图标 →「显示桌宠」,或者在「应用程序」里再打开一次。

</details>

<details>
<summary><b>Coo 不说话 / 没反应</b></summary>

打开设置窗口的「开始」页,看标题旁的状态:

- **还没连上模型**:检查 API Key 是否完整、那一家账户里还有没有余额,再点「测试连接」。豆包要先在方舟控制台开通默认模型。
- **暂停中**:点左栏底部的「继续」。

</details>

<details>
<summary><b>它听不到我说话</b></summary>

- 鼠标停在 Coo 身上,确认身旁的麦克风按钮没有被划掉;
- 说话时先快速按一下左 Alt、再按住它(默认说话键;按一下太慢或两下隔太久都不算);
- 「语音输入」页的识别服务显示就绪;显示「识别模型还没下载」就点「下载」。你说话时电平条会跳,说明麦克风选对了;
- Windows 设置 → 隐私和安全性 → 麦克风里,允许了桌面应用使用麦克风;
- Mac:「系统设置 → 隐私与安全性」里,「麦克风」和「输入监控」都打开了 CortiCompanion(改完重启它)。

用 Windows 自带引擎时报「没有语音识别器」,到 Windows 设置 → 时间和语言 → 语言,给中文装上「语音识别」;或者换回 FunASR。

</details>

<details>
<summary><b>语音识别不够准</b></summary>

确认「语音输入」页的识别引擎是 FunASR(Windows 自带的引擎没那么准)。说话时离麦克风近一点,一句话说完停一下再松开说话键。

</details>

<details>
<summary><b>想知道它在想什么</b></summary>

打开高级模式,「对话」页有完整的时间线。遇到问题时,在「运行诊断」页导出诊断包,附在 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues) 里。

</details>

## 反馈与参与

- 遇到问题或有想法:提一个 [Issue](https://github.com/Pal-AI-Lab/Coopanion/issues),写清楚系统版本(Windows 或 macOS)、CortiCompanion 版本和复现步骤。
- 想从源码构建或改代码:看 [开发文档](docs/DEVELOPMENT.md)。

## 致谢

CortiCompanion 由 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装而成:Cortico Core + Cormini Persona +
[桌宠 World](https://github.com/Phantivia/cortico-world-desktop-pet) + [电脑操作 World](https://github.com/Phantivia/cortico-world-cua)。

## 许可

[MIT](LICENSE)。随附或运行时下载的第三方组件:Electron(MIT)、Cortico(MIT)、sherpa-onnx(Apache-2.0)、FunASR 的 SenseVoiceSmall 模型([FunASR 模型开源协议](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE),用时下载)、koffi(MIT)、jpeg-js(BSD-3-Clause)、pnpm(MIT)、各家模型服务的标志取自 [lobe-icons](https://github.com/lobehub/lobe-icons)(MIT;标志本身归各自的公司所有,只用来标明是哪一家服务)。
