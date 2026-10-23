# AGENTS.md

Rules for working in this repository. Coopanion is a desktop app assembled from
[Cortico](vendor/cortico); [vendor/cortico/PHILOSOPHY.md](vendor/cortico/PHILOSOPHY.md) says what
Cortico is, and [vendor/cortico/AGENTS.md](vendor/cortico/AGENTS.md) governs every change to
Cortico itself. This file says how work in Coopanion is done. When a request conflicts with
either, say so before building.

## 1. Design stance

Read vendor/cortico/PHILOSOPHY.md before changing how Coo is prompted, given tools, given memory,
or handed context. Two of its rules settle most design questions:

- **Design toward the frontier.** A mechanism that exists only to work around a current model's
  limit is a fallback, and is written, named and documented as one.
- **Minimal priors.** Prefer a semantic instruction the agent applies with judgment over
  hard-coded control flow. Reserve control flow for what is genuinely mechanical and for cases
  where a wrong judgment is unrecoverable.

## 2. Names

| Unit | Directory | Commit scope |
|---|---|---|
| Electron main process: tray, settings window, Core child process, updater | `app/` | `app` |
| Core child process entry: assembly, seed files, the `coopanion` World, telemetry | `core/` | `core` |
| Settings window: Coopanion's own front end over the WebUI HTTP API | `console/` | `console` |
| Desktop pet World, computer use included (`src/cua/`) | `packages/cortico-world-desktop-pet/` | `desktop-pet` |
| Model provider | `packages/cortico-provider-coo/` | `provider-coo` |
| Build, staging and packing | `scripts/`, `installer/`, `electron-builder.yml` | `scripts`, `installer` |
| Telemetry service | `telemetry-server/` | `telemetry-server` |
| Cortico | `vendor/cortico` (submodule) | `vendor` for a submodule bump |

The World and provider packages are Cortico extensions: their tools, events, config keys, types
and verbs follow vendor/cortico/AGENTS.md section 2. Chinese UI text keeps Core, Persona, Memory
and World as proper nouns, calls an extension 扩展, and calls a config value 配置. 参数 is reserved
for a tool call's arguments. The pet is Coo in UI text; code comments write "bot" when a referent
is unavoidable.

## 3. Boundaries

1. **Cortico changes go to Cortico.** `vendor/cortico` is never patched in place. A change the
   settings window or a package needs from Cortico is a Cortico pull request; the submodule then
   moves to a Cortico commit on its main branch.
2. **The settings window uses Core through the WebUI HTTP API only.** It depends on nothing of
   Cortico's own WebUI (its pages, DOM, class names or `src/web/client/` modules) and takes types
   only from Cortico (`tests/console-imports.test.ts`). The normal mode's pages use only the public
   routes listed in Cortico's `docs/webui.md` and the panel contract; when they need more, that is a
   Cortico issue. `console/advanced/` is the one exception: its pages may call Cortico's internal
   routes. `tests/console-api.test.ts` locks the shape of every route the window calls, the internal
   ones apart, so a submodule bump that changes one fails the tests.
3. **Vendor quirks stay in provider-coo.** How one model service deviates from its protocol is
   handled in `packages/cortico-provider-coo`, keyed by its base URL, and never in Cortico.
