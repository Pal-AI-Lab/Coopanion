<!-- Owner: console/advanced/ -->

# console/advanced

The advanced mode's pages of the settings window: 模型供应商, 扩展, 控制台 (`features/trace.ts` over
`features/live`), Core, the World overview, the whole system prompt (`features/prompts/`, with
「清空对话并重开」), and the page host that mounts the World, Persona and Memory pages of
`/api/webui/manifest` by the panel contract (`console-pages/`).

The files were copied from Cortico's `src/web/client/` (and the runtime helpers under `lib/` from its
`src/`) at vendor/cortico `c5bb075` and are Coopanion's own since: they do not follow Cortico, and
imports of Cortico's WebUI modules were rewired to `console/base/`. The extension page (`features/extensions/`) was
copied again at vendor/cortico `54004f86`, with the icons it uses in `console/base/ui/icons.ts` and the extension rules at
the end of `console/styles.css`. From Cortico they take types only (`tests/console-imports.test.ts`).

These pages call routes of the WebUI HTTP API that Cortico does not make public. That is an exception
for this directory only. 系统提示词 (`features/prompts/`) is listed in the
normal mode too and calls public routes only; `tests/console-api.test.ts` locks the shape of each such route, so a submodule
bump that changes one fails the tests.

Manifest and context-record types come from Cortico through type-only imports. The browser helpers for page ids, asset paths and panel streams live in `console/base/protocol.ts`; text uses the window language from `console/base/language.ts`.
