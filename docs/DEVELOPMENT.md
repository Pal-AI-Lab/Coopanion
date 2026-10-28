# 开发文档（scripts/stage.ts、app/main.cjs、app/updater.cjs、core/companion.ts）

Coopanion 是用 [Cortico](https://github.com/Pal-AI-Lab/Cortico) 组装的 Electron 桌面应用:Cortico Core + Cormini Persona +
[桌宠 World](../packages/cortico-world-desktop-pet)(含电脑操作),
模型经 Coo Pet Provider(`packages/cortico-provider-coo`)接 DeepSeek、通义千问、Kimi 等几家服务,默认 DeepSeek。每家一个端点,名字就是它在 `src/vendors.ts` 里的 id;0.1.x 的 `deepseek` 模块端点在启动时由 `core/seed.ts` 改成 `coo`。

## 从源码构建

需要 Git、Node.js 22 和 pnpm(`corepack enable`),在 Windows 或 macOS 上都能开发。

```bash
git clone --recursive https://github.com/Pal-AI-Lab/Coopanion.git
cd Coopanion
pnpm install
pnpm run dev                # 准备 build/cortico 并启动应用,数据写在 build/data
```

已经 clone 过但没带 `--recursive` 的话,先补上 Cortico 子模块:

```bash
git submodule update --init --recursive
```

| 命令 | 作用 |
|---|---|
| `pnpm run dev` | 生成 `build/cortico` 与 `build/console` 并启动应用 |
| `pnpm run start` | 直接启动应用(不重新生成) |
| `pnpm run build:cortico` | 只生成 `build/cortico` 与设置窗口 `build/console`(改了 `console/` 后重跑，再重新打开设置窗口) |
| `pnpm run test` | 主仓库单元测试 |
| `pnpm run test:worlds` | 桌宠 World(含电脑操作)的单元测试（使用本仓库锁定的 Cortico） |
| `pnpm run typecheck:worlds` | 两个 World 的类型检查 |
| `pnpm run typecheck` | 检查 Core 与 Electron 部分的类型 |
| `pnpm run typecheck:web` | 检查设置窗口(`console/`)的类型 |
| `pnpm run build:installer` | Windows 上打出 `dist/Coopanion-Setup-<版本>.exe`,设 `COOPANION_CHANNEL=portable` 时打出便携版 `dist/Coopanion-<版本>-win-x64-portable.zip`;Mac 上打出 `dist/Coopanion-<版本>-mac-<架构>.dmg` 和 `.zip`(`PACK_ARCH=x64` 在 Apple 芯片上打 Intel 版) |
| `pnpm run build:icons` | 用桌宠的造型重画应用图标和默认头像 |

想用一份干净的数据测试(比如看首次启动、引导、没填 Key 时的提醒),把 `CORTICO_COMPANION_DATA` 指向一个空目录再启动:

```powershell
$env:CORTICO_COMPANION_DATA = "$env:TEMP\coo-test"; pnpm run start
```

引导跑过(走完或点了 ×)之后,部署目录里会写一个 `guide.json`(`<数据目录>/home/companion/guide.json`),删掉它、并且没有 Key 时,下次启动引导会重新出现。已经有 Key 的旧安装升级上来直接算看过。引导本身在 `core/guide.ts`,一步一步经桌宠 World 的 `dialog` 画在 Coo 的气泡里。

## 目录结构

| 目录 | 内容 |
|---|---|
| `vendor/cortico` | Cortico 本体(子模块) |
| `packages/cortico-world-desktop-pet` | 桌宠 World,电脑操作在其中的 `src/cua/`;源码由本仓库直接管理 |
| `packages/cortico-provider-coo` | Coo Pet Provider:DeepSeek、千问、Kimi 等几家模型服务的 provider,DeepSeek 排第一 |
| `core/` | Core 子进程的入口:装配 Cormini、World、provider;首次运行的种子文件;没填 Key 时让桌宠提醒;`coopanion` World(`notice.ts`)在更新后把更新说明和开发者的信、在引导结束后把引导里的对话、在对方改设置后把改了什么告诉 Coo,并提供 Coo 给自己设唤醒器的工具(`alarms.ts`,高级模式的应用通知页列出闹钟、可删除，删除时告诉 Coo;面板在 `core/webui/`,由 `scripts/stage.ts` 打包);匿名使用统计(`telemetry.ts`,字段见 [TELEMETRY.md](TELEMETRY.md)) |
| `console/` | 设置窗口：Coopanion 自己的前端，只经 Core 的 WebUI HTTP API 读写状态。`base/` 是请求、语言、流、路由、主题、UI 原语与面板宿主;`rail/` 是左栏;「开始」「习惯」(电脑操作是其中一节)「装扮」「语音输入」「用量与成本」「对话」各页在 `features/`,「系统提示词」(完整的系统提示词与「清空对话并重开」)两种模式共用 `advanced/` 里的那一页;普通/高级两种模式见 `features/mode.ts`;高级模式的页面(模型供应商、扩展、控制台、Core、World 总览)与按 manifest 挂 World、Persona、Memory 页的页面宿主是从 Cortico WebUI 复制来的，在 `advanced/`,归 Coopanion 维护;字标下的版本与更新提示在 `features/release.ts`(版本号与渠道由 `scripts/stage.ts` 构建时写入) |
| `app/` | Electron 主进程:托盘(Mac 上是菜单栏图标)、设置窗口(启动时不打开，用自己的 session;在 Core WebUI 的源下以 `/coopanion/` 应答 `build/console` 的文件;只把来自 Core 自己的源的请求转给 Core,桌宠服务器只接来自 Core 或它自己的源的请求和无 referrer 的帧文件读取(`/figure-frame`、`/web/`、`/packs/`,以 Origin `null` 转发),其余一律 403;发往本机以外的请求只放行新版本查询与扩展市场的图片(官方索引里的包图标与截图、GitHub 头像),子 frame 只能留在本机;离开 Core WebUI 的链接交给系统浏览器;信任模型见 `main.cjs` 的注释)、Core 子进程托管、桌宠窗口模式、自动更新(`updater.cjs`)、Steam 版读创意工坊(`steam.cjs`);`app/shims/` 是扩展安装用的 corepack 替身 |
| `scripts/stage.ts` | 从 `vendor/cortico` 生成应用使用的 `build/cortico`(去掉内建的平台 World 与 llamacpp,`src/web/client` 原样),构建 Cortico WebUI、桌宠面板与设置窗口 `build/console` |
| `scripts/pack.ts` | 组装扁平的 `build/app` 并调用 electron-builder;`installer/nsis.nsh` 定 Windows 默认安装位置、卸载时保留 `data`、卸载(非升级)时报告给统计服务;Mac 包是临时签名(ad hoc)的 dmg 与 zip |
| `scripts/make-icons.cjs` | 用 Electron 把 Coo 的造型(`web/coo/coo.js`)画成 `app/icons` 与 `core/seed/avatar.png` |
| `installer/install.ps1` | 一行命令安装用的脚本:下载最新 Release 的安装包并运行 |
| `telemetry-server/` | 匿名使用统计的服务端(单文件 Node + SQLite),部署在 `survey.palailab.org`,说明见 [telemetry-server/README.md](../telemetry-server/README.md) |
| `promo/` | 宣传片与仓库 banner,网页渲染,说明见 [promo/README.md](../promo/README.md) |

## 应用界面与 World 的边界

Cortico 是内核,Coopanion 是用它做的一个产品。使用者看到的界面按下面分工:

- **Coopanion 只渲染自己绑定的 World**:桌宠 World(含电脑操作)、`coopanion` World 和控制台 World。应用壳和这些 World 之间的接口(比如桌宠 World 的 `PetBotControls`)归 Coopanion 所有，随产品需要修改，不属于 Cortico 的契约。
- **应用壳不为其他 World 提供界面入口。** 桌宠菜单和设置窗口的普通模式里，不放扩展提供的按钮、页面或菜单项。高级模式的扩展页、World 总览等页面复制自 Cortico WebUI,是给开发者用的，扩展 World 用 `webUi()` 声明的面板和链接显示在那里。
- **扩展 World 想让使用者看到内容，走下面两条路之一:**
  - **经过 Bot。** World 给 Bot 提供读写内容的工具，把使用者需要知道的事投递成事件,Coo 再用桌宠的气泡、选项和对话页告诉使用者。怎么呈现由桌宠 World 决定;呈现能力不够时扩充桌宠 World,不对扩展开放。适合偶尔看一眼的内容。
  - **托管自己的环境。** 使用者要直接、频繁操作的界面，做成扩展自己的小应用：由 World 启动时拉起、停止时关闭,World 在应用和 Bot 之间转递事件和工具。这类扩展需要和使用者在同一台电脑上，发布时用 `os` 字段和 `local` 等标签写明。不要借用 Coopanion 的运行时(`CORTICO_NODE_EXE` 指向的 Electron)开窗口：它只供扩展安装使用，随时可能改。
- v0.2.2 在桌宠右键菜单里加过「扩展页面」,列出扩展 World 声明的链接，越过了上面第二条,v0.2.3 已撤回。

## 发布

1. 改 `package.json` 里的 `version`;
2. 写 `docs/releases/v<版本>.md`。它既是 GitHub Release 的正文，也随安装包分发：用户更新后 Coo 会读到上次运行的版本之后每个版本的说明(「## 下载」及以下不给 Coo),再用自己的话讲给用户;
   可以另写英文版 `docs/releases/v<版本>.en.md`,只随安装包分发,模型文本是英文时 Coo 读它(没有就读中文版),它的下载列表以 `## Download` 开头;
   要给用户写更长的话，写成开发者的信 `docs/releases/v<版本>.letter.md`(英文版 `.letter.en.md`):不进 GitHub Release,随安装包分发，跟更新说明一起整封交给 Coo,附 GitHub 上该版本标签下的原文链接，由 Coo 决定转不转达、怎么转达;跨了几个版本更新时只给其中最新的一封;
3. 提交后打 `v<版本>` 标签并推送。

GitHub Actions 会构建 Windows 安装包和两个 Mac 包(Apple 芯片、Intel,都在 Apple 芯片的 runner 上打),附到对应的 Release 上,连同自动更新读的 `latest.yml`(Windows)和 `latest-linux.yml`(AppImage)。Windows 安装版和 AppImage 由 `app/updater.cjs`(electron-updater)检查、下载新版本，并在退出时安装。`companion.autoUpdate` 默认开启，可在「习惯 → 通用」关闭；Core 通过 `companion:auto-update` 将初始值和修改后的值交给主进程，主进程收到初始值后才开始检查。关闭时取消下载、清除更新提示并阻止退出安装。Mac(临时签名装不了自动更新)、deb 和 Windows 便携版仍靠标题栏版本号右侧的提示手动下载。仓库配好 Steam 的变量和密钥后，同一个标签还会构建 Steam 版并上传到 Steam,见 [STEAM.md](STEAM.md)。

## 提交改动

- 提 PR 前先跑 `pnpm run test`、`pnpm run test:worlds`、`pnpm run typecheck`、`pnpm run typecheck:web` 和 `pnpm run typecheck:worlds`，CI 也会跑这些检查。
- 改到用户能看到的行为时,同步更新 [README](../README.md)。
- 写法、测试与提交格式的规则见 [AGENTS.md](../AGENTS.md)。
- 第一次提 PR 要签贡献者许可协议,见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## World 源码来源

两个 World 从子模块转为本仓库的 workspace 包时，保留了原目录和包名;许可随本仓库改为 AGPL-3.0-or-later,原仓库里的历史版本仍是 MIT。源码快照分别取自桌宠
[`7ce70c271add681cbcb19cfebb07c40ac03215e3`](https://github.com/Pal-AI-Lab/cortico-world-desktop-pet/commit/7ce70c271add681cbcb19cfebb07c40ac03215e3)
和 CUA [`ce44ed7fed92ec06b60df2609808110a73824fe5`](https://github.com/Pal-AI-Lab/cortico-world-cua/commit/ce44ed7fed92ec06b60df2609808110a73824fe5)。
各包原有 Git 历史仍可从对应仓库查看；此后修改直接提交到 Coopanion。电脑操作后来并进桌宠 World,在 `packages/cortico-world-desktop-pet/src/cua/`。包内独立 lockfile 和 workspace 配置已移除，
依赖统一由仓库根目录管理。`vendor/cortico` 仍是子模块。

## 代理、主题与字标

启动环境里有 HTTP_PROXY/HTTPS_PROXY 等变量时，Core 用内置 Electron 的 Node 环境代理支持按这些变量走，不再查系统。没有时，主进程给 Core 设 `COOPANION_SYSTEM_PROXY=1`,Core(`core/system-proxy.ts`)按请求的目标主机经 IPC 问主进程，主进程用 `session.resolveProxy` 回答(PAC 照样生效),每个主机的答案缓存 10 秒;fetch 走按主机选代理的全局 dispatcher,node:http/https 的全局 agent 和子进程继承的代理变量跟随 npm registry 的答案，每 10 秒刷新。HTTP/HTTPS 代理照用,DIRECT、SOCKS 或查询失败时直连;某个主机的答案变了，`core.log` 记一行。NO_PROXY 与 no_proxy 合并后补齐 localhost、127.0.0.1 和 IPv6 回环地址，避免本机控制台和桌宠通信被代理。变量必须存在于应用启动环境中；Finder 启动不自动读取 shell 配置。

装扮页通过 URL 初始值和父窗口消息跟随控制台主题，消息校验精确来源与父窗口；桌宠配色独立保存。控制台打开装扮页时带 `fit=1`，装扮页把自身高度以 `companion:height` 发回控制台，控制台只收这个 iframe 自己的窗口和来源发来的消息，把框设成同高。

执行 `node promo/banner.mjs companion assets` 同步生成 README 明暗 banner 与 `console/branding.ts`。复用现有字母几何，Coopanion 仅开头两个 o 着品牌绿色。生成后重新构建控制台。
