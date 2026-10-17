# Drum Pad Controller: project notes for Claude

Read SPEC.md (milestones) and DESIGN.md (tokens, layouts) first. The design canvas is linked in DESIGN.md. Earlier sessions read only Mix, PhoneLand and Tablet `.dc.html`.

## Stack
- Vite + TypeScript (vanilla, no framework) PWA via `vite-plugin-pwa`.
- Audio: raw Web Audio in `src/audio/engine.ts`. It uses `latencyHint: 'interactive'`, a fresh BufferSource per hit and `start(0)`. Tone.js arrives in M3 for the transport; it must share `engine.ctx` (`Tone.setContext`), and Tone's lookAhead must stay off for live pad hits.
- HTTPS dev server via `@vitejs/plugin-basic-ssl` so phones on the LAN get a secure context. Setting `HTTP=1` turns it off; the browser pane needs that because it rejects the self-signed certificate. Use the `dev-http` config in `.claude/launch.json`.
- Node lives at `C:\Program Files\nodejs`. `~/.bashrc` puts it on PATH for every Bash shell (added 2026-10-17), so there's no need to prefix `export PATH=...`.

## Layout of the code
- `src/audio/kit.ts`: kit types (PadDef, PadParams, ActiveKit) and helpers (screen order: index 0 = top-left = pad 13).
- `src/audio/kits.json`: the built-in kits (Sonic Pi CC0). Both `src/audio/kits.ts` and `scripts/fetch-samples.mjs` read it, so adding a kit means editing this one file and then running `npm run fetch-samples`. CREDITS.md tables were generated from it.
- `src/audio/engine.ts`: per-kit sample loading (shared buffer cache), unlock, play with per-pad volume/pitch/pan/decay, choke groups (hats).
- `src/state.ts`: tiny store (`state`, `update`, `subscribe`). `src/kitControl.ts`: the only code that changes the active kit (select, edit, swap, save, delete); it also saves prefs. `src/store/db.ts`: IndexedDB wrapper.
- `src/pads/input.ts`: Pointer Events per pad (multi-touch map) and the keyboard. Audio plays before visuals.
- `src/ui/kits.ts`: Kits panel. `src/ui/views.ts`: PADS/KITS switching. `src/ui/dialog.ts`: shared modal. `src/ui/format.ts`: pad-setting readouts.
- `src/ui/screen.ts`: builds the whole DOM once. `src/ui/pads.ts` handles the pad visuals (class + `--v` CSS var only).
- `src/styles/app.css`: one DOM, three layouts by media query (portrait default; landscape `max-height: 540px`; tablet `min-width: 1024px and min-height: 600px`).
- Placeholder controls carry `data-todo="M2"` etc. To find what's left: `grep -r data-todo src`.

## Conventions
- Colours come only from the tokens in `src/styles/tokens.css`.
- Touch targets must be at least 44px.
- Icons are inline stroke SVGs. No emoji.
- Samples: CC0 or public domain only, each recorded in CREDITS.md.

## Status
- **M1 Pads: done (2026-10-17).** Checked in the browser pane at 390×844, 844×390 and 1280×800. Velocity, 4-pointer multi-touch, keyboard and Full Level were checked by simulated events.
  - **Phone test passed (2026-10-17):** Luke reported the HANDOFF.md checklist all good on the real phone.
- **M2 Kits and presets: done (2026-10-17).** 4 kits, Kits panel, IndexedDB user kits, swap sample, and live tablet rail knobs. Checked in the browser pane by script at all 3 sizes.
  - **Not yet checked on a real phone:** how the kits, pitch, pan and decay sound; swap preview; save → reload; offline with all kits.
  - Dev builds expose `window.__drum` (engine, state, KITS, every `kitControl` function) for console checks.
  - If the browser pane serves stale code after an edit, restart the `dev-http` server (Vite's watcher missed an edit once on Windows).
- **Next:** Luke tests M2 on the phone (HANDOFF.md checklist), then M3 Sequencer and looping.
