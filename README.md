<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner.svg" alt="Coopanion" width="806">
  </picture>
</p>

<p align="center">
  English ｜
  <a href="README_zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Pal-AI-Lab/Coopanion?color=00a870"></a>
  <a href="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Pal-AI-Lab/Coopanion/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Windows 10 / 11" src="https://img.shields.io/badge/Windows-10%20%2F%2011-1f6feb">
  <img alt="macOS 13+" src="https://img.shields.io/badge/macOS-13%2B-1f6feb">
  <img alt="Linux x64" src="https://img.shields.io/badge/Linux-x64-1f6feb">
  <a href="LICENSE"><img alt="AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-8b8b8f"></a>
</p>

<p align="center">
  <a href="https://coo.palailab.org">Website</a> ｜
  <a href="#install">Install</a> ｜
  <a href="#getting-started">Getting Started</a> ｜
  <a href="#everyday-use">Everyday Use</a> ｜
  <a href="#cost-and-privacy">Cost and Privacy</a> ｜
  <a href="#faq">FAQ</a> ｜
  <a href="#community">Community</a> ｜
  <a href="https://github.com/Pal-AI-Lab/Coopanion/releases">Changelog</a> ｜
  <a href="docs/DEVELOPMENT.md">Development</a>
</p>

Coopanion is a desktop pet. **Coo** lives on the bottom edge of your screen: it chats with you in speech bubbles, listens when you talk, walks along the edge, and with your permission can use your computer. It runs on Windows, macOS and Linux.

**Languages**: the app and its first-run guide are in 简体中文, 繁體中文, English, 日本語, 한국어, Français, Deutsch, Español (Latinoamérica), Português (Brasil), Italiano and Русский. A new install uses the system language (English when the system language is none of these); change it under **Language** on the Habits page. Coo talks to you in the app language.

![1790222143546](image/README/1790222143546.png)

<p align="center"><img src="image/README/pet-desktop-en.png" alt="Coo" width="640"></p>

## Features

