## 0.1.0

- First release: `biliscript_transcribe`, `biliscript_jobs`, `biliscript_read`, `biliscript_name_speakers`, `biliscript_cancel`; character naming by the deployment's active model endpoint (default), by a separately configured model over the OpenAI, Anthropic or Gemini protocol, or by the bot.
- The environment check reports the device each step uses and why a present GPU goes unused; a failed GPU run falls back to the CPU in `auto` mode.
