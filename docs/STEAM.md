<!-- Owner: .github/workflows/release.yml (steam-build, steam-upload); scripts/pack.ts; app/steam.cjs -->
# Steam 版

Steam 版和 GitHub 版用同一份代码，构建时用 `COOPANION_CHANNEL=steam` 区分：

- 由 Steam 安装和更新：不带自动更新（`app/updater.cjs`），设置窗口标题栏不查 GitHub 新版本。
- 数据在 `%APPDATA%\Coopanion`。Steam 卸载时会删除整个安装目录，所以数据不放在安装目录里。
- 不内置大肥鱼，大肥鱼作为形象包发在创意工坊。
- 带 steamworks.js，启动时读取已订阅的创意工坊物品，每个物品当作一个形象包（`app/steam.cjs`）。

## Steamworks 后台（一次性）

1. **Depot**：用 App ID + 1 那个默认 depot 放 Windows 版，操作系统选 Windows，语言选「所有语言」。
2. **分支**：新建 `staging` 分支并设密码，CI 上传的构建会自动设到这个分支上。
3. **创意工坊**：在「工作坊」设置里启用 ISteamUGC 文件传输，物品可见性按需要设。
4. **构建账号**：新建一个只用于上传的 Steam 账号，在「用户与权限」里只给它上传构建所需的权限，并开启 Steam 令牌。
5. 改完在「发布」页发布这些设置，否则不生效。

## GitHub 仓库设置（一次性）

在仓库的 Settings → Secrets and variables → Actions 里：

| 类型 | 名字 | 值 |
|---|---|---|
| Variable | `STEAM_APP_ID` | App ID |
| Secret | `STEAM_USERNAME` | 构建账号的用户名 |
| Secret | `STEAM_CONFIG_VDF` | 构建账号登录后的 `config.vdf`，base64 编码 |

`config.vdf` 的生成方法：下载 [SteamCMD](https://developer.valvesoftware.com/wiki/SteamCMD)，运行 `steamcmd +login <构建账号> +quit`，输入密码和 Steam 令牌验证码。登录成功后，SteamCMD 目录下会生成 `config/config.vdf`。在 Git Bash 里运行 `base64 -w0 config/config.vdf`，把输出填进 Secret。令牌登录过期后 CI 会登录失败，重新生成一次即可。

`STEAM_APP_ID` 为空时不跑 Steam 那两个任务，GitHub 发布不受影响。

## 发版

打 tag `v<版本>` 后，`release.yml` 除了 GitHub 发布，还会：

1. `steam-build`：在 Windows 上用 Steam 渠道构建，产物是 `dist/win-unpacked`；
2. `steam-upload`：用 [game-ci/steam-deploy](https://github.com/game-ci/steam-deploy) 把它上传到 depot，并设到 `staging` 分支。

在 Steam 客户端里，Coopanion 属性 →「测试版」输入 `staging` 的密码，就能装上这个构建检查。确认没问题后，在 Steamworks 的 SteamPipe →「版本」里把这个构建设到 `default` 分支，所有用户就会收到更新。

本地构建：

```bash
COOPANION_CHANNEL=steam STEAM_APP_ID=<App ID> pnpm run build:installer
```

## 创意工坊里的形象包

物品根目录就是一个形象包的目录，`figure.json` 必须在根目录下。Steam 把每个已订阅物品放在 `steamapps/workshop/content/<App ID>/<物品 ID>/`，应用把这个目录当作形象包目录之一，规则和数据目录下的 `figures/` 相同：内置包的 id 优先，`coo` 只能是内置的。

用 SteamCMD 发布或更新一个物品，先写一个 vdf 文件（路径都要写绝对路径）：

```
"workshopitem"
{
  "appid"           "<App ID>"
  "publishedfileid" "0"
  "contentfolder"   "<形象包目录的绝对路径>"
  "previewfile"     "<预览图的绝对路径，1 MB 以内>"
  "visibility"      "0"
  "title"           "<标题>"
  "description"     "<介绍>"
  "changenote"      "<这次改了什么>"
}
```

然后运行 `steamcmd +login <账号> +workshop_build_item <vdf 的绝对路径> +quit`。第一次发布时 `publishedfileid` 填 `0`，成功后 SteamCMD 会输出物品 ID，把它填回 vdf，以后更新这个物品就用它。`visibility` 的取值：`0` 公开，`1` 仅好友，`2` 隐藏，`3` 不公开列出。

大肥鱼的形象包目录是 `packages/cortico-world-desktop-pet/web/whale`，预览图可以用其中的 `thumbs/deepseek.png`。形象包的 id 保持 `whale`，和 GitHub 版内置的那份一致，装扮设置（`skin.figure`）在两个版本之间通用。
