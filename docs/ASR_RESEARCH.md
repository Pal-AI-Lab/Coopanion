# SenseVoice Small 本地识别验证

2026-09-23 在 Windows x64 上验证并接入了 SenseVoice Small。Coopanion 的桌宠默认使用本地 SenseVoice Small；Windows 系统识别器仍可由使用者明确选择。原来的 whisper.cpp 下载和识别代码已移除。

## 选型和实际结果

FunASR v1.4.16 的 Windows CPU 运行包约 5 MB，sensevoice-small-q8.gguf 为 254,208,320 字节（约 243 MiB）。官方模型卡给出的许可证为 Apache-2.0。本机使用桌宠的运行时下载器完整下载了程序和模型，两个文件均进入“已就绪”状态。直接用官方 6 秒中文样本运行时得到“我想问我在滨海新区有房。”，整次进程调用约 1.5 秒。通过桌宠页面、切句器和事件投递的完整链路运行同一段音频时，得到“我想问。”和“我在滨海新区有房。”两条事件；两次识别分别耗时约 0.5 秒和 0.6 秒。测试音频由页面模拟输入，仍需在真实安装包中用麦克风和不同口音进一步验证。

识别直接启动本地 GGUF 程序处理每个语音片段。这个程序接受 WAV 文件并把文字写到标准输出，省去 Python 服务和 HTTP 适配。桌宠将 16 kHz PCM 写成临时 WAV，在识别完成后删除临时文件。程序、模型都从固定版本下载；下载完成前保留 .partial 文件。使用者可以在配置中指定自己的程序与 GGUF 文件。

先前的 Whisper 下载故障在本机复现为 Node 对 Hugging Face 的连接超时。Coopanion Core 子进程现启用环境代理；模型下载仍取决于实际网络能否访问 Hugging Face。本次 SenseVoice 模型已在本机完整下载并用于推理。

## 资料

[FunASR 运行说明](https://github.com/modelscope/FunASR/blob/main/runtime/llama.cpp/README.md)、[FunASR v1.4.16 发布包](https://github.com/modelscope/FunASR/releases/tag/v1.4.16)、[SenseVoiceSmall-GGUF 模型卡](https://huggingface.co/FunAudioLLM/SenseVoiceSmall-GGUF)。
