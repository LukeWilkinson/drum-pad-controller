# Drum Pad Controller: project notes for Claude

Read SPEC.md (milestones) and DESIGN.md (tokens, layouts) first. The design canvas is linked in DESIGN.md. Earlier sessions read only Mix, PhoneLand and Tablet `.dc.html`.

## Stack
- Vite + TypeScript (vanilla, no framework) PWA via `vite-plugin-pwa`.
- Audio: raw Web Audio in `src/audio/engine.ts`. It uses `latencyHint: 'interactive'`, a fresh BufferSource per hit and `start(0)`. Tone.js arrives in M3 for the transport; it must share `engine.ctx` (`Tone.setContext`), and Tone's lookAhead must stay off for live pad hits.
- HTTPS dev server via `@vitejs/plugin-basic-ssl` so phones on the LAN get a secure context. Setting `HTTP=1` turns it off; the browser pane needs that because it rejects the self-signed certificate. Use the `dev-http` config in `.claude/launch.json`.
- Node lives at `C:\Program Files\nodejs`. `~/.bashrc` puts it on PATH for every Bash shell (added 2026-10-17), so there's no need to prefix `export PATH=...`.

## Layout of the code
- `src/audio/kit.ts`: the 16-pad kit definition (screen order: index 0 = top-left = pad 13). The sample list must match `scripts/fetch-samples.mjs`.
- `src/audio/engine.ts`: loading, unlock, play, choke groups (hats).
- `src/pads/input.ts`: Pointer Events per pad (multi-touch map) and the keyboard. Audio plays before visuals.
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
- **Next:** M2 Kits and presets (planning in plan mode first).