- **Many model services**: OpenAI, Anthropic, Gemini, xAI, OpenRouter, DeepSeek, Kimi, Qwen, MiniMax, Zhipu GLM, Doubao, Baidu Qianfan and StepFun with an API key, or a ChatGPT account through its ChatGPT plan.
- **Chat**: hold the talk key and speak, or type; Coo answers in a bubble. Speech is recognized on your machine with FunASR or Whisper.
- **Memory**: Coo remembers what you talked about and when you poke it or pat its head. What it knows about you goes in `PARTNER.md` in its workspace, and every change to the workspace is kept as a version (the Windows build carries git; on macOS and Linux git has to be installed).
- **Computer use**: clicking buttons, typing, switching windows. Coo asks before it acts.
- **Activity bubbles**: an animated icon shows when Coo is thinking, reading, searching, writing or using the computer.
- **Figures**: Coo, or the **DeepSeek Chan**, a fully animated whale girl with eight vendor color schemes and three outfits. Other figure packs are imported on the Dress up page (see the [figure pack compatibility promise](packages/cortico-world-desktop-pet/README.md#形象包兼容承诺)).
- **Dress up**: Coo's colors (five of them after Cultist Simulator's principles: Lantern, Grail, Forge, Heart, Winter), hats, earrings, glasses and neckwear, its size and how often it walks.
- **Alarms**: ask Coo to set one at a local time or after a number of minutes.
- **Extensions**: Worlds such as a QQ bot, a drawing room and small games, installed from World extensions → Extension market.
- **OBS overlay**: Coo and its bubbles as an OBS Browser source on a transparent background.

What changed in each version is in [Releases](https://github.com/Pal-AI-Lab/Coopanion/releases).

## Install

You need:

- Windows 10 / 11 (64-bit), macOS 13 or later (Apple silicon or Intel), or a 64-bit Linux desktop (X11, or XWayland under Wayland; speech recognition needs glibc 2.32 or later: Ubuntu 22.04, Debian 12 and later);
- an API key from one model service, which bills you for usage (see [Cost and privacy](#cost-and-privacy)), or a ChatGPT account with a plan.

Installing does not need administrator rights.

### Windows

- **Installer**: download `Coopanion-Setup-<version>.exe` from the [latest release](https://github.com/Pal-AI-Lab/Coopanion/releases/latest) and run it. The installer is not code-signed, so Windows may show "Windows protected your PC": click **More info** → **Run anyway**. Pick a folder (default `C:\Users\<you>\Coopanion`). The program and all its data stay in that folder; there is no Start menu entry, so open it from the desktop icon.
- **One command**: in PowerShell, run

  ```powershell
  irm https://raw.githubusercontent.com/Pal-AI-Lab/Coopanion/main/installer/install.ps1 | iex
  ```

  If antivirus software stops the graphical installer halfway, the downloaded installer is kept and its path printed. Retry it silently with `Coopanion-Setup-<version>.exe /S`, or add Coopanion to your antivirus's allowed list first.
- **Portable**: unpack `Coopanion-<version>-win-x64-portable.zip` from the [latest release](https://github.com/Pal-AI-Lab/Coopanion/releases/latest) into any folder and run `Coopanion.exe`. Its data stays in the folder's `data`. A copy of the whole folder is another pet with its own memory and settings; up to 5 run at once, installed and portable together. It does not update itself: unpack the new version into a new folder and copy the old `data` into it.

### macOS

1. From the [latest release](https://github.com/Pal-AI-Lab/Coopanion/releases/latest), download `Coopanion-<version>-mac-arm64.dmg` (Apple silicon) or `…-mac-x64.dmg` (Intel), open it and drag Coopanion into Applications.
2. The app has no Apple developer signature, so macOS blocks the first open. Open it once and click Done on the warning, then go to System Settings → Privacy & Security, click **Open Anyway** and confirm with your password.
3. Coopanion lives in the menu bar; it shows in the Dock only while the settings window is open.

> [!NOTE]
> macOS asks for Microphone (voice input), Input Monitoring (talk key), and Screen & System Audio Recording plus Accessibility (computer use) the first time each is needed. Restart Coopanion after changing the last three. macOS does not carry these grants over to an updated version: if Coopanion says a permission is missing while its switch is on, remove Coopanion from that list with −, add `/Applications/Coopanion.app` back and restart.

### Linux

1. From the [latest release](https://github.com/Pal-AI-Lab/Coopanion/releases/latest), download `Coopanion-<version>-linux-x64.deb` (Debian / Ubuntu) or `Coopanion-<version>-linux-x64.AppImage` (other distributions).
2. deb: `sudo apt install ./Coopanion-<version>-linux-x64.deb`. AppImage: `chmod +x Coopanion-*.AppImage` and run it; Ubuntu 22.04 and later need `libfuse2` first (`sudo apt install libfuse2t64`).

> [!NOTE]
> The pet is a transparent always-on-top window, so the desktop needs compositing (on by default in GNOME and KDE). The tray icon needs status icon support (GNOME needs the AppIndicator extension); without a tray, right-click Coo to reach the settings. Computer use needs `xdotool` and `zenity`, which the deb installs; screenshots under Wayland also need one of `grim`, `spectacle`, `scrot` or ImageMagick.

## Getting started

1. **Start**: Coo drops to the bottom of the screen and an icon appears in the tray (menu bar on Mac, status bar on Linux). No window opens.
2. **Guide**: Coo walks you through setup in its bubbles: what to call you, what Coo is like, how much it walks, which model service to use, and the speech model download (from ModelScope; FunASR about 230 MB, or Whisper about 360 MB when the app language is French, German, Spanish, Portuguese, Italian or Russian). The × on the bubble ends the guide; **Guide** on the Start page runs it again. Afterwards you can talk Coo through its personality and way of speaking, and it writes the persona into its prompt itself.
3. **Say hello**: tap **Left Alt** (**Left Option** on Mac), then press and hold it, say "hello", and release to send. Allow microphone access when asked.

<details>
<summary><b>Getting an API key</b></summary>

Select a service in Coo's bubble or on the Start page, create a key on its platform (DeepSeek also needs a topped-up balance) and paste it in.

| Service | Get a key | Default model |
| --- | --- | --- |
| OpenAI | [platform.openai.com](https://platform.openai.com/settings/organization/api-keys) | `gpt-6-luna` |
| Anthropic | [platform.claude.com](https://platform.claude.com/settings/keys) | `claude-haiku-5-5` |
| Gemini (Google AI Studio) | [aistudio.google.com](https://aistudio.google.com/apikey) | `gemini-3.5-flash-lite` |
| xAI | [console.x.ai](https://console.x.ai/team/default/api-keys) | `grok-4.3` |
| OpenRouter | [openrouter.ai](https://openrouter.ai/settings/keys) | `deepseek/deepseek-v4.1-flash` |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com/api_keys) | `deepseek-flash` |
| Kimi (Moonshot) | international [platform.kimi.ai](https://platform.kimi.ai/console/api-keys), mainland China [platform.kimi.com](https://platform.kimi.com/console/api-keys) | `kimi-k3` |
| Qwen (Alibaba Cloud Model Studio) | international [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1/model/settings/api-key), mainland China [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing/model/settings/api-key) | `qwen3.8-flash` |
| MiniMax | international [platform.minimax.io](https://platform.minimax.io/user-center/basic-information/interface-key), mainland China [platform.minimax.cn](https://platform.minimax.cn/user-center/basic-information/interface-key) | `MiniMax-M3` |
| Zhipu GLM | international (Z.ai) [z.ai](https://z.ai/manage-apikey/apikey-list), mainland China [bigmodel.cn](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) | `glm-5.3-flash` (on the mainland China platform, switch to `glm-5.3` if it fails to connect) |
| Doubao (Volcengine Ark) | [ark.volcengine.com](https://ark.volcengine.com/region:cn-beijing/apikey) | `doubao-seed-2-1-lite-260915` (enable it in the Ark console first) |
| Baidu Qianfan | [console.bce.baidu.com](https://console.bce.baidu.com/iam/#/iam/apikey/list) | `glm-5.3-flash` |
| StepFun | [platform.stepfun.com](https://platform.stepfun.com/interface-key) | `step-3.7-flash` |
| StepFun Step Plan | [platform.stepfun.com](https://platform.stepfun.com/interface-key) | `step-5-preview` (billed to the Step Plan subscription) |

Each default is the fast, cheap, vision-capable tier of that vendor; change the name in the Model field on the Start page to use another. Kimi, Qwen, MiniMax and Zhipu GLM have separate mainland China and international platforms with separate accounts and keys; switch between them on the Start page. Doubao, Baidu Qianfan, StepFun and StepFun Step Plan take mainland China accounts only. Only DeepSeek, Anthropic and StepFun Step Plan have been tested with real keys; open an issue if another one fails.

**ChatGPT** takes no key: pick it, press **Continue with ChatGPT** and sign in in the browser that opens. Coo's requests count toward that account's ChatGPT plan and its usage limits; at the limit Coo goes quiet and tries again every few minutes.

</details>

## Everyday use

### Talking and playing

- **Voice**: tap Left Alt, then hold it and speak; releasing ends the sentence. The talk key, microphone and listening mode (hold to talk / press to toggle / always listen) are on the Voice input page. With the system default microphone selected, changing the default input in system settings switches voice input to that device without restarting Coopanion. Instead of recognizing speech locally, you can pick an OpenAI-compatible transcription service there; the recording of each sentence then goes to that service.
- **Typing**: rest the pointer on Coo and click the bubble button beside it. With **Typing key** on in Habits, pressing that key in any window opens the typing box too (left Ctrl pressed twice by default). You can paste up to 4 images into the typing box.
- **Bubbles**: Coo's bubble stays up while the pointer is on it; the countdown resumes when the pointer leaves.
- **Alarms**: ask Coo for one at a local time or after a number of minutes. Daily alarms keep the local clock time across daylight-saving changes, and alarms missed while the app is closed arrive when it next starts.
- **Touch**: click to poke Coo, move back and forth over its head to pat it, press and drag to pick it up; let go mid-swing to throw it, or over another display to move it there.
- **Menu**: right-click Coo for pause / resume, settings, typing, voice input, dress up, hide and quit.

Coopanion keeps running in the background: closing the settings window does not quit it, and the tray icon (menu bar on Mac) has show pet, start at login, restart and quit.

### Computer use

Off by default. Tick **Let Coo use this computer** in the Computer use section of the Habits page, read the risks it shows and click **Turn on**; untick it to keep Coo off your computer again.

- **When to ask you**, from strictest to loosest: `ask-each-turn`, `ask-before-acting`, `ask-once` (the default: Coo looks at the screen without asking and asks once before using the mouse and keyboard; a yes lasts 30 minutes) and `never-ask`.
- At every level, Coo asks once more before typing or pressing keys in a terminal window or pressing Win+R; after a yes it does not ask about these again for the same 30 minutes. Turning on **Turn off asking before terminals and the Run box** in the desktop pet World's config in advanced mode makes these steps follow the asking level like any other input.
- Coo uses the computer only for what you say, type or pick in the desktop pet. When a message from elsewhere asks for it, Coo tells you in a bubble and waits for your yes.
- When you touch the mouse or keyboard, Coo stops and waits for you. Logins, passwords and payments are left to you.
- One wake makes at most 40 model requests; at the limit the turn ends and you can tell Coo to continue.

### Settings window

The title bar holds Back, Forward, sidebar folding and the light/dark switch on the left (to the right of the traffic lights on macOS), followed by the version, the GitHub link and the update status; hover the status for details. The sidebar folds when the window gets narrower than 1000px. The window remembers its last unmaximized size and reopens at it within the primary display’s work area.

Click the tray icon, or right-click Coo and click the gear. **Normal mode** shows pet pages, World extensions and their pages; **Advanced mode** at the bottom left of the expanded sidebar adds model providers, Persona, Memory, console and diagnostics.

| Page | What is there |
| --- | --- |
| Start | Connect a model, show or hide the pet, interface colors, rerun the guide, pause / resume |
| Habits | Language, your name and Coo's, usage statistics, walking, how Coo responds to touches, typing key, display sizes, sounds and speech, computer use, OBS overlay |
| Dress up | Figure, colors and accessories; import or uninstall figure packs |
| Voice input | Recognizer or transcription service, model download, talk key, microphone, listening mode, speech threshold |
| System prompt | Coo's system prompt; the persona is the CONSTITUTION section |
| Usage & cost | Tokens used and money spent per day |
| Chat | The current conversation, with the images Coo shows |

<p align="center"><img src="image/README/habits-en.png" alt="Habits" width="720"></p>
<p align="center"><img src="image/README/dress-en.png" alt="Dress up" width="720"></p>

The Model page in advanced mode changes the model and reasoning effort, adds an "OpenAI Responses Compatible" connection for any other service that speaks the Responses API, and takes prices for services without built-in ones.

**Extensions**: **World extensions → Extension market** in normal mode lists Worlds on npm with the `cortico-world` keyword; packages in the [official index](https://github.com/Pal-AI-Lab/cortico-extensions) also show tags, votes and comments. The **World extensions** tab contracts each World card into an icon in a separate column while the catalog opens from the right; returning to **My Worlds** expands the cards and closes the catalog. Both tabs preserve avatar positions and list scrolling. Pending extensions appear under **Pending restart**, with **Restart process** below the group; other entries appear under **Extensions**. Only a process restart animates pending entries into assembly order. Compact white cards use icon controls and show labeled live signals; package details and World configuration remain available. Visibility changes offer to reload the system prefix when required. Routine action success is reflected in the entry state. Install and version-change results stay in their detail drawer; failed restarts can be retried. The catalog supports search, capability categories (choosing one clears the tag choices), tags and package details: series tags select, caution tags exclude and stay excluded across sessions, and the selections and exclusions are listed above the cards; switching the manual installation source keeps the form in place; each list scrolls independently, with scrollbars shown only while hovering its region and the catalog scrollbar at the page’s right edge. Catalog cards place author, version and badges beside the title; installed state appears on the action button. Provider extensions are under **Model connections → Extension market**, using the same catalog layout without the World icon column. Switching between it and **Settings** has no transition animation. **Settings** keeps connection configuration; instance cards show provider type and model. Its instance list and configuration form scroll independently, with the new-instance button fixed above the list and scrollbars shown on hover. The configuration scrollbar sits at the right edge of the page.

**Updates**: the Windows installer build and the AppImage download new versions in the background, and Coo asks whether to restart and update; choosing **Later** installs it when you quit. Turning off **Habits → General → Automatic updates** stops the checks, cancels a download under way and keeps a downloaded update from installing. On Mac, with the deb and with the Windows portable build, the update status beside the version in the title bar links to a newer release to download by hand. Steam updates the Steam build.

## Cost and privacy

- **Cost**: Coopanion is free. The model service you choose bills you for usage; see the Usage & cost page (built-in prices exist for DeepSeek, OpenAI, Anthropic, Gemini's paid tier and xAI). Signed in with ChatGPT, requests count toward the ChatGPT plan instead and show no cost.
- **Sent to the model service**: what you say and type, your interactions with Coo, and screenshots during computer use. Only the service you configured receives them.
- **Kept on your machine**: API keys and the ChatGPT sign-in, memory, conversation history, settings and logs. Speech is recognized locally and only the text is sent, unless a transcription service is chosen on the Voice input page: then the recording of each sentence goes to that service.
- **Local pet service**: browser writes and WebSocket connections require the pet service's own HTTP origin, including its port. The desktop window authenticates with a random credential passed to its host at startup.
- **Anonymous usage statistics**: sent to `survey.palailab.org`. Only counts, time used, settings and a random install ID; no conversations, screenshots, keys or files. Every field is listed in [docs/TELEMETRY.md](docs/TELEMETRY.md). Turn it off in Habits.
- **Other network access**: checks for new releases on GitHub (in the background on Windows and with the AppImage, when the settings window opens on Mac and with the deb); npm and the official extension index on GitHub on the Extensions page, and GitHub for votes and comments; ModelScope (or Hugging Face as a fallback) when downloading the speech model.

## Data and uninstalling

| System | Data folder | Uninstall |
| --- | --- | --- |
| Windows | `data` inside the install folder; for the portable version, inside its folder | Settings → Apps; for the portable version, turn off Start at login, then delete the folder |
| macOS | `~/Library/Application Support/Coopanion` | Drag Coopanion from Applications to the Trash |
| Linux | `~/.config/Coopanion` | deb: `sudo apt remove coopanion`; AppImage: delete the file |

Uninstalling keeps the data, so memory and settings are still there after a reinstall. To remove everything, delete the data folder by hand (on Windows, the whole install folder). Inside it, `home` holds memory, conversations, settings and API keys, `home/models` the speech model, `extensions` the extensions and `logs` the logs.

On Windows, a reinstall into a new folder asks at start whether to inherit the data used before or start a new one.

## FAQ

<details>
<summary><b>The pet is gone</b></summary>

Right-click the tray icon → Show pet; if the icon is hidden, click `^` at the bottom right of the taskbar. Opening the program again also works. On Mac, click the menu bar icon → Show pet.

</details>

<details>
<summary><b>Coo does not answer</b></summary>

Check the status next to the title on the Start page. **Paused**: click resume. **No model connected**: check that the API key is complete and the account has balance, then click **Test**. Keys for Kimi, Qwen, MiniMax and Zhipu GLM only work on the platform (mainland China or international) they were created on; Doubao needs the default model enabled in the Ark console. After 5 failed model requests in a row, Coo says the error in a bubble.

</details>

<details>
<summary><b>Coo cannot hear me</b></summary>

- The mic button beside Coo must not be crossed out;
- tap Left Alt first, then press and hold it (two presses too far apart do not count);
- the Voice input page shows the recognizer as ready (click Download if the model is missing), and its level meter moves while you speak;
- Windows: Settings → Privacy & security → Microphone, allow desktop apps;
- Mac: System Settings → Privacy & Security, turn on Microphone and Input Monitoring for Coopanion, then restart it.

</details>

<details>
<summary><b>I need a proxy</b></summary>

Coopanion uses the system proxy (HTTP or HTTPS; SOCKS is not used) as it is at the moment of each request, so turning a proxy app on or off needs no restart, and a PAC script decides per site. `HTTP_PROXY` / `HTTPS_PROXY` set in the environment Coopanion starts from take its place. Local traffic bypasses the proxy.

</details>

<details>
<summary><b>On Linux, Coo leaves square traces where it has been</b></summary>

With Intel graphics (Mesa's iris driver), fast clear leaves old frames in the transparent window. Start Coopanion with `INTEL_DEBUG=nofc` set, for example `INTEL_DEBUG=nofc coopanion` for the deb; rendering on a discrete GPU also avoids it.

</details>

<details>
<summary><b>The screen under the pet turns black</b></summary>

On some Windows machines a transparent window is drawn black while hardware acceleration is on. Try adding ` --disable-gpu-compositing` to the end of the shortcut's Target.

</details>

<details>
<summary><b>What is it thinking?</b></summary>

The Chat page has the full record. If something goes wrong, click **Export diagnostics** there and attach the file to an [issue](https://github.com/Pal-AI-Lab/Coopanion/issues).

</details>

## Community

- QQ Group 2: 1129285246 (Group 1, 1080755910, is full)
- Discord Server: https://discord.gg/DR37WB5zJf

## Contributing

- Report problems and ideas in [Issues](https://github.com/Pal-AI-Lab/Coopanion/issues) with your OS version, Coopanion version and steps to reproduce.
- To build from source or change the code, see the [development guide](docs/DEVELOPMENT.md).

## Acknowledgements

Coopanion is assembled from [Cortico](https://github.com/Pal-AI-Lab/Cortico): Cortico Core + Cormini Persona + the [desktop pet World](packages/cortico-world-desktop-pet), computer use included.

## License

[AGPL-3.0-or-later](LICENSE), with an additional permission under section 7 to link the Steamworks API libraries, which the Steam version loads. Releases up to and including 0.1.10 are MIT. The Cortico framework is MIT and ships as a submodule. To open a PR see [CONTRIBUTING.md](CONTRIBUTING.md); your first contribution needs a signed [Contributor License Agreement](CLA.md).

The DeepSeek Whale artwork (the textures under `packages/cortico-world-desktop-pet/web/whale/`) is not covered by the AGPL; its origin and the vendor logos are described in the [desktop pet World's third-party notices](packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md). Third-party components shipped or downloaded at runtime: Electron (MIT), Cortico (MIT), sherpa-onnx (Apache-2.0), FunASR's SenseVoiceSmall model ([FunASR model license](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE), downloaded on use), OpenAI's Whisper small model (MIT, downloaded on use), koffi (MIT), jpeg-js (BSD-3-Clause), pnpm (MIT); model service logos come from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT; each logo belongs to its company and only identifies the service).
