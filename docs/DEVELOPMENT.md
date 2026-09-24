# 开发文档

CortiCompanion 是用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装的 Electron 桌面应用:Cortico Core + Cormini Persona +
[桌宠 World](https://github.com/Phantivia/cortico-world-desktop-pet) + [电脑操作 World](https://github.com/Phantivia/cortico-world-cua),
默认接 DeepSeek。

## 从源码构建

需要 Git、Node.js 22 和 pnpm(`corepack enable`),在 Windows 或 macOS 上都能开发。

```bash
git clone --recursive https://github.com/Pal-AI-Lab/Coopanion.git
cd Coopanion
pnpm install
pnpm run dev                # 准备 build/cortico 并启动应用,数据写在 build/data
```

已经 clone 过但没带 `--recursive` 的话,先补上子模块:

```bash
git submodule update --init --recursive
```

| 命令 | 作用 |
|---|---|
| `pnpm run dev` | 生成 `build/cortico` 并启动应用 |
| `pnpm run start` | 直接启动应用(不重新生成 `build/cortico`) |
| `pnpm run build:cortico` | 只生成 `build/cortico`(控制台改动后要重跑,并重启应用) |
| `pnpm run test` | 单元测试 |
| `pnpm run typecheck` | 检查 Core 与 Electron 部分的类型 |
| `pnpm run typecheck:web` | 检查控制台的类型(先跑 `build:cortico`) |
| `pnpm run build:installer` | Windows 上打出 `dist/CortiCompanion-Setup-<版本>.exe`;Mac 上打出 `dist/CortiCompanion-<版本>-mac-<架构>.dmg` 和 `.zip`(`PACK_ARCH=x64` 在 Apple 芯片上打 Intel 版) |
| `pnpm run build:icons` | 用桌宠的造型重画应用图标和默认头像 |

想用一份干净的数据测试(比如看首次启动、引导、没填 Key 时的提醒),把 `CORTICO_COMPANION_DATA` 指向一个空目录再启动:

```powershell
$env:CORTICO_COMPANION_DATA = "$env:TEMP\coo-test"; pnpm run start
```

设置窗口会记住引导是否看过(存在窗口的 localStorage,键名 `companion.guide`)。换一个数据目录,引导就会重新出现。

## 目录结构

| 目录 | 内容 |
|---|---|
| `vendor/cortico` | Cortico 本体(子模块) |
| `packages/cortico-world-desktop-pet`、`packages/cortico-world-cua` | 两个 World(子模块) |
| `packages/cortico-provider-deepseek` | DeepSeek provider |
| `core/` | Core 子进程的入口:装配 Cormini、World、provider;首次运行的种子文件;没填 Key 时让桌宠提醒 |
| `console/` | 覆盖在 Cortico 控制台上的入口:普通/高级两种模式,「开始」「习惯」「装扮」「语音输入」四页,首次打开时和 Coo 对话的引导 |
| `app/` | Electron 主进程:托盘(Mac 上是菜单栏图标)、设置窗口(启动时不打开)、Core 子进程托管、桌宠窗口模式;`app/shims/` 是扩展安装用的 corepack 替身 |
| `scripts/stage.ts` | 从 `vendor/cortico` 生成应用使用的 `build/cortico`:去掉内建的平台 World 与 llamacpp,叠加 `console/`,构建控制台 |
| `scripts/pack.ts` | 组装扁平的 `build/app` 并调用 electron-builder;`installer/nsis.nsh` 定 Windows 默认安装位置、卸载时保留 `data`;Mac 包是临时签名(ad hoc)的 dmg 与 zip |
| `scripts/make-icons.cjs` | 用 Electron 把 pet-core 的造型画成 `app/icons` 与 `core/seed/avatar.png` |
| `installer/install.ps1` | 一行命令安装用的脚本:下载最新 Release 的安装包并运行 |
| `promo/` | 宣传片与仓库 banner,网页渲染,说明见 [promo/README.md](../promo/README.md) |

## 发布

1. 改 `package.json` 里的 `version`;
2. 提交后打 `v<版本>` 标签并推送。

GitHub Actions 会构建 Windows 安装包和两个 Mac 包(Apple 芯片、Intel,都在 Apple 芯片的 runner 上打),附到对应的 Release 上。

## 提交改动

- 提 PR 前先跑 `pnpm run test`、`pnpm run typecheck` 和 `pnpm run typecheck:web`,CI 也会跑这几项。
- 改到用户能看到的行为时,同步更新 [README](../README.md)。
