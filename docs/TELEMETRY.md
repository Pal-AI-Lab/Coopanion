# 匿名使用统计

从 v0.1.10 起，Coopanion 会向项目自己的服务器 `https://survey.palailab.org` 发送匿名使用统计，用来了解有多少人在用、用得多久、哪些功能有人用。本页列出发送的全部字段。客户端代码在 [`core/telemetry.ts`](../core/telemetry.ts)，服务端代码在 [`telemetry-server/`](../telemetry-server/)。

**关掉**：设置窗口「习惯」页最下面，取消勾选「匿名使用统计」。关掉时会发最后一条 `telemetry_disabled`，没发出去的记录随即清空，之后不再计数也不再发送。重新勾上后沿用原来的安装编号。

## 不发送的内容

- 你说的话、打的字、Coo 的回答、屏幕截图、记忆和提示词的内容；
- API Key、错误消息、你的文件名和路径（崩溃报告里只有程序自身文件相对程序目录的路径）；
- 自定义模型端点的地址和模型名（只报 `custom`），以及从本地路径或网址装的扩展的包名（只报 `private`）；
- 你的名字、账号，或任何能认出你这台电脑的硬件编号。

服务器不保存 IP 地址。IP 只在内存里用于限流。

## 安装编号

第一次启动时随机生成一个 UUID，存在数据文件夹的 `home/companion/telemetry.json` 里，和账号、硬件都没有关联。删掉这个文件，下次启动会换一个新编号。统计开着的时候，同目录下还有一个 `telemetry-id`，里面只有这个编号，Windows 卸载程序读它来报告卸载（见下文 `uninstalled`）。

## 每次发送都带的字段

| 字段 | 例子 | 说明 |
|---|---|---|
| `installId` | `945c528f-…` | 安装编号 |
| `version` | `0.1.10` | Coopanion 版本 |
| `os` / `osRelease` / `arch` | `win32` / `10.0.26200` / `x64` | 系统和架构 |
| `locale` / `timeZone` | `zh-CN` / `Asia/Shanghai` | 系统语言和时区 |
| `firstDate` | `2026-09-30` | 第一次启动的日期 |
| `sentAt` | ISO 时间 | 发送时间 |

## 每日记录（`days`）

每个本地日期一条，记录当天的计数和当时的设置。应用开着时每 30 分钟发一次，服务器只留同一天的最新一条。

| 字段 | 说明 |
|---|---|
| `date` | 本地日期 |
| `runningMinutes` | 当天应用开着的分钟数 |
| `interactedMinutes` | 当天你和 Coo 有过互动的分钟数（打字、说话、摸它、回答它的提问） |
| `sessions` | 当天启动次数 |
| `messagesText` / `messagesVoice` | 打字和语音说给 Coo 的条数 |
| `touches` / `answers` | 点、摸、拎 Coo 的次数；回答 Coo 提问的次数 |
| `petReplies` | Coo 在气泡里说话的次数 |
| `cuaActions` | Coo 操作电脑的动作数（截屏、点击、打字等） |
| `cuaAsked` / `cuaGranted` | 电脑操作前问你的次数和你同意的次数 |
| `providerErrors` | 失败的模型请求数：一次请求连同它的自动重试都没拿到回复才算一次；被新输入打断或因退出中止的不算 |
| `models` | 按请求实际发往的模型分：`calls`（HTTP 请求数，每次重试各算一次）、`failed`（失败的请求数，算法同 `providerErrors`）、`failedStatus`（`failed` 按最后一次尝试的 HTTP 状态码分开计数，如 `{"400": 3}`；`200` 表示回复到一半出错，`none` 表示没拿到状态码，比如连不上或超时）、`aborted`（被新输入打断或因退出中止的尝试数）、输入/输出/缓存命中 token 数；每项带 `vendor`（内置服务的 id，或 `kind:<模块>`）、`model`（内置服务的模型名，其他为 `custom`）、`endpointKind`（`builtin` / `custom-remote` / `custom-local`） |
| `vendor` / `model` / `endpointKind` | 当前使用的模型服务，规则同上 |
| `language` | 界面语言 |
| `autostart` | 是否开机自动启动 |
| `figure` / `scheme` / `roam` | 形象（Coo 或大肥鱼）、配色、走动程度 |
| `voiceInput` | 语音输入是否打开 |
| `cuaEnabled` / `cuaLevel` | 电脑操作是否启用、询问档位 |
| `personaChanged` | Coo 的人设（CONSTITUTION.md）是否和初始版本不同，只报是或否 |
| `memoryFiles` | Coo 工作区（记忆）里的文件个数 |
| `chatDays` | 安装以来和 Coo 说过话的天数 |
| `extensions` | 装了的扩展：包名（本地或网址安装的报 `private`）、版本、类别 |
| `ramGB` / `cpuCores` | 内存大小（取整到 GB）和 CPU 核数 |

## 一次性事件（`events`）

先存在本地，发出去之后删掉。没网的时候不会丢。

| 事件 | 附带字段 | 什么时候发 |
|---|---|---|
| `first_launch` | | 第一次启动 |
| `guide_step` | `step` | 启动引导走到第几步（1–5） |
| `source` | `answer` | 引导里「你是从哪里认识我的？」的回答：`bilibili` / `xiaohongshu` / `douyin` / `github` / `friend` / `other` / `skip` |
| `guide_finished` | | 引导走完 |
| `guide_closed` | `step` | 引导在第几步被关掉 |
| `extension_installed` / `extension_removed` | `name`、`version`、`kind` | 启动时发现扩展比上次多了或少了 |
| `crash` | `where`，其余见下表 | Core 出错。`where` 是来源：`core`（未捕获的异常，Core 随后退出）、`core-rejection`（未处理的 promise 拒绝，Core 继续运行；同样的一条在一次运行里只报一次）、`core-exit`（Core 进程意外退出后被重启，由重启后的 Core 报告） |
| `telemetry_disabled` / `telemetry_enabled` | | 关掉或重新打开统计 |
| `uninstalled` | | Windows 上卸载（升级时不算）；由卸载程序发出，统计关着时不发 |

`crash` 的其余字段。错误消息不发送：消息里可能有文件路径、Key 的片段或你说过的话。

| 字段 | 例子 | 说明 |
|---|---|---|
| `error` | `TypeError` | 错误类名；抛出的不是错误对象时是它的类型（如 `string`）。`core` 和 `core-rejection` 才有 |
| `code` | `ENOENT` | 错误自带的错误码，没有就不发 |
| `frames` | `["core/guide.ts:212", "build/cortico/src/core/loop.ts:1043"]` | 调用栈最上面 3 处在程序目录里的位置：相对程序目录的文件路径和行号。程序目录以外的位置（你的文件、装的扩展、Node 自身）跳过 |
| `exitCode` / `signal` | `1` / `null` | 只在 `core-exit`：上一个 Core 进程的退出码，或结束它的信号名 |
