<!-- Owner: src/definition.ts, src/world.ts, src/config.ts, src/deployment-model.ts, python/biliscript_worker.py -->

# cortico-world-biliscript

把 B 站视频里的对话转写成区分说话人的剧本。bot 调用 `biliscript_transcribe` 后任务在后台排队,完成时收到
`biliscript.finished` 事件,剧本写在部署数据目录的 `biliscript/<任务号>/script.md`:

```
# 视频标题

- 来源: https://www.bilibili.com/video/BV…/
- UP 主: …
- 时长: 12:34
- 转写: faster-whisper large-v3；说话人区分: pyannote/speaker-diarization-3.1

## 人物

- 王老师 (S1, 32 句)
- S2 (12 句, 未命名)

## 对白

[00:03] 王老师：大家好……
```

流程:yt-dlp 下载音频 → faster-whisper 识别(带逐词时间)→ pyannote.audio 按声音分出说话人 → 每个词归到与它重叠最多的
说话人,同一人连续的词合成一句,停顿超过 1.5 秒另起一句 → 人物命名。

## 安装

1. 准备 Python 3.10 或更高版本,建议单独建一个虚拟环境,再按「设备」一节安装依赖。

2. 说话人区分模型在 Hugging Face 上需要先登录并同意使用条款
   (`pyannote/speaker-diarization-3.1` 及它依赖的 `pyannote/segmentation-3.0`),再创建一个读权限的访问令牌。
3. 在 Coopanion 设置的「扩展」页选择「手动安装」,填这个目录的绝对路径,重启后在 World 列表启用「B 站对话剧本」。
4. 部署目录的 `.env` 里写密钥:

   | 名字 | 用途 |
   |---|---|
   | `BILISCRIPT_HF_TOKEN` | Hugging Face 访问令牌,说话人区分需要 |
   | `BILISCRIPT_LLM_API_KEY` | 只在人物命名设为 endpoint 时需要 |
   | `BILISCRIPT_BILI_COOKIE` | 可选。需要登录才能看的视频:整串 Cookie,或只填 SESSDATA 的值 |

5. 设置里的「Python 路径」填第 1 步那个环境的 python 可执行文件。World 启用时运行一次环境检查(各步骤用 GPU 还是 CPU、
   发现的问题),结果显示在 World 卡片上,也写进 bot 的环境提示词。

## 设备

| 机器 | 安装 | 说明 |
|---|---|---|
| Mac(Apple 芯片) | `pip install -r python/requirements.txt` | 语音识别与说话人区分都在 CPU 上运行。large-v3 在 CPU 上很慢,试用时把 `asr.model` 改成 `large-v3-turbo` 或 `small` |
| Windows / Linux + NVIDIA | 先 `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128`,再 `pip install -r python/requirements.txt` | Windows 上直接 `pip install torch` 装到的是 CPU 版;RTX 50 系列需要 CUDA 12.8 或更新的 torch |

装好后运行 `python python/biliscript_worker.py check`:`asrDevice` 与 `diarizationDevice` 是两步各自会用的设备,
`problems` 写出有显卡却用不上的原因(CPU 版 torch、torch 没有这块卡的架构等)。

- 语音识别(CTranslate2)在 CTranslate2 认得出 GPU 时用 CUDA;说话人区分(torch)在 torch 能在 GPU 上运行时用 CUDA。
- worker 先导入 torch 再导入 faster-whisper:CUDA 版 torch 自带 cuBLAS 与 cuDNN,CTranslate2 由此找到它们,不需要另装 CUDA。
- `asr.device` 为 auto 时,GPU 上运行失败会改在 CPU 上重跑这一步,完成事件里写明失败原因;设为 cuda 时直接报错。

## 人物命名

说话人区分只按声音聚类,得到的是 S1、S2……这样的标签。配置 `writer.mode` 决定人物名从哪里来:

- `deployment`(默认):用 bot 当前所用的那个模型端点(部署 `config.json` 的 `activeProvider`,即 Coopanion 设置里选的模型),
  密钥、模型名、思考档位与协议都与 bot 相同,不需要另配密钥。由这个 World 推断人物名,并逐段修订错字和标点
  (`writer.polish`),原文保留在 `script.json` 的 `asrText`。用量与金额按端点价目记进用量页,标签是 `biliscript`。
  端点在任务走到命名这一步时读取,中途切换模型只影响之后的任务。
