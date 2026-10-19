## 0.3.1

- StepFun Step Plan: a new service `stepfun-plan` on the plan's endpoint `/step_plan/v1`, over Chat, starting on `step-5-preview`; its key is kept apart from the pay-as-you-go StepFun endpoint.
- ChatGPT plan: function tools without `strict` are sent with `strict: false`, so the route does not turn optional parameters into required ones.
- The package carries an icon for the extension market.

## 0.3.0

- Needs Cortico 0.2.0 (provider contract 6): the module's panels are declared by `webUi()`, and the sign-in methods of the `chatgpt` module are reached under `/api/webui/`.
- Self-description: `describe` on the `coo` and `chatgpt` modules, written out to `describe.json`.
- Whether a service gets placeholder reasoning before a tool call is set per service: DeepSeek gets it, OpenRouter does not.
- ChatGPT plan: a final response with an empty `output` takes the items of its `output_item.done` events.
