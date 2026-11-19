## Unreleased

- Needs Cortico 0.2.17: a request refused for its attachments is sent again without them through Cortico's `AttachmentFallback` (`cortico/providers/transport/attachment-fallback.ts`), and every instance declares `handlesRefusedAttachments`. On the Gemini API this covers audio, video and documents as well as images. A 422 is no longer sent again without its attachments. A 413 is sent again without them whatever its body says, and one that is still refused then counts as a context overflow.
- The Gemini API no longer holds a request's inline attachments to 18 MiB: a request the service refuses for them goes through `AttachmentFallback`, as on the other protocols.
- Package-root exports no longer include `anthropicPrices`, `deepseekPrices`, `vendorPrices`, `CHATGPT_MODULE`, `chatgptEntry`, `connectionVendor`, `endpointName`, `firstVendor`, `locate`, `regionsOf`, `vendorById` or `SignInStatus`. Use `vendorPrices` from `src/pricing.ts` for price tables and look ids up in `VENDORS` (`vendorById` is gone). `CHATGPT_MODULE`, `chatgptEntry`, `connectionVendor`, `endpointName`, `firstVendor`, `locate` and `regionsOf` live in `src/vendors.ts`, and `SignInStatus` in `src/chatgpt/auth.ts`.
- Attachments of every type before the newest delivered batch keep only their text line. Earlier PDFs and plain text used to go out with every request on the Gemini API and could leave a new screenshot as its text line alone.

## 0.3.1

- StepFun Step Plan: a new service `stepfun-plan` on the plan's endpoint `/step_plan/v1`, over Chat, starting on `step-5-preview`; its key is kept apart from the pay-as-you-go StepFun endpoint.
- ChatGPT plan: function tools without `strict` are sent with `strict: false`, so the route does not turn optional parameters into required ones.
- The package carries an icon for the extension market.

## 0.3.0

- Needs Cortico 0.2.0 (provider contract 6): the module's panels are declared by `webUi()`, and the sign-in methods of the `chatgpt` module are reached under `/api/webui/`.
- Self-description: `describe` on the `coo` and `chatgpt` modules, written out to `describe.json`.
- Whether a service gets placeholder reasoning before a tool call is set per service: DeepSeek gets it, OpenRouter does not.
- ChatGPT plan: a final response with an empty `output` takes the items of its `output_item.done` events.
