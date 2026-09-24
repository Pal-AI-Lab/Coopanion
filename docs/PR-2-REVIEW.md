# PR #2 评审

对象：[PR #2](https://github.com/Pal-AI-Lab/Coopanion/pull/2)，提交 `2336500c89203f602c34d2548d16433afead35ba`。对照主仓库 `d71a7fe`、桌宠子模块 `7ec821b`。

| 改动 | 当前实现 | 结论 |
|---|---|---|
| 左 Alt 说话键 | 当前为 `LeftAlt*2`，Mac 显示左 Option，手势是先快速按一下再按住。 | 已替代，不应恢复旧的单次按住文案。 |
| 默认 Windows 系统语音 | 当前跨平台默认是 FunASR/SenseVoice + sherpa-onnx；Windows 系统识别仍可选。 | 与当前默认和跨平台实现冲突。 |
| SenseVoice 下载及识别引擎引导 | 当前模型管理器已支持下载，`core/guide.ts` 在桌宠气泡内引导安装；PR 修改的是旧 `console/features/guide` 页面。 | 功能已覆盖，代码已过时。 |
| 装扮页跟随控制台明暗主题 | 当前 iframe 未同步主题；PR 将编辑器主题与桌宠配色分离，配套子模块 JS/CSS 在当前版本中不存在。 | 已按用户最新决定移植：父页面同步初始主题及后续变化；子页面校验父窗口与精确来源，编辑器主题与桌宠配色分离。 |
| 环境代理支持 | 当前 `CoreHost` 未添加 `--use-env-proxy`，也未补齐回环地址的 `NO_PROXY`。 | 已按用户最新决定移植：Core 启用 Node 环境代理，合并大小写 NO_PROXY 并补齐 IPv4/IPv6 回环；内置 Electron 的真实 fetch 和 HTTP 下载代理测试通过。 |

不建议整体合并，也不应将桌宠子模块回退到 PR 中的旧提交 `e787c743`。本次仅移植两项保留功能，保留当前识别后端、按键手势与气泡引导。

实现位于 `codex/macos-input-and-branding` 分支，包含桌宠子模块的新提交。PR #2 已留言说明选择性移植与过时部分，并于 2026-09-24 关闭（merged=false），不整体合并。后续修复通过发布 PR 合入 main；桌宠与 CUA 子模块改为 Pal-AI-Lab fork，确保发布可以取得对应提交。
