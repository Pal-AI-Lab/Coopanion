# cortico-provider-deepseek

Owner: `src/index.ts`

[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的 DeepSeek provider:走 DeepSeek 的 Responses 端点(`POST https://api.deepseek.com/responses`)。

- **思考档位**:不思考(发 `reasoning.effort = none`)/ 快(low)/ 标准(high)/ 最深(max)。
- **推理回传**:历史里的推理按明文回传。DeepSeek 返回可读推理、不返回加密块;带工具的多轮对话缺了前面的推理会被拒绝。
- **图片**:端点勾了「多模态」且模型是 `deepseek-flash` 时发送图片,工具回执里的截图也会带上。`deepseek-v4-pro` 不看图。
- **价目**:`src/pricing.ts` 按官方价目表给出 `deepseek-flash` 与 `deepseek-v4-pro` 的错峰价,并声明两个高峰时段
  (UTC 01:00–04:00、06:00–10:00,周一至周五)按两倍计。官方把中国法定节假日也算作错峰,这里没有列节假日,节假日的请求按高峰计。
- **模型列表**:`GET /models`;上下文窗口按官方公布的 1M 填写。

端点配置示例(`<CORTICO_HOME>/providers/deepseek/config.json`,密钥写在同目录 `.env` 的 `DEEPSEEK_API_KEY`):

```json
{
  "kind": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "secret": "DEEPSEEK_API_KEY",
  "spec": { "model": "deepseek-flash", "thinking": true, "reasoningEffort": "high", "maxTokens": 8192 },
  "multimodal": true
}
```

在 CortiCompanion 里它随应用注册;单独使用时按 Cortico 的扩展方式安装(`cortico.kind = provider`,`api = 5`)。
