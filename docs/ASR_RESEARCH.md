# 本地中文语音识别方案

2026-09-23 调研记录。Coopanion 当前在 Windows 上默认使用系统识别器；选用 whisper.cpp 时，由桌宠 World 下载运行程序和 ggml 模型。正式安装包 `v0.1.1` 固定了更早的桌宠 World，主分支后来才改成 Windows 默认使用系统识别器。

本次下载问题有可复现的网络原因：在设置了 `HTTPS_PROXY` 的 Windows 环境，同一条 Hugging Face 模型地址由 PowerShell 请求返回 200，普通 Node `fetch` 报 `UND_ERR_CONNECT_TIMEOUT`，启用 Node 的环境代理后返回 200。Coopanion 的 Core 子进程现启用环境代理，并使本地服务地址直连。这个修正解决的是代理环境里的连接方式；下载仍取决于实际网络能否访问模型站点。

| 模型 | Windows 本地运行 | 对 Coopanion 的适合程度 |
|---|---|---|
| SenseVoice Small | FunASR 官方提供 Windows x64 的可携带 C++ 运行包，CPU 可运行；另有 OpenAI 兼容的 `funasr-server`，能通过 `/v1/audio/transcriptions` 接入。 | 建议先做下一轮集成。没有强制要求 GPU，且每句话结束后识别的交互方式与现有语音输入一致。 |
| Fun-ASR-Nano | 官方提供本地 C++/GGUF 路径，量化后模型约 1.3 GB；标准服务路径侧重 PyTorch/vLLM 与 GPU。 | 适合中文口音和方言优先的进阶选项，但下载体积及部署成本更高，应先用真实桌面口语录音测准确率与延迟。 |

当前桌宠 World 的 HTTP 客户端虽然使用 OpenAI 兼容的转写路由，却把请求里的 `model` 固定为 Whisper 的 ggml 文件名。FunASR 官方服务会解析 `model`，未知名称返回 400。因此仅修改 `asr.baseUrl` 不能可靠地接入 SenseVoice。下一轮集成需要让远程模型名称成为独立配置，并明确区分本地托管的 Whisper 程序与外部转写服务。之后再决定是否把 SenseVoice 运行包纳入应用管理。具体效果需要在目标 Windows 设备上用中文短句和口音录音检验。

资料：[FunASR 的部署矩阵](https://github.com/modelscope/FunASR/blob/main/docs/deployment_matrix.md)、[FunASR 的 Windows C++ 运行说明](https://github.com/modelscope/FunASR/blob/main/runtime/llama.cpp/README.md)、[FunASR 服务端实现](https://github.com/modelscope/FunASR/blob/main/funasr/bin/_server_app.py)、[Node 环境代理说明](https://nodejs.org/api/http.html#built-in-proxy-support)。