- `endpoint`:同样由这个 World 命名和修订,但用下面单独配置的模型服务。`writer.protocol` 选接口协议:

  | 协议 | 请求 | `writer.baseUrl` 填到 |
  |---|---|---|
  | `openai` | `POST {baseUrl}/chat/completions`,`Authorization: Bearer` | `/v1` 为止;兼容 Chat Completions 的服务与本机推理服务都用它 |
  | `anthropic` | `POST {baseUrl}/v1/messages`,`x-api-key` | 服务根地址 |
  | `gemini` | `POST {baseUrl}/v1beta/models/{model}:generateContent`,`x-goog-api-key` | 服务根地址 |

- `bot`:剧本交给 bot,bot 读台词判断谁是谁,用 `biliscript_name_speakers` 写回。

模型没配好或调用失败时剧本照常生成,说话人保持标签,事件里写明原因。bot 随时可以用 `biliscript_name_speakers`
覆盖模型给的名字。

`deployment` 模式读取 Cortico 的端点表、provider 注册表与 Open Responses 辅助函数,这些不在 World 扩展契约之内,
Cortico 升级改动它们时这一模式可能失效,失效时的表现同上。

## 工具与事件

| 名字 | 作用 |
|---|---|
| `biliscript_transcribe` | 排队一个视频:BV 号、av 号、视频链接或 b23.tv 短链;可选分 P、已知人数 |
| `biliscript_jobs` | 任务状态与进度 |
| `biliscript_read` | 分页读台词,可只看一个说话人 |
| `biliscript_name_speakers` | 给标签起名并重写剧本 |
| `biliscript_cancel` | 取消排队中或进行中的任务 |
| `biliscript.finished` | 任务完成:人物表、剧本路径与开头 20 句 |
| `biliscript.failed` | 任务失败:失败阶段与原因 |

任务一次只跑一个。任务列表在 `biliscript/jobs.json`,每个任务目录里有 `transcript.json`(识别结果)、`script.json`、
`script.md` 与 `worker.log`(Python 的错误输出)。进程重启时进行中的任务记为失败。

## 配置

| 键 | 默认 | 说明 |
|---|---|---|
| `pythonPath` | 空 | 空时 Windows 用 `python`,其他系统用 `python3` |
| `hfEndpoint` | 空 | 传给 Python 的 `HF_ENDPOINT`,用镜像下载模型时填 |
| `keepAudio` | false | 保留下载的音频 |
| `asr.model` | large-v3 | faster-whisper 模型名或本机目录;CPU 上可换 small、medium |
| `asr.device` | auto | auto 时有 CUDA 用 GPU |
| `asr.language` | zh | 空串自动识别 |
| `asr.initialPrompt` | 以下是普通话的对话。 | 影响用字(简繁)与标点 |
| `diarization.enabled` | true | 关闭时全部台词归 S1 |
| `diarization.model` | pyannote/speaker-diarization-3.1 | pyannote.audio 流水线名或本机目录 |
| `writer.mode` | deployment | 见「人物命名」 |
| `writer.protocol`、`baseUrl`、`model`、`maxTokens`、`timeoutSec` | | 只用于 endpoint 模式 |
| `writer.polish` | true | deployment 与 endpoint 模式下修订错字与标点 |

## 开发

在 Coopanion 仓库根下:`pnpm run test:worlds`、`pnpm run typecheck:worlds`。测试用 `tests/helpers/fake-worker.mjs`
代替 Python 进程,用本机 HTTP 服务代替 endpoint 模式的模型服务,用注册进 Cortico provider 注册表的脚本化模块
(`tests/helpers/scripted-provider.ts`)代替 deployment 模式的模型;`tests/align.test.ts` 在有 python3 时直接运行
worker 的对齐逻辑。
改了工具、事件或环境提示词后在 `vendor/cortico` 下运行 `pnpm describe:extension <本目录>` 与
`pnpm check:extension <本目录>`。
