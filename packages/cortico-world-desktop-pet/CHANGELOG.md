## Unreleased

- `pet_walk_to` is now `pet_move_to`, with the same `to` and `run` and an optional `params`. A bot that names the old tool has to use the new name.
- Figure packs may declare targets of their own for it (`moves` in figure.json): the World checks the call's params against the pack and the body does the move (`move(args, id)`), reporting `arrived` or `interrupted` as walks do. The bot reads the targets in `{{pet.moves}}` and hears of added and removed ones on a figure switch. Packs without `moves`, Coo and the whale among them, behave as before.
- A pack that `needs` `windows` gets the visible top edges of the other windows on the pet's display in `host.bounds().ledges`, on Windows only; the window process reads none for other packs.

## 0.2.0

- Needs Cortico 0.2.0 (world contract 6): the panels are declared by `webUi()`, and the panel bundle is `dist/webui.js` and `dist/webui.css`.
- Self-description: `describe` on the definition lists every tool, computer use included, and every event; written out to `describe.json`.