4. **Text for the model and text for people are separate.** What Coo reads lives in each
   package's `model-text.ts`, release notes under `docs/releases/` and the seed prompts; what
   people read lives in the `strings*.ts` and `i18n/` files. Text only Coo reads (tool
   descriptions, event labels, the Persona's own lines) is written in English alone. Text
   people also read exists in all eleven languages and changes in all of them in the same
   commit: UI text, and the personas in `core/seed/persona/`. Environment prompts, events and
   release notes exist in Chinese and English.
5. **Third-party material is never committed**: character art, reference images, audio, model
   weights. A precedent is not a permission.

## 4. Writing

These rules apply to UI copy, comments, documents and commit messages alike, and to what a
session reports to the operator. A sentence stays only if it carries a fact the reader needs and
cannot get from the code or the screen.

- Conclusion first, mechanism second.
- State the invariant, not the runtime story and not the negotiation that produced it. History
  belongs in git.
- No manufactured contrast ("A, not B" where nobody proposed B). No paraphrase of the request
  that produced the code. No issue, decision or section numbers.
- A field comment is one or two sentences on one topic. The contract goes on the interface, the
  architecture in the module header or the owning document.
- No defensive code for states the types or the caller rule out; validate at real boundaries
  only.
- No test that asserts a mock was called with a constant. Test behavior against real or
  realistically faked components; when a call count is the behavior, say so in the test name.

### AI slop checklist

Review UI copy, prompts, documentation, code comments, commit messages and reports to the
operator sentence by sentence.
Prefer deleting redundant prose. Preserve factual content in documentation; trace vague claims to
their implementation and state the actual behavior. Keep comments only when they explain facts
that cannot be inferred from the code.

- [ ] **Obvious information**: Remove common knowledge and instructions evident from the UI.
- [ ] **UI narration**: Remove descriptions of cards, groups, buttons and layout. Show state in
  status labels.
- [ ] **Long narratives**: Reduce "this happens here, so you can..." to the necessary behavior,
  condition or result.
- [ ] **Manufactured contrast**: Remove "not A but B", rhetorical turns introduced with dashes and
  emphasis that serve no actual distinction.
- [ ] **Jargon and metaphors**: Use ordinary words for concrete objects and actions. Define necessary
  terms before using them and follow the project's naming conventions.
- [ ] **Vague actions**: State what an operation changes and when it takes effect. Replace phrases
  such as "touches the disk" or "finishes up" with the actual behavior.
- [ ] **Hype and reassurance**: Remove praise for the implementation, subjective modifiers such as
  "quietly" or "reliably", and unsupported assurances such as "rest assured".
- [ ] **Incident history**: Remove accounts of incidents, fixes, defenses of old designs and
  precautionary lectures. Express constraints that still apply as current rules.
- [ ] **Layer boundaries**: Keep platform details in their World. Shared entry points do not describe
  the internal behavior of a particular World, Persona or bot.
- [ ] **Misplaced information**: Put information needed for operation in the UI, contracts at
  interfaces, architecture in modules or their documentation, and history in git.
- [ ] **Repeated explanations**: State each fact only where needed. Check duplicate copy and other
  language versions during cleanup.
- [ ] **Single-character verbs** (Chinese UI copy): Write the two-character verb: 询问 not 问,
  查看 not 看, 修改 not 改, 绘制 not 画, 选择 not 选, 填写 not 填, 停止 not 停, 更换 not 换.
- [ ] **Accuracy after editing**: Verify retained behavior, conditions, units and boundaries.
  Necessary consequences, error causes and recovery steps must remain accurate and specific.

Coo's own lines (the guide, update and failure bubbles in `core/i18n/`) speak in Coo's voice and
keep it; the checklist still applies to what they say.

## 5. Tests

- Assert the contract, not incidental values: compare with the exported default, not a literal.
- Real components: real ports, a real event store, real pack folders. Only the LLM is scripted.
- Fixtures and documentation examples name no real vendor or model. The shipped vendor table in
  provider-coo and the extension package names are the exception: they name something real in
  order to work at all.
- No network in tests. Real-service checks run by hand.

## 6. Commands

- Before every commit: `pnpm run test`, `pnpm run test:worlds`, `pnpm run typecheck`,
  `pnpm run typecheck:web` and `pnpm run typecheck:worlds`, the same checks CI runs.
- `pnpm run build:cortico` after changing `console/` or the submodule; reopen the settings window
  (`build/console`) or restart the app (`build/cortico`) afterwards.
- Never verify against the operator's installed app or its data, and leave it running. Use tests,
  a script under `scratch/`, or `pnpm run dev` with `CORTICO_COMPANION_DATA` pointing at an empty
  directory.
- A settings-window change is shown with `pnpm run console:test`: the real page from
  `build/console` with this checkout's Core behind it, on ports of its own. Mock pages of the
  settings window are not used.

## 7. Scratch

Disposable work (probes, one-off scripts, dumps, experiments, preview servers) goes under
`scratch/` (gitignored), never into `scripts/`, `core/`, `console/`, `packages/` or another
tracked tree. Promote it deliberately when it becomes a tool.

## 8. Documentation

- Every page under `docs/` and every README of a code unit names, in its first line, the file
  or interface it shadows: its owner. The commit that changes the owner changes the page.
- User-visible behavior is described in README.md and README_zh.md; a change to it updates both.
- `docs/releases/` is content: Coo reads it after an update, so it follows section 4.
- Text without a code owner (plans, migration records, decision history) lives in `scratch/`.

## 9. Git

- Commit at every milestone: a change stated in one sentence that leaves the checks in section 6
  green. Smaller than a feature, larger than one file; an additive step and its migration are two
  commits.
- Stage by explicit path. Other sessions may have uncommitted work in this tree, so
  `git add -A`, `git add .` and `git commit -a` are never used.
- Committing is not pushing. Push, open pull requests or rewrite published history only when
  asked.
- `main` takes changes only through pull requests, merged by squash. The pull request title is
  the squash commit's subject and follows the format below.

### Message format

Conventional Commits, `<type>(<scope>): <description>`, type and scope always lowercase ASCII.
Commits made before this rule do not follow it and are not rewritten.

| Type | Covers |
|---|---|
| `feat` | a capability the user, Coo or a pack author did not have |
| `fix` | wrong behavior; the body names the root cause and what proves it gone |
| `refactor` | same behavior, different shape: renames, extractions, deletions |
| `perf` | measured; the body carries the before and the after |
| `docs` | `docs/`, a README, AGENTS.md, or comments alone |
| `test` | tests alone |
| `build` | package.json, the lockfile, tsconfig, bundling, a submodule bump |
| `ci` | `.github/` |
| `release` | a version bump with its release notes |
| `chore` | what the list above misses and a reader needs nothing from; rare |
| `revert` | subject repeats the reverted subject, body is `This reverts commit <sha>.` |

The scope is the unit from the table in section 2. Omit the scope only for a repository-wide
change; a commit that wants two scopes is two commits.

The description says what changed and why, under 72 characters for the whole subject line, no
trailing period. Its language is free; the type and the scope stay English. Body bullets carry
what the diff does not show: the rejected alternative, the invariant relied on, what the tests
now cover.

A change to an on-disk layout, to a config key or to the meaning of already written content
takes a `!` before the colon and a `BREAKING CHANGE:` footer naming the migration that ships
with it.
