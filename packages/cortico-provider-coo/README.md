# cortico-provider-coo

Owner: `src/index.ts`

Coo Pet Provider:[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的一个 provider 模块(`kind: "coo"`),
接 CortiCompanion 列出的几家模型服务,DeepSeek 排第一。每家都走自己的 OpenAI 兼容 Responses 端点
(`POST <baseUrl>/responses`),不在服务端存历史,推理按明文回传。

| id | 服务 | baseUrl | 默认模型 |
|---|---|---|---|
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `deepseek-flash` |
| `qwen` | 通义千问(阿里云百炼) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-flash` |
| `kimi` | Kimi | `https://api.moonshot.cn/v1` | `kimi-k3` |
| `glm` | 智谱 GLM | `https://open.bigmodel.cn/api/v1` | `glm-5.3` |
| `doubao` | 豆包(火山方舟) | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-1-lite-260915` |
| `qianfan` | 百度千帆 | `https://qianfan.baidubce.com/v2` | `glm-5.1` |
| `minimax` | MiniMax | `https://api.minimax.cn/v1` | `MiniMax-M3` |
| `stepfun` | 阶跃星辰 | `https://api.stepfun.com/v1` | `step-3.7-flash` |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `deepseek/deepseek-v4.1-flash` |

表在 `src/vendors.ts`,数据取自各家文档(2026-09-24)。**只有 DeepSeek 拿真实的 Key 跑过**,别家按「和 DeepSeek 一样」接入。

- **哪一家**:按端点的 `baseUrl` 认(`vendorOf`),端点里不另存字段。智谱的 Responses 端点在 `/api/v1` 下,不是对话接口的 `/api/paas/v4`。
- **思考档位**:不思考 / 快 / 标准 / 最深,发 `reasoning.effort` = `none` / `low` / `high` / `max`;
  某家文档写明只收别的值时按 `Vendor.effort` 换算(千问 `high→medium`、`max→xhigh`;Kimi 没有 `none`,换成 `low`;
  MiniMax、阶跃星辰没有 `max`,换成 `high`;千帆没写 effort,不发 `reasoning`)。
- **图片**:端点勾了「多模态」且那一家列明默认模型能看图时才发。
- **价目**:只有 DeepSeek 内置(`src/pricing.ts`,错峰价,两个高峰时段按两倍计);别家没有内置价目。
- **标志**:`src/icons.ts`,取自 [@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons)(MIT)。标志归各自的公司所有,只用来标明是哪一家。
- **接入流程**:`src/connect.ts` 的 `connectVendor` 经 Cortico 控制台的 provider 路由给某一家建端点(名字就是它的 id,
  密钥存在该端点 `.env` 的 `Vendor.secret` 下)、测试,通过后设为当前端点并恢复运行。CortiCompanion 的桌面引导和「开始」页都用它。

端点配置示例(`<CORTICO_HOME>/providers/qwen/config.json`,密钥在同目录 `.env` 的 `QWEN_API_KEY`):

```json
{
  "kind": "coo",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "secret": "QWEN_API_KEY",
  "spec": { "model": "qwen3.8-flash", "thinking": true, "reasoningEffort": "high", "maxTokens": 8192 },
  "multimodal": true
}
```

0.1.x 叫 `cortico-provider-deepseek`(`kind: "deepseek"`);CortiCompanion 启动时把旧端点的 `kind` 改成 `coo`。
在 CortiCompanion 里它随应用注册;单独使用时按 Cortico 的扩展方式安装(`cortico.kind = provider`,`api = 5`)。
