# cortico-provider-coo (`src/index.ts`)

Coo Pet Provider:[Cortico](https://github.com/Pal-AI-Lab/Cortico) 的一个 provider 模块(`kind: "coo"`),
接 Coopanion 列出的模型服务。按端点的 `baseUrl` 认出是哪一家、哪个平台,平台决定走哪种协议:

| 协议 | 请求 | 客户端 |
|---|---|---|
| `responses` | `POST <baseUrl>/responses`,不在服务端存历史 | `src/responses.ts`(Cortico 的 `ResponsesProvider`) |
| `chat` | `POST <baseUrl>/chat/completions` | `src/chat.ts`(Cortico 的 `OpenAIHttpClient`) |
| `anthropic` | Messages API,`<baseUrl>/v1/messages`,官方 `@anthropic-ai/sdk` | `src/anthropic/` |
| `gemini` | Gemini API,`<baseUrl>/models/<model>:generateContent`,API Key | `src/gemini/` |

| id | 服务 | 平台 | 协议 | 默认模型 |
|---|---|---|---|---|
| `deepseek` | DeepSeek | `https://api.deepseek.com` | responses | `deepseek-flash` |
| `qwen` | 通义千问 | 国内 `dashscope.aliyuncs.com`,国际 `dashscope-intl.aliyuncs.com`(新加坡) | responses | `qwen3.8-flash` |
| `kimi` | Kimi | 国内 `api.moonshot.cn/v1`,国际 `api.moonshot.ai/v1` | responses | `kimi-k3` |
| `glm` | 智谱 GLM | 国内 `open.bigmodel.cn/api/v1`,国际 Z.ai `api.z.ai/api/paas/v4` | 国内 responses,国际 chat | `glm-5.3-flash` |
| `doubao` | 豆包(火山方舟) | `https://ark.cn-beijing.volces.com/api/v3` | responses | `doubao-seed-2-1-lite-260915` |
| `minimax` | MiniMax | 国内 `api.minimax.cn/v1`,国际 `api.minimax.io/v1` | responses | `MiniMax-M3` |
| `stepfun` | 阶跃星辰 | `https://api.stepfun.com/v1` | responses | `step-3.7-flash` |
| `stepfun-plan` | 阶跃 Step Plan | `https://api.stepfun.com/step_plan/v1` | chat | `step-5-preview` |
| `qianfan` | 百度千帆 | `https://qianfan.baidubce.com/v2` | chat | `glm-5.3-flash` |
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | responses | `deepseek/deepseek-v4.1-flash` |
| `openai` | OpenAI | `https://api.openai.com/v1` | responses | `gpt-6-luna` |
| `anthropic` | Anthropic | `https://api.anthropic.com` | anthropic | `claude-haiku-5-5` |
| `gemini` | Gemini | `https://generativelanguage.googleapis.com/v1beta` | gemini | `gemini-3.5-flash-lite` |
| `xai` | xAI | `https://api.x.ai/v1` | responses | `grok-4.3` |

表在 `src/vendors.ts`,数据取自各家文档(国内平台 2026-09-24,其余 2026-10-08,默认模型和智谱、OpenRouter 的思考档位 2026-10-09 复核)。默认模型取每家快、便宜、能看图的那档;
`Vendor.models` 是另外几个推荐的模型名,任何那一家接受的模型名都能填。**拿真实 Key 跑过的只有 DeepSeek、Anthropic 和阶跃 Step Plan**。

- **哪一家、哪个平台**:按 `baseUrl` 认(`locate` / `vendorOf`),端点里不另存字段。有国内、国际两个平台的服务账号和 Key 不通用,
  各自一个端点:国内用服务 id 作端点名,国际加 `-intl`(`endpointName`)。智谱国内的 Responses 端点在 `/api/v1` 下,不是对话接口的 `/api/paas/v4`。
- **协议**:列出的服务按平台走(`Site.protocol`);`options.protocol` 可改;别的地址不填时走 `responses`。
  MiniMax 的 Responses 使用非流式兼容回退(`nonStreamingResponses`):流中可能提前结束工具项,最终响应也可能修订已结束项;
  等完整响应校验成功后再执行工具,避免空参数调用和已回复后的协议错误重试。工具开始执行前需等待整条响应返回。
- **思考档位**:不思考 / 快 / 标准 / 最深,Responses 发 `reasoning.effort`、Chat 发 `reasoning_effort` = `none` / `low` / `high` / `max`;
  某家文档写明只收别的值时按 `effortOf` 换算(`Vendor.effort`、平台的 `Site.effort`、个别模型的 `Vendor.modelEffort`):千问 `high→medium`、`max→xhigh`;
  Kimi、智谱两个平台的 GLM-5.3 系列、OpenRouter 的 `z-ai/glm-5.3-flash` 没有 `none`,换成 `low`;MiniMax、阶跃星辰(两种计费)没有 `max`,换成 `high`;千帆、智谱的 GLM-4.6V 没写 effort,不发;
  OpenAI 的 `gpt-6.1-sol`、`gpt-6-astra` 没有 `none`;xAI 没有 `max`,换成 `xhigh`,`grok-4.7` 也没有 `none`。
  Anthropic 按 `src/anthropic/wire.ts` 的 `thinkingParams`(Haiku 5.5 关思考发 `disabled`,Sonnet 5.5 发 `between_tools`,Opus 5.5 关不掉,改发 low);
  Gemini 按 `src/gemini/wire.ts` 的 `thinkingConfig`(Gemini 3 关不掉,不思考时 Flash-Lite 发 `minimal`、其余发 `low`)。
- **过往推理**:Responses 默认按明文回传;OpenAI、xAI(`encryptedReasoning`)回传服务给的签名块;Chat 按 `reasoning_content` 回传;
  Anthropic 回传 thinking 块和签名,Gemini 回传 `thoughtSignature`,都只回给写出它的端点和模型。
  明文回传时，没记下推理的工具调用前默认补一条占位推理(`syntheticReasoning`,即 Cortico 的 `sendSyntheticReasoning`):
  DeepSeek 不补会回 400;OpenRouter 不补。端点因此回 400 时，桌宠的失败气泡请使用者反馈给开发者。
- **图片**:端点勾了「多模态」才发。新建端点和选模型时，按那一家列明能看图的模型(`Vendor.vision`)自动勾上或去掉「多模态」。
  只发最近一批送达的事件(user 消息或事件帧)及其后的图片,更早的只留 Core 给每份附件写的 `[blob …]` 那行文字。
  每次送达新的一批,请求里从上一批的第一张图起前缀缓存失效。Chat 的工具结果不带图片,图片挪到紧跟其后的一条 user 消息里;
  千问、智谱国内、阶跃星辰、千帆的 Responses 文档写明 `function_call_output.output` 只收字符串(`toolOutputText`),也这样挪。
- **价目**:`src/pricing.ts` 内置 DeepSeek(错峰价,两个高峰时段按两倍计)、OpenAI、Anthropic、Gemini(付费档)、xAI;别家没有内置价目。
  长提示的第二档价格按 `inputBands` 计;`gemini-3.8-flash` 的现价到 2026-12-31,之后开始的请求按页面列的新价。
- **标志**:`src/icons.ts`,取自 [@lobehub/icons-static-svg](https://github.com/lobehub/lobe-icons)(MIT)。标志归各自的公司所有,只用来标明是哪一家。
- **语言**:控制台里的说明、思考档位与协议设置项在 `src/strings.ts`(`zh`、`en`)与 `src/strings.<语言>.ts`(只写译好的顶层键);
  `names` / `keyHint` 按语言给(`localized`);两处都是繁体中文回落简体,其余回落英文;`vendorsFor(language)` 给推荐顺序,
  非中文时豆包、百度千帆、阶跃星辰和阶跃 Step Plan(只收中国大陆账号)放在 `more` 里;`defaultRegion`:中文用国内平台,其余用国际平台。
- **接入流程**:`src/connect.ts` 的 `connectVendor` 经 Cortico WebUI 的 provider 路由给某一家的某个平台建端点
  (密钥存在该端点 `.env` 的 `Vendor.secret` 下,模型按传入的名字,留空用默认)、测试,通过后设为当前端点并恢复运行;
  已有端点留空 Key 时沿用存着的。Coopanion 的桌面引导和「开始」页都用它。

## ChatGPT 套餐(`chatgpt` 模块)

`src/chatgpt/` 是同包的第二个 provider 模块(`kind: "chatgpt"`,`CHATGPT_PROVIDER`):用 ChatGPT 账号登录(OpenAI 的
[Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),开源应用的做法),请求计入该账号的
ChatGPT 套餐。表里的 `CHATGPT`(`vendors.ts`)给界面列出它,模型、思考档位、上下文窗口沿用 OpenAI 那行;它不在 `VENDORS` 里,
因为接口地址和 OpenAI 相同,`locate` 只按地址认。

- **登录**(`auth.ts`):授权码 + PKCE(S256),系统浏览器打开授权页,回调在 `127.0.0.1` 上系统分配的端口;第一次用
  `client_id=dynamic_agent_client`、`agent_name_hint=Coopanion` 和端点自己的 `ext_agent_host_id` 注册,回调带回签发的 client id,
  之后的登录和刷新都用它。ID token 按签发方公布的密钥验签,并核对 issuer、audience、过期时间和 nonce;授予的 scope 里要有
  `chatgpt.tokens.use.direct`。
- **存放**:都在端点目录的 `.env`,和别家的 API Key 同处,每项一行 `CHATGPT_*`(host id、client id、账号、邮箱、access token、过期时间、
  refresh token、scope),整份写临时文件再替换。access token 剩不到 5 分钟或接口回 401/403 时刷新,同一目录的刷新排队共用一次;
  每次刷新换新的 refresh token,写盘后才交出新的 access token。refresh token 不再被接受时删掉令牌,client id 与 host id 保留。
- **请求**(`client.ts`):令牌只发往 `https://api.openai.com/v1`,端点配置里的地址也被固定成它。`POST <该地址>/responses`,始终 `stream: true`、`store: false`、整段上下文重放;system 文本进 `instructions`;
  去掉该路由不收的参数(`max_output_tokens`、`temperature`、`top_p`、`service_tier`、`metadata`、`truncation`、`user` 等);
  function / custom 工具放进一个 namespace(`app`),重放的调用带上它的名字。模型表是 `GET <baseUrl>/models` 里 `visibility: "list"` 的那些,按服务给的顺序。套餐流额外的 `response.metadata` 不进入标准事件解析器。
- **用量上限**:`subscription_sharing_usage_limit_exceeded`(HTTP 429 或流里的 `response.failed`)留在客户端里处理:日志单独记一条,
  5 分钟不发请求，之后重发，上限持续多久就这样等多久;对 Core 来说只是一个慢请求，不算失败，不进连续失败的计数。新事件抢占时等待结束。
  已经流出输出的请求和诊断请求(控制台的测试连接)仍以这个 429 失败;Coopanion 的失败气泡不算它。
- **WebUI 面板方法**:页 `llm:chatgpt` 的面板 `chatgpt`,参数是端点名:`signIn` 回授权 URL,由调用方送到系统浏览器;`state` 报登录进度,
  登录完成后带上套餐的模型名;`signOut` 等进行中的刷新写完，删掉令牌并撤销 refresh token。回调每次登录只接受一次。`connect.ts` 的 `connectChatGPT` 建端点、登录、选模型、测试并设为当前端点。

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

0.1.x 叫 `cortico-provider-deepseek`(`kind: "deepseek"`);Coopanion 启动时把旧端点的 `kind` 改成 `coo`。
在 Coopanion 里它随应用注册;单独使用时按 Cortico 的扩展方式安装(`cortico.kind = provider`,`api = 5`)。
