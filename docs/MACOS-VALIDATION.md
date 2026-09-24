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
- 主仓库 20 个测试通过；World 80 个测试通过，1 个真实 Windows 识别器测试在 Mac 上跳过。
- 使用真实 Electron 桌宠宿主、静态页面和模拟 WebSocket 服务进行本机冒烟验证：文本框获得焦点、应用激活、中英文字符进入文本框、组合输入期间 Escape 保留气泡。不启动真实模型，不请求麦克风或电脑操作权限。
- 品牌更名回归测试覆盖全新安装、旧数据复用、两套目录已存在的情况。保留旧 appId 和旧数据路径兼容，避免将已有安装视为全新应用。

## 尚需人工复验

测试 Electron 没有辅助功能权限，因此系统级 CUA 原生键盘实测跳过，字符事件冒烟测试不能代替该项验证。

1. 在打包应用中验证中文输入法候选窗、模型名原生下拉菜单，分别检查普通桌面及全屏应用所在 Space。
2. 授予打包应用辅助功能权限并重启后，验证 `cmd+l` 后输入 URL、`cmd+a` 后替换中英文及 emoji，确认实际控件内容与截图。
3. 外接显示器和切换主屏、macOS 新旧安装数据，以及 Windows 安装包升级需要对应环境复验。

参考：[Electron 窗口层级](https://www.electronjs.org/docs/latest/api/browser-window#winsetalwaysontopflag-level-relativelevel)、[应用激活](https://www.electronjs.org/docs/latest/api/app#appfocusoptions)、[Chromium macOS 字符事件实现](https://chromium.googlesource.com/chromium/src/+/refs/tags/138.0.7204.236/remoting/host/input_injector_mac.cc)。
