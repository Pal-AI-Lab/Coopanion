<!-- Owner: app/main.cjs, core/companion.ts, console/index.ts. -->
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

<p align="center"><img src="image/README/start-en.png" alt="Coopanion settings: model connections and the Coo preview" width="960"></p>

## Features

- **Many model services**: OpenAI, Anthropic, Gemini, xAI, OpenRouter, DeepSeek, Kimi, Qwen, MiniMax, Zhipu GLM, Doubao, Baidu Qianfan and StepFun with an API key, or a ChatGPT account through its ChatGPT plan.
- **Chat**: hold the talk key and speak, or type; Coo answers in a bubble. Speech is recognized locally with FunASR or Whisper, or by a transcription service you configure.
- **Memory**: Coo keeps notes about you in `PARTNER.md` and organizes longer memories by topic and date. Its text changes are versioned when Git is available; Windows includes Git, while macOS and Linux use the system installation.
- **Computer use**: let Coo look at the screen, click, type and switch windows. Off by default, with configurable consent and interruption when you use the mouse, keyboard or talk key.
- **Activity bubbles**: an animated icon shows when Coo is thinking, reading, searching, writing or using the computer.
- **Figures**: Coo, or the **DeepSeek Chan**, a fully animated whale girl with eight vendor color schemes and three outfits. Other figure packs are imported on the Dress up page (see the [figure pack compatibility promise](packages/cortico-world-desktop-pet/README.md#形象包兼容承诺)).
- **Dress up**: colors including Nai Coo and five Cultist Simulator principles, hats, earrings, glasses and neckwear. Adjust the pet, bubble and text sizes separately.
- **Alarms**: ask Coo to set one at a local time or after a number of minutes.
- **Extensions**: Worlds such as a QQ bot, a drawing room and small games, installed from World extensions → Extension market.
- **OBS overlay**: Coo and its bubbles as an OBS Browser source on a transparent background.

What changed in each version is in [Releases](https://github.com/Pal-AI-Lab/Coopanion/releases).

## Install

You need:

- Windows 10 / 11 (64-bit), macOS 13 or later (Apple silicon or Intel), or a 64-bit Linux desktop (X11, or XWayland under Wayland; speech recognition needs glibc 2.32 or later: Ubuntu 22.04, Debian 12 and later);
- an API key from one model service, which bills you for usage (see [Cost and privacy](#cost-and-privacy)), or a ChatGPT account with a plan.

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

While App Store is the active app, Coo stays behind other windows so that App Store purchases can be confirmed with Touch ID.

> [!NOTE]
> macOS asks for Microphone (voice input), Input Monitoring (talk key), and Screen & System Audio Recording plus Accessibility (computer use) the first time each is needed. Restart Coopanion after changing the last three. macOS does not carry these grants over to an updated version: if Coopanion says a permission is missing while its switch is on, remove Coopanion from that list with −, add `/Applications/Coopanion.app` back and restart.

### Linux

1. From the [latest release](https://github.com/Pal-AI-Lab/Coopanion/releases/latest), download `Coopanion-<version>-linux-x64.deb` (Debian / Ubuntu) or `Coopanion-<version>-linux-x64.AppImage` (other distributions).
2. deb: `sudo apt install ./Coopanion-<version>-linux-x64.deb`. AppImage: install your distribution’s FUSE 2 compatibility library, run `chmod +x Coopanion-*.AppImage`, then open the file.

> [!NOTE]
> The pet is a transparent always-on-top window, so the desktop needs compositing (on by default in GNOME and KDE). The tray icon needs status icon support (GNOME needs the AppIndicator extension); without a tray, right-click Coo to reach the settings. Computer use needs `xdotool` and `zenity`, which the deb installs; screenshots under Wayland also need one of `grim`, `spectacle`, `scrot` or ImageMagick.

## Getting started

1. **Start**: Coo drops to the bottom of the screen and an icon appears in the tray (menu bar on Mac, status bar on Linux). No window opens.
2. **Guide**: Coo walks you through setup in its bubbles: the app language, what to call you, what Coo is like, how much it walks, which model service to use, and the speech model download (from ModelScope; FunASR about 230 MB, or Whisper about 360 MB when the app language is French, German, Spanish, Portuguese, Italian or Russian). The × on the bubble ends the guide; **Guide** on the Start page runs it again. Afterwards you can talk Coo through its personality and way of speaking, and it writes the persona into its prompt itself.
3. **Say hello**: tap **Left Alt** (**Left Option** on Mac), then press and hold it, say "hello", and release to send. Allow microphone access when asked.

<details>
<summary><b>Connect a model: API key or ChatGPT sign-in</b></summary>

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

These are the app’s [configured defaults](packages/cortico-provider-coo/src/vendors.ts). To use another model, change the Model field on the Start page; computer use requires image support. Kimi, Qwen, MiniMax and Zhipu GLM have separate mainland China and international platforms with separate accounts and keys; switch between them on the Start page. Doubao, Baidu Qianfan, StepFun and StepFun Step Plan take mainland China accounts only. Only DeepSeek, Anthropic and StepFun Step Plan have been tested with real keys; open an issue if another one fails.

**ChatGPT** takes no key: pick it, press **Continue with ChatGPT** and sign in in the browser that opens. Coo's requests count toward that account's ChatGPT plan and its usage limits; at the limit Coo goes quiet and tries again every few minutes.

</details>

## Everyday use

### Talking and playing

- **Voice**: tap **Left Alt** (**Left Option** on Mac), then hold it and speak; release to send. The Voice input page sets the talk key, microphone, speech threshold and listening mode: hold to talk, press to toggle or always listen. With the system default microphone selected, Coo follows changes to the default input device.
- **Typing**: hover over Coo and click the bubble button. Enable **Habits → Typing key** to open the box from any window (double-press Left Ctrl by default). Paste up to four images into a message. You can also type on the Chat page.
- **Shared shortcuts**: when the talk key and typing key use the same key, a quick double tap opens typing; holding the final press for more than 300 ms starts voice input. A held final press does not open the typing box.
- **Bubbles**: hovering over a bubble keeps it open. Habits controls activity bubbles, input bubbles, bubble size, text size and how quickly text appears.
- **Alarms**: ask Coo for one at a local time or after a number of minutes. Daily alarms keep their local time across daylight-saving changes; missed alarms arrive when the app next starts.
- **Touch**: click to poke, move across Coo’s head to pat it, or drag to pick it up. Release mid-swing to throw it, or on another display to move it there. **Habits → Response mode** chooses which touches get an immediate answer.

Speech recognition is local by default: FunASR for Chinese, English, Japanese and Korean, and Whisper for French, German, Spanish, Portuguese, Italian and Russian. Windows also offers its system recognizer. Choose an **OpenAI-compatible** transcription service on the Voice input page to send each sentence’s recording to that service instead.

Right-click Coo for settings, typing, voice input, dress up, pause / resume, hide and quit. Closing settings leaves Coopanion running. The tray menu (menu bar on Mac) also offers start at login, restart and **Let clicks pass through Coo**. Click-through lasts until you turn it off or quit; Coo keeps walking and talking.

### Appearance and sound

**Dress up** changes the figure, palette and accessories immediately. Import a figure pack from a zip or folder, or drag it onto the page; imported packs can be uninstalled there. Large imports have a confirmation warning above 128 MB.

<p align="center"><img src="image/README/dress-en.png" alt="Dress up: Coo palettes, hats and accessories" width="960"></p>

In **Habits → Sounds**, choose sound categories, set the volume for all pet sounds, and decide whether audio pans with Coo’s position. **Speech → Read bubbles aloud** replaces the talking sound with short syllables, with adjustable pitch and speed. These switches affect the desktop pet; sound provided by another World is configured on that World’s page.

<p align="center"><img src="image/README/habits-en.png" alt="Habits: pet sound volume, stereo positioning and speech settings" width="960"></p>

To use Coo in OBS, turn on **Habits → Other → Export OBS overlay** and add the displayed URL as an OBS Browser source, using your screen’s resolution. It includes Coo and the bubbles on a transparent background.

### Computer use

Off by default. In **Habits → Computer use**, enable **Let Coo use this computer** and confirm the risk notice. Turn off **Allow the mouse and keyboard** to allow screenshots only, or disable computer use entirely.

| When to ask you | Behavior |
| --- | --- |
| Every turn | Ask before the first screenshot or input in each turn. |
| Before acting | Take screenshots without asking; ask before the first mouse or keyboard action each turn. |
| Once (default) | Take screenshots without asking; ask before acting, then reuse consent for the configured period (30 minutes by default). |
| Never | Take screenshots and act without asking. |

- Terminal input and Win+R require separate consent for the configured period. Advanced mode’s **Desktop pet → Config** can turn off that extra question.
- Computer use is authorized through what you say, type or choose in the desktop pet. Requests from other Worlds need your confirmation in a bubble.
- Moving the mouse or using the keyboard makes Coo yield until you have been idle for two seconds by default. Typing to Coo also takes priority.
- A message sent with the talk key interrupts a reply or computer operation once transcription finishes. Waiting and remaining steps stop; a click, drag or key sequence already in progress finishes first. Always-listening speech does not interrupt.
- Handle logins, passwords and payments yourself. One wake allows up to 40 model requests; tell Coo to continue if it reaches that limit.

These controls apply to the desktop pet’s computer use. Configure tools supplied by other Worlds on their own pages.

### Settings window

Open settings from the tray or Coo’s right-click menu. The title bar has Back, Forward, sidebar folding, appearance and update controls. The sidebar folds below 1000 px; the window remembers its size.

| Page | What you can change or view |
| --- | --- |
| Start | Model connection, pet visibility and preview, interface colors, first-run guide |
| Habits | Language and names, walking and touch responses, self-adjustment permissions, shortcuts, display, sound, computer use, OBS overlay |
| Dress up | Figure, colors and accessories; import or uninstall figure packs |
| Voice input | Recognition engine or transcription service, model download, talk key, microphone, listening mode and speech threshold |
| System prompt | Persona and prompt templates; save with Ctrl+S, then **Apply now** to update the current conversation |
| Usage & cost | Token usage and costs by day and model |
| Chat | Conversation history, typing, images and diagnostic export |
| World extensions | Installed Worlds, groups, ordering and the extension market |

Pause / resume is at the bottom of the sidebar. **Advanced mode** adds **Model connections**, Persona, Memory and diagnostics. Model connections lets you change models and reasoning settings, add compatible services, set prices and install provider extensions. Return to normal mode from the same sidebar control.

### World extensions

In **World extensions → Extension market**, search for Worlds, filter by capability or tags, and open a package’s details to install it. Packages in the [official index](https://github.com/Pal-AI-Lab/cortico-extensions) include tags, votes and comments. Excluding a caution tag keeps matching packages out of the results across visits.

After installation, use **Restart process** when the extension is listed under **Pending restart**. In **My Worlds**, you can:

- group and drag Worlds into order; the sidebar follows that order;
- open extension details from a World’s name or avatar and open its configuration;
- hide a World from the sidebar, hide its tools and messages from Coo while it keeps running, or stop it.

<p align="center"><img src="image/README/worlds-en.png" alt="World extensions: installed Worlds, status and grouping controls" width="960"></p>

Provider extensions are under **Advanced mode → Model connections → Extension market**. Installed extensions remain in the data folder across application reinstalls.

### Updates

The Windows installer build and AppImage download updates in the background. Coo asks whether to restart and install; **Later** installs on quit. On these builds, **Habits → General → Automatic updates** stops checks and downloads and prevents a downloaded update from installing when disabled.

macOS, deb and Windows portable builds link to a newer release in the title bar for manual installation. Steam manages updates for its build.

## Cost and privacy

- **Cost**: Coopanion is free. The model service you choose bills you for usage; see the Usage & cost page (built-in prices exist for DeepSeek, OpenAI, Anthropic, Gemini's paid tier and xAI). Signed in with ChatGPT, requests count toward the ChatGPT plan instead and show no cost.
- **Sent to the model service**: what you say and type, attached images, your interactions with Coo, and screenshots during computer use. Only the service you configured receives them.
- **Kept on your machine**: API keys and the ChatGPT sign-in, memory, conversation history, settings and logs. Speech is recognized locally and only the text is sent, unless a transcription service is chosen on the Voice input page: then the recording of each sentence goes to that service.
- **Anonymous usage statistics**: sent to `survey.palailab.org`. Only counts, time used, settings and a random install ID; no conversations, screenshots, keys or files. Every field is listed in [docs/TELEMETRY.md](docs/TELEMETRY.md). Turn it off in Habits.
- **Other network access**: checks for new releases on GitHub (in the background on Windows and with the AppImage, when the settings window opens on Mac and with the deb); npm and the official extension index on GitHub in the extension market, and GitHub for votes and comments; ModelScope (or Hugging Face as a fallback) when downloading the speech model.

## Data and uninstalling

| System | Data folder | Uninstall |
| --- | --- | --- |
| Windows | `data` inside the install folder; for the portable version, inside its folder | Settings → Apps; for the portable version, turn off Start at login, then delete the folder |
| macOS | `~/Library/Application Support/Coopanion` | Drag Coopanion from Applications to the Trash |
| Linux | `~/.config/Coopanion` | deb: `sudo apt remove coopanion`; AppImage: delete the file |

Uninstalling an installed build keeps its data. Deleting a portable folder also deletes its `data`, so back that up first. To remove everything, delete the data folder by hand (on Windows, the whole install folder). Inside it, `home` holds memory, conversations, settings and API keys, `home/models` the speech model, `extensions` the extensions and `logs` the logs.

On Windows, a reinstall into a new folder asks at start whether to inherit the data used before or start a new one.

## FAQ

<details>
<summary><b>The pet is gone</b></summary>

Right-click the tray icon → Show pet; if the icon is hidden, click `^` at the bottom right of the taskbar. Opening the program again also works. On Mac, click the menu bar icon → Show pet.

</details>

<details>
<summary><b>Coo does not answer</b></summary>

Check **Start → Connected model** and the run status at the bottom of the sidebar. **Paused**: click resume. **Not connected**: check that the API key is complete and the account has balance, then click **Save and start**. Use **Test** to recheck an existing connection. Keys for Kimi, Qwen, MiniMax and Zhipu GLM only work on the platform (mainland China or international) they were created on; Doubao needs the default model enabled in the Ark console. After 5 failed model requests in a row, Coo says the error in a bubble.

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
- [Discord server](https://discord.gg/DR37WB5zJf)

## Contributing

- Report problems and ideas in [Issues](https://github.com/Pal-AI-Lab/Coopanion/issues) with your OS version, Coopanion version and steps to reproduce.
- To build from source or change the code, see the [development guide](docs/DEVELOPMENT.md).

## Acknowledgements

Coopanion is assembled from [Cortico](https://github.com/Pal-AI-Lab/Cortico): Cortico Core + Cormini Persona + the [desktop pet World](packages/cortico-world-desktop-pet), computer use included.

## License

[AGPL-3.0-or-later](LICENSE), with an additional permission under section 7 to link the Steamworks API libraries, which the Steam version loads. Releases up to and including 0.1.10 are MIT. The Cortico framework is MIT and ships as a submodule. To open a PR see [CONTRIBUTING.md](CONTRIBUTING.md); your first contribution needs a signed [Contributor License Agreement](CLA.md).

The DeepSeek Whale artwork (the textures under `packages/cortico-world-desktop-pet/web/whale/`) is not covered by the AGPL; its origin and the vendor logos are described in the [desktop pet World's third-party notices](packages/cortico-world-desktop-pet/THIRD_PARTY_NOTICES.md). Third-party components shipped or downloaded at runtime: Electron (MIT), Cortico (MIT), sherpa-onnx (Apache-2.0), FunASR's SenseVoiceSmall model ([FunASR model license](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE), downloaded on use), OpenAI's Whisper small model (MIT, downloaded on use), koffi (MIT), jpeg-js (BSD-3-Clause), pnpm (MIT); model service logos come from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT; each logo belongs to its company and only identifies the service).
