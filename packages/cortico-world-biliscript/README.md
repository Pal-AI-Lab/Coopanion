<!-- Owner: src/definition.ts, src/world.ts, src/config.ts, python/biliscript_worker.py -->

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

1. 准备 Python 3.10 或更高版本,建议单独建一个虚拟环境。有 NVIDIA 显卡时先按 pytorch.org 装 CUDA 版 torch,再:

   ```bash
   pip install -r python/requirements.txt
   ```

2. 说话人区分模型在 Hugging Face 上需要先登录并同意使用条款
   (`pyannote/speaker-diarization-3.1` 及它依赖的 `pyannote/segmentation-3.0`),再创建一个读权限的访问令牌。
3. 在 Coopanion 设置的「扩展」页选择「手动安装」,填这个目录的绝对路径,重启后在 World 列表启用「B 站对话剧本」。
4. 部署目录的 `.env` 里写密钥:

   | 名字 | 用途 |
   |---|---|
   | `BILISCRIPT_HF_TOKEN` | Hugging Face 访问令牌,说话人区分需要 |
   | `BILISCRIPT_LLM_API_KEY` | 人物命名设为 endpoint 时模型服务的密钥 |
   | `BILISCRIPT_BILI_COOKIE` | 可选。需要登录才能看的视频:整串 Cookie,或只填 SESSDATA 的值 |

5. 设置里的「Python 路径」填第 1 步那个环境的 python 可执行文件。World 启用时运行一次环境检查,结果显示在 World 卡片上,
   也写进 bot 的环境提示词。

## 人物命名

说话人区分只按声音聚类,得到的是 S1、S2……这样的标签。人物名有两种来源,由配置 `writer.mode` 选择:

- `bot`(默认):剧本交给 bot,bot 读台词判断谁是谁,用 `biliscript_name_speakers` 写回。bot 用的就是部署里配置的模型,
  不需要另外的密钥。
- `endpoint`:由这个 World 自己调用一个模型推断人物名,并逐段修订错字和标点(`writer.polish`),原文保留在
  `script.json` 的 `asrText`。`writer.protocol` 选接口协议:

  | 协议 | 请求 | `writer.baseUrl` 填到 |
  |---|---|---|
  | `openai` | `POST {baseUrl}/chat/completions`,`Authorization: Bearer` | `/v1` 为止;兼容 Chat Completions 的服务与本机推理服务都用它 |
  | `anthropic` | `POST {baseUrl}/v1/messages`,`x-api-key` | 服务根地址 |
  | `gemini` | `POST {baseUrl}/v1beta/models/{model}:generateContent`,`x-goog-api-key` | 服务根地址 |

  用量计入 session 统计,标签是 `biliscript`。模型没配好或调用失败时剧本照常生成,说话人保持标签,事件里写明原因。
  bot 仍可以用 `biliscript_name_speakers` 覆盖模型给的名字。

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
| `writer.*` | mode=bot | 见「人物命名」 |

## 开发

在 Coopanion 仓库根下:`pnpm run test:worlds`、`pnpm run typecheck:worlds`。测试用 `tests/helpers/fake-worker.mjs`
代替 Python 进程,用本机 HTTP 服务代替模型服务;`tests/align.test.ts` 在有 python3 时直接运行 worker 的对齐逻辑。
改了工具、事件或环境提示词后在 `vendor/cortico` 下运行 `pnpm describe:extension <本目录>` 与
`pnpm check:extension <本目录>`。
