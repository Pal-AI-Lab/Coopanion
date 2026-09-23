<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="CortiCompanion" width="806">
  </picture>
</p>

<p align="center"><b>你的小小万能桌面伴侣</b></p>

<p align="center">
  <a href="https://github.com/Pal-AI-Lab/CortiCompanion/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pal-AI-Lab/CortiCompanion?color=00a870"></a>
  <a href="https://github.com/Pal-AI-Lab/CortiCompanion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pal-AI-Lab/CortiCompanion/actions/workflows/ci.yml/badge.svg"></a>
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

1. 打开 [最新发布](https://github.com/Pal-AI-Lab/CortiCompanion/releases/latest),下载 `CortiCompanion-Setup-版本号.exe`。
2. 双击运行。安装包没有数字签名,Windows 可能弹出「Windows 已保护你的电脑」:点 **更多信息** → **仍要运行**。
3. 不用选任何东西,装好后会自动打开。桌面和开始菜单里都会有 CortiCompanion。

### 方法二:一行命令

在开始菜单搜 **PowerShell**,打开后粘贴这一行,回车:

```powershell
irm https://raw.githubusercontent.com/Pal-AI-Lab/CortiCompanion/main/installer/install.ps1 | iex
```

它会下载最新的安装包并运行,效果和方法一相同。

## 第一次打开

设置窗口会停在「开始」页,从上往下做:

1. **连接模型**:填入 DeepSeek 的 API Key,点「保存并开始」。
   还没有 Key 的话:打开 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) → 注册并登录 → 充值(按用量计费,几块钱能用很久)→
   「API Keys」→「创建 API key」→ 复制那串 `sk-` 开头的字符。
   测试通过后 Coo 就醒了,屏幕右下角的桌宠会开始活动。
2. **语音输入**(可选):点「下载」,程序会取回 whisper.cpp 识别程序和中文识别模型(约 190 MB,只下一次)。
   Windows 第一次会问能不能用麦克风,选允许。之后直接对着电脑说话,Coo 会歪头听,并把听到的字显示在虚线气泡里。
3. **电脑操作**(可选):勾上「允许 Coo 操作鼠标和键盘」后,可以让它帮你点、打字、切窗口。你一动鼠标键盘,它会先停下等你;
   登录、密码、付款这些步骤它会交给你自己做。

## 平时怎么用

- **说话**:直接对着麦克风说;或者右键桌宠 →「说点什么」,也可以双击桌宠打字。
- **互动**:点它一下、在它头上来回划(摸头)、按住拖起来甩出去,它都会有反应,也会知道你做了什么。
- **提问**:Coo 有时会冒出带选项的问题,点选项或按 1–3;不想选就在最后一格自己写。
- **装扮**:「开始」页或右键菜单里的「装扮」,换配色、帽子、耳饰、眼镜、颈饰,改动立刻生效。
- **托盘**:关掉设置窗口后程序仍在后台,任务栏右下角的托盘图标可以重新打开设置、显示桌宠、设为开机自启、退出。

## 更多能力:装 World

左栏「扩展」页列出 npm 上带 `cortico-world` 关键字的 World,例如 QQ 机器人(`cortico-world-qq-better`)、画室与你画我猜(`cortico-world-canvas`)、
植物大战僵尸(`cortico-world-pvz`)、杀戮尖塔(`cortico-world-sts-1`)。
点安装,装好后点「重启进程」,再到「World 总览」里启用。扩展装在 `%APPDATA%\CortiCompanion\extensions`,重装应用不会丢。

## 换模型

默认用 DeepSeek 的 `deepseek-flash`(能看截图,电脑操作需要它)。左栏「模型」页里可以:

- 调整思考档位(不思考 / 快 / 标准 / 最深);
- 新建连接,选「OpenAI Responses Compatible」接入其他兼容 Responses API 的服务;
- 在「用量与成本」里看花了多少钱,DeepSeek 的高峰和错峰价格已按时段计入。

## 数据放在哪

| 内容 | 位置 |
|---|---|
| Coo 的记忆、对话记录、设置 | `%APPDATA%\CortiCompanion\home` |
| 安装的扩展 | `%APPDATA%\CortiCompanion\extensions` |
| 运行日志 | `%APPDATA%\CortiCompanion\logs` |
| 语音识别程序与模型 | `%APPDATA%\CortiCompanion\home\runtimes`、`models` |

卸载在 Windows「设置 → 应用」里找 CortiCompanion;上面这些数据不会被删,不要了可以手动删掉 `%APPDATA%\CortiCompanion`。

## 常见问题

- **桌宠不见了**:托盘图标右键 →「显示桌宠」。
- **没反应**:看「开始」页顶部的状态。「暂停中」点右边的「继续」;「还没连上模型」检查 Key 和余额。
- **听不到我说话**:确认「听麦克风」勾着、识别服务显示运行中,以及 Windows 设置 → 隐私和安全性 → 麦克风里允许了桌面应用。
- **想看它在想什么**:左栏「对话」页有完整的时间线;「运行诊断」里能导出诊断包。

## 从源码构建

需要 Git、Node.js 22 和 pnpm(`corepack enable`)。

```bash
git clone --recursive https://github.com/Pal-AI-Lab/CortiCompanion.git
cd CortiCompanion
pnpm install
pnpm run dev                # 准备 build/cortico 并启动应用
pnpm run test               # 单元测试
pnpm run build:installer    # 打出 dist/CortiCompanion-Setup-<版本>.exe
```

| 目录 | 内容 |
|---|---|
| `vendor/cortico` | Cortico 本体(子模块) |
| `packages/cortico-world-desktop-pet`、`packages/cortico-world-cua` | 两个 World(子模块) |
| `packages/cortico-provider-deepseek` | DeepSeek provider |
| `core/` | Core 子进程的入口:装配 Cormini、World、provider,首次运行的种子文件 |
| `console/` | 覆盖在 Cortico 控制台上的入口与「开始」页 |
| `app/` | Electron 主进程:托盘、设置窗口、Core 子进程托管、桌宠窗口模式 |
| `scripts/stage.ts` | 从 `vendor/cortico` 生成应用使用的 `build/cortico`:去掉内建的平台 World 与 llamacpp,叠加 `console/`,构建控制台 |
| `scripts/pack.ts` | 组装扁平的 `build/app` 并调用 electron-builder |
| `promo/` | 宣传片与仓库 banner,网页渲染,说明见 [promo/README.md](promo/README.md) |

推送 `v*` 标签时,GitHub Actions 会构建安装包并附到对应的 Release 上。

## 许可

MIT。随附或运行时下载的第三方组件:Electron(MIT)、Cortico(MIT)、whisper.cpp 与其 ggml 模型(MIT)、koffi(MIT)、jpeg-js(BSD-3-Clause)、pnpm(MIT)。
