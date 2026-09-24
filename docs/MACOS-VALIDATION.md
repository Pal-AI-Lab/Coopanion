# macOS 输入修复验证

关联实现：`packages/cortico-world-desktop-pet/host/electron-main.cjs`、`web/pet-app.js`、`src/world.ts`，以及 `packages/cortico-world-cua/src/engine/darwin.ts`。

## 诊断结论

所提供诊断包中模型连接、桌宠、语音和 CUA 引擎均在线。多次 `cua_type` 返回已输入，包括英文、中文及 URL，但回执没有验证目标控件中的实际文字。日志仅有一条模型轮数达到硬上限的警告，无法仅凭日志断言原生输入成功。

- 桌宠窗口原来使用 `screen-saver` 层级，现改为 macOS 的 `floating`，为系统候选窗和原生下拉菜单留出上层空间；Windows 层级不变。
- 显式进入文字输入时激活桌宠应用和窗口；输入法组合期间 Escape 不关闭气泡。
- CUA 释放修饰键时先清除对应标记；Unicode 事件显式清除修饰键，逐字素发送，避免快捷键残留和整段文本作为单个字符事件。
- AUTO 是快捷键不可用时自动收音的现有降级状态，KEY 表示按键收音。未发现徽标映射错误；新增降级原因提示。诊断包没有首次设置时的快捷键失败记录，无法确定用户当时切换状态的具体触发条件。
- 外发光强度从 0.8 降为 0.5，膨胀半径从 5 降为 3，模糊从 10 降为 7；浅色/深色阴影透明度从 0.16/0.5 降为 0.12/0.32。

## 已验证

- 控制台构建成功；主仓库、Web 和 World 类型检查通过。
- 主仓库 25 个测试通过；World 80 个测试通过，1 个真实 Windows 识别器测试在 Mac 上跳过。
- 使用真实 Electron 桌宠宿主、静态页面和模拟 WebSocket 服务进行本机冒烟验证：文本框获得焦点、应用激活、中英文字符进入文本框、组合输入期间 Escape 保留气泡。不启动真实模型，不请求麦克风或电脑操作权限。
- 品牌更名回归测试覆盖全新安装、旧数据复用、两套目录已存在的情况。保留旧 appId 和旧数据路径兼容，避免将已有安装视为全新应用。

## 尚需人工复验

已通过 LaunchServices 启动已授权的已安装应用，以同一身份分别运行旧版和修复版 CUA 引擎，并用真实 Electron textarea 读取输入结果。旧版四组样例均不匹配（尽管 typed 回执成功）；修复版英文、中文＋emoji、中文 URL、多行文本四组均与预期完全一致，均包含 cmd+a 替换操作；截图得到 800×520 JPEG。因此已确认原始输入问题是实现 bug，而非用户没有授权。测试使用受控目标，没有让模型操作个人文档。

直接从终端启动相同可执行文件时，TCC 的负责进程身份不同，权限预检会失败；不能据此推断用户没给应用授权。通过 LaunchServices 启动的旧包，输入、录屏、监听权限均为 true。

本轮新版已安装至 `/Applications/Coopanion.app`。本机包采用 ad hoc 签名，新构建的身份未继承原授权（即使系统设置显示同名开关开启，预检仍可能为 false），需要通过系统设置刷新授权。保留 appId/数据目录只保证数据兼容，不保证临时签名的 TCC 权限继承。正式发布应使用稳定的 Developer ID 签名。当前新版安装包的权限待用户刷新后再复测；不要将同一授权身份下的引擎测试等同于新包已经获得权限。

1. 在打包应用中验证中文输入法候选窗、模型名原生下拉菜单，分别检查普通桌面及全屏应用所在 Space。
2. 刷新新版打包应用的辅助功能、屏幕录制和输入监控授权并重启后，复验实际应用中的导航与输入。
3. 外接显示器和切换主屏、macOS 新旧安装数据，以及 Windows 安装包升级需要对应环境复验。

参考：[Electron 窗口层级](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel)、[应用激活](https://www.electronjs.org/docs/latest/api/app#appfocusoptions)、[Chromium macOS 字符事件实现](https://chromium.googlesource.com/chromium/src/+/refs/tags/138.0.7204.236/remoting/host/input_injector_mac.cc)。

## PR 与品牌验证

- 内置 Electron Node 的本地代理集成测试确认 fetch 和 HTTP 下载经过代理，回环通信直连；不会联系外部服务。
- 实际运行的装扮 iframe 随父页 light/dark 切换，body 背景分别为 rgb(243, 242, 246) 与 rgb(13, 17, 23)，桌宠 theme 保持 dark。单测同时拒绝伪造来源、端口和父窗口。
- 已检查打包应用侧栏中的 Coopanion 字标；banner 和侧栏复用原有字形路径，仅开头两个 o 使用品牌绿色；侧栏保留最左侧原有 C 内双圈图形标志。
