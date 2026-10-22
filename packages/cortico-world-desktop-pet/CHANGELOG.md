## Unreleased

- An app can lend the bot's name as `botName()` in `desktopPetDefinition`'s assembly; it is read at each use, so the menu header, the chat page (a `bot` frame) and computer use's question follow a rename without a World restart. Without it the World keeps the name it was mounted with. `DesktopPetWorldOptions.botName` and `CuaOptions.botName` are functions now.
- `pet_walk_to` is now `pet_move_to`, with the same `to` and `run` and an optional `params`. A bot that names the old tool has to use the new name.
- Figure packs may declare targets of their own for it (`moves` in figure.json): the World checks the call's params against the pack and the body does the move (`move(args, id)`), reporting `arrived` or `interrupted` as walks do. The bot reads the targets in `{{pet.moves}}` and hears of added and removed ones on a figure switch. Packs without `moves`, Coo and the whale among them, behave as before.
- A pack that `needs` `windows` gets the visible top edges of the other windows on the pet's display in `host.bounds().ledges`, on Windows, macOS and Linux under X11 (the last two not yet tried on a machine); the window process reads none for other packs.
- The window host's `--pet-url` is `http://127.0.0.1:<port>/pet#key=<credential>`, the credential random. A host set by `CORTICO_DESKTOP_PET_HOST` passes the URL on and loads it unchanged, the part after `#` included. `petUrl`, `petState().url` and the panel's links carry no credential.
- The pet window's socket (`host=window`) and the OBS overlay source (`role=overlay-source`) put that credential in the `/socket` query as `key`; a socket without it or with another one is answered 403.
- Browser writes (every method but GET and HEAD) and the WebSocket are accepted only with the service's own HTTP origin, port included (`http://127.0.0.1:<port>` or `http://localhost:<port>`); any other Origin is answered 421. A client that sends no Origin is accepted.
- `POST /api/figures/import/install` answers 409 with `{ conflicts: [id, …] }` when a chosen pack's id is installed or `figures/<id>/` exists, and then changes no file and keeps the staged import. The same request with the same `token` and `replace: [id, …]` naming every conflicting id replaces them. An install without conflicts takes no new field. Once an install passes these checks its token is spent.

## 0.2.0

- Needs Cortico 0.2.0 (world contract 6): the panels are declared by `webUi()`, and the panel bundle is `dist/webui.js` and `dist/webui.css`.
- Self-description: `describe` on the definition lists every tool, computer use included, and every event; written out to `describe.json`.
