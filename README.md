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
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-8b8b8f"></a>
</p>

桌宠 Coo 住在你的屏幕底边。它会用气泡和你聊天、听你说话、在任务栏上走来走去,也能在你允许时帮你操作电脑。

![设置窗口的「开始」页与桌面上的桌宠](docs/images/home.png)

CortiCompanion 是用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 拼出来的桌面应用:Cortico Core + Cormini Persona +
[桌宠 World](https://github.com/Phantivia/cortico-world-desktop-pet) + [电脑操作 World](https://github.com/Phantivia/cortico-world-cua),
默认接 DeepSeek。

## 安装(Windows 10 / 11,64 位)

### 方法一:下载安装包

1. 打开 [最新发布](https://github.com/Pal-AI-Lab/Coopanion/releases/latest),下载 `CortiCompanion-Setup-版本号.exe`。
2. 双击运行。安装包没有数字签名,Windows 可能弹出「Windows 已保护你的电脑」:点 **更多信息** → **仍要运行**。
3. 选安装位置(默认 `C:\Users\你的用户名\CortiCompanion`),点安装。装好后会自动启动,桌面上有它的图标。
   程序和它写下的所有文件都在这个目录里,AppData 里不放任何东西,所以开始菜单里没有它。

### 方法二:一行命令

在开始菜单搜 **PowerShell**,打开后粘贴这一行,回车:

```powershell
irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
```

它会下载最新的安装包并运行,效果和方法一相同,装完删掉下载的安装包。

## 第一次打开

程序启动时只出现两样东西:屏幕底边的桌宠 Coo,和任务栏右下角的托盘图标,不会弹出设置窗口。
第一次还没填模型的 Key,Coo 会冒气泡问你要不要现在去填,点「去填」就打开设置窗口的「开始」页,从上往下做:

1. **连接模型**:填入 DeepSeek 的 API Key,点「保存并开始」。
   还没有 Key 的话:打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) → 注册并登录 → 充值(按用量计费,几块钱能用很久)→
   「API Keys」→「创建 API key」→ 复制那串 `sk-` 开头的字符。
   测试通过后 Coo 就醒了,屏幕右下角的桌宠会开始活动。
2. **语音输入**(可选):到左栏「语音输入」页点「下载并启动」,程序会取回 whisper.cpp 识别程序和中文识别模型(约 190 MB,只下一次)。
   Windows 第一次会问能不能用麦克风,选允许。之后**按住右 Ctrl 说话**,松开就算一句;Coo 会歪头听,
   并把听到的字显示在虚线气泡里。

电脑操作默认开着:Coo 每一轮要看屏幕或动鼠标键盘之前,会先冒气泡问你,点「可以」才动手。你一动鼠标键盘,它会先停下等你;
登录、密码、付款这些步骤它会交给你自己做。总开关在高级模式左栏的「电脑操作」页。

## 设置窗口:普通模式与高级模式

从托盘图标或桌宠右键菜单的「打开设置」打开。默认是**普通模式**,左栏只有关于桌宠的四页:

- **开始**:连接模型、看桌宠在不在;
- **习惯**:怎么称呼你、走动多少、颜色、大小、音效;
- **装扮**:换配色、帽子、耳饰、眼镜、颈饰;
- **语音输入**:开关与下载识别程序、换说话键、换麦克风、收音方式、电平条和听到的内容。

左栏底部的「高级模式」会显示 Cortico 的全部页面:对话记录、World、模型、扩展、记忆、系统提示词、运行诊断、用量与成本。
点「回到普通模式」收起。选择会被记住,下次打开还是它。下文提到的「扩展」「模型」「对话」「运行诊断」页都在高级模式里。

## 平时怎么用

- **说话**:按住右 Ctrl 说话;或者把鼠标停在桌宠身上点气泡按钮、右键 →「说点什么」、双击桌宠,都能打字。
  设置窗口的「语音输入」页里可以换说话键、换麦克风,或者改成按一下开关、一直收音,电平条显示实时音量。
- **黑白模式**:鼠标停在桌宠身上,点太阳/月亮按钮切换;默认是黑色(夜间)模式。
- **右键菜单**:顶上是 Coo 的头像和右上角的退出按钮(点一下先问,再点才退出);最下面一行「打开设置」;暂停/继续在设置窗口的「开始」页;「行为模式」里选常走动、多待着、不乱动。
- **互动**:点它一下、在它头上来回划(摸头)、按住拖起来甩出去,它都会有反应,也会知道你做了什么。
- **提问**:Coo 有时会冒出带选项的问题,点选项或按 1–3;不想选就在最后一格自己写。
- **装扮**:设置窗口的「装扮」页或右键菜单里的「装扮」,换配色、帽子、耳饰、眼镜、颈饰,改动立刻生效。
- **托盘**:程序一直在后台,任务栏右下角的托盘图标可以打开设置、显示桌宠、设为开机自启、退出。关掉设置窗口不会退出;再双击桌面图标只会把桌宠叫回来。
- **电脑操作**:让 Coo 帮你点、打字、切窗口时,它每一轮会先问一次;不同意它就这一轮不动。

## 更多能力:装 World

高级模式左栏的「扩展」页列出 npm 上带 `cortico-world` 关键字的 World,例如 QQ 机器人(`cortico-world-qq-better`)、画室与你画我猜(`cortico-world-canvas`)、
植物大战僵尸(`cortico-world-pvz`)、杀戮尖塔(`cortico-world-sts-1`)。
点安装,装好后点「重启进程」,再到「World 总览」里启用。扩展装在安装目录的 `data\extensions`,重装应用不会丢。

## 换模型

默认用 DeepSeek 的 `deepseek-flash`(能看截图,电脑操作需要它)。高级模式左栏的「模型」页里可以:

- 调整思考档位(不思考 / 快 / 标准 / 最深);
- 新建连接,选「OpenAI Responses Compatible」接入其他兼容 Responses API 的服务;
- 在「用量与成本」里看花了多少钱,DeepSeek 的高峰和错峰价格已按时段计入。

## 数据放在哪

全部在安装目录的 `data` 文件夹里,AppData 里没有 CortiCompanion 的文件:

| 内容 | 位置(相对安装目录) |
|---|---|
| Coo 的记忆、对话记录、设置 | `data\home` |
| 安装的扩展 | `data\extensions` |
| 运行日志 | `data\logs` |
| 语音识别程序与模型 | `data\home\runtimes`、`models` |
| 临时文件、装扩展用的 pnpm 缓存、窗口缓存 | `data\tmp`、`data\pnpm`,以及 `data` 下的其余文件夹 |

卸载在 Windows「设置 → 应用」里找 CortiCompanion;`data` 不会被删,不要了可以手动删掉整个安装目录。
从 0.1.0 升级时,第一次启动会把 `%APPDATA%\CortiCompanion` 里的记忆、设置和日志搬进 `data`,再删掉旧目录;
旧版装过的扩展要在「扩展」页重新安装一次。

## 常见问题

- **桌宠不见了**:托盘图标右键 →「显示桌宠」。
- **没反应**:看「开始」页顶部的状态。「暂停中」点右边的「继续」;「还没连上模型」检查 Key 和余额。
- **听不到我说话**:确认「听麦克风」勾着、识别服务显示运行中、说话时按住了说话键(默认右 Ctrl),以及 Windows 设置 → 隐私和安全性 →
  麦克风里允许了桌面应用。「语音输入」页的电平条随声音跳动,说明麦克风选对了。
- **想看它在想什么**:高级模式左栏的「对话」页有完整的时间线;「运行诊断」里能导出诊断包。

## 从源码构建

需要 Git、Node.js 22 和 pnpm(`corepack enable`)。

```bash
git clone --recursive https://github.com/Pal-AI-Lab/Coopanion.git
cd CortiCompanion
pnpm install
pnpm run dev                # 准备 build/cortico 并启动应用,数据写在 build/data
pnpm run test               # 单元测试
pnpm run build:installer    # 打出 dist/CortiCompanion-Setup-<版本>.exe
pnpm run build:icons        # 用桌宠的造型重画应用图标和默认头像
```

| 目录 | 内容 |
|---|---|
| `vendor/cortico` | Cortico 本体(子模块) |
| `packages/cortico-world-desktop-pet`、`packages/cortico-world-cua` | 两个 World(子模块) |
| `packages/cortico-provider-deepseek` | DeepSeek provider |
| `core/` | Core 子进程的入口:装配 Cormini、World、provider,首次运行的种子文件 |
| `console/` | 覆盖在 Cortico 控制台上的入口:普通/高级两种模式,「开始」「习惯」「装扮」「语音输入」四页 |
| `app/` | Electron 主进程:托盘、设置窗口(启动时不打开)、Core 子进程托管、桌宠窗口模式 |
| `scripts/stage.ts` | 从 `vendor/cortico` 生成应用使用的 `build/cortico`:去掉内建的平台 World 与 llamacpp,叠加 `console/`,构建控制台 |
| `scripts/pack.ts` | 组装扁平的 `build/app` 并调用 electron-builder;`installer/nsis.nsh` 定默认安装位置、卸载时保留 `data` |
| `scripts/make-icons.cjs` | 用 Electron 把 pet-core 的造型画成 `app/icons` 与 `core/seed/avatar.png` |
| `promo/` | 宣传片与仓库 banner,网页渲染,说明见 [promo/README.md](promo/README.md) |

推送 `v*` 标签时,GitHub Actions 会构建安装包并附到对应的 Release 上。

## 许可

MIT。随附或运行时下载的第三方组件:Electron(MIT)、Cortico(MIT)、whisper.cpp 与其 ggml 模型(MIT)、koffi(MIT)、jpeg-js(BSD-3-Clause)、pnpm(MIT)。
