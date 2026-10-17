# Drum Pad Controller: project notes for Claude

Read SPEC.md (milestones) and DESIGN.md (tokens, layouts) first. The design canvas is linked in DESIGN.md. Earlier sessions read only Mix, PhoneLand and Tablet `.dc.html`.

## Stack
- Vite + TypeScript (vanilla, no framework) PWA via `vite-plugin-pwa`.
- Audio: raw Web Audio in `src/audio/engine.ts`. It uses `latencyHint: 'interactive'`, a fresh BufferSource per hit and `start(0)` for live hits (`engine.play`). Sequenced hits and clicks are scheduled with `engine.playAt(pad, vel, when)` / `engine.click(when, accent)`; `engine.cancelScheduled()` drops future ones on stop.
- Clock: Tone.js 15 Transport in `src/audio/clock.ts`, running on `engine.ctx` via `setContext(new Context({ context: engine.ctx, lookAhead: 0.1 }))`. Only scheduled playback goes through Tone; live pad hits never do. `clock.ts` is the only code that changes `playing`, `bpm` and `click` in the store.
- HTTPS dev server via `@vitejs/plugin-basic-ssl` so phones on the LAN get a secure context. Setting `HTTP=1` turns it off; the browser pane needs that because it rejects the self-signed certificate. Use the `dev-http` config in `.claude/launch.json`.
- Node lives at `C:\Program Files\nodejs`. `~/.bashrc` is meant to put it on PATH, but on 2026-10-17 a Bash shell still had no `npm`, so prefix `export PATH="/c/Program Files/nodejs:$PATH" &&` when it is missing.

## Layout of the code
- `src/audio/kit.ts`: kit types (PadDef, PadParams, ActiveKit) and helpers. A kit has 64 pads: index = bank × 16 + screen index (screen index 0 = top-left = pad 13). `padLabel(i)` gives "B13".
- `src/audio/kits.json`: the built-in kits (Sonic Pi CC0). Each kit defines bank A. The top-level `banks` (B, C, D) are shared by every kit, and a kit can override one with its own `"banks": { "C": [...] }`. `allPads()` in `kits.ts` puts the 64 together. Both `src/audio/kits.ts` and `scripts/fetch-samples.mjs` read this file, so adding a kit or bank sound means editing this one file and then running `npm run fetch-samples`. CREDITS.md tables were generated from it.
- Bank state: `state.bank` (0–3), changed only by `kitControl.selectBank()`. Pad input gives screen indexes, and `main.ts` adds `bank × 16`. The engine loads the bank on screen first and the other banks in the background. Saved 16-pad user kits get B–D from their base kit when loaded.
- `src/audio/engine.ts`: per-kit sample loading (shared buffer cache), unlock, play with per-pad volume/pitch/pan/decay, choke groups (hats).
- `src/state.ts`: tiny store (`state`, `update`, `subscribe`). `src/kitControl.ts`: the only code that changes the active kit (select, edit, swap, save, delete); it also saves prefs. `src/store/db.ts`: IndexedDB wrapper.
- `src/pads/input.ts`: Pointer Events per pad (multi-touch map) and the keyboard. Audio plays before visuals.
- `src/ui/kits.ts`: Kits panel. `src/ui/seq.ts` + `src/styles/seq.css`: SEQ panel (step grid; it follows the playhead via `onFrame()` from `transport.ts`). `src/ui/views.ts`: PADS/KITS/SEQ switching. `src/ui/dialog.ts`: shared modal. `src/ui/format.ts`: pad-setting readouts.
- `src/seq/pattern.ts`: pattern types and pure helpers (96 ticks per beat, quantise, swing, `BEATS_PER_BAR`). It imports nothing, so `clock.ts` and `state.ts` can import it without a cycle.
- `src/seq/sequencer.ts`: the only code that changes loops, `recMode`, quantise and swing. It schedules each 16th, records hits (`recordHit`), handles REC/DUB/count-in, keeps one shared undo stack (50 steps) and queues loop switches to the next bar line.
- `src/seq/repeat.ts`: Note Repeat. Held pads retrigger at the quantise rate through its own 50 ms look-ahead timer and `engine.playAt()`, which returns a cancel function so a release cuts repeats not yet heard. Repeats are recorded at their exact scheduled time (`recordHit(pad, vel, time)`).
- `src/ui/transport.ts`: Play/Stop, REC, DUB, Undo, metronome, BPM −/+ (hold to repeat), tap tempo, the LCD status line (rAF while playing), and the shortcuts: Space, Shift+R (plain R is a pad), O, Ctrl+Z, M, T. `src/ui/loops.ts`: loop slots (tap to select or queue, hold to clear).
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
  - **Phone test passed (2026-10-17):** Luke reported the M2 HANDOFF.md checklist all good on the real phone.
  - Dev builds expose `window.__drum` (engine, state, KITS, every `kitControl` function) for console checks.
  - If the browser pane serves stale code after an edit, restart the `dev-http` server (Vite's watcher missed an edit once on Windows).
- **M3 Sequencer and looping: done (2026-10-17)** on branch `feat/m3-sequencer`. The plan and per-step notes are in HANDOFF.md.
  - **Phone test passed (2026-10-17):** Luke reported the M3 HANDOFF.md checklist all good on the real phone.
  - **Step 1, transport, tempo and metronome: done (2026-10-17).** Checked by script in the browser pane: click gaps of 0.5 s at 120 BPM and 0.4 s at 150 BPM, accent on beat 1, tap tempo, clamp to 40–240, metronome off, stop cancels future voices, scheduled hat choke. Layout checked at all 3 sizes. Commit dbcad22.
  - **Step 2, loops, recording, overdub, undo, quantise and loop slots: done (2026-10-17).** Checked by script: 16ths 0.125 s apart at 120 BPM, swing 66% → 0.165 / 0.085 s, count-in → REC, recorded hits land on the grid and aren't heard twice, DUB/undo steps, REC on a full loop clears it (undoable), queued switch at the bar line, hold-to-clear, Shift+R vs R. Layout checked at all 3 sizes. Commit 4adf35c.
  - **Step 3, SEQ tab: done (2026-10-17).** Checked by script: cell toggle + undo, step pages, PADS 9–16 rows, bar picker, quantise/swing/count-in controls, loop picker dialog, following the playhead (bar 2 step 5 shown with column 5 outlined). Layout checked at all 3 sizes. Commit 0f005a8.
  - **Step 4, pad banks B–D: done (2026-10-17).** 44 more Sonic Pi CC0 samples (106 in all, 5.0 MB, all precached). Checked by script: bank buttons, pad names and sounds per bank, keyboard follows the bank, LCD "PAD B13 · CHIME", Kits picker shows the bank, sequenced hits on bank C, a 16-pad saved kit upgrades to 64, SEQ PADS button steps A 1–8 … D 9–16. Commit 588ef6e.
  - **Step 5, Note Repeat: done (2026-10-17).** Checked by script: stopped = 0.125 s from the press at 1/16 120 BPM; playing = on the transport grid with swing (66% → off-beats +7.7 ticks); release cancels pending repeats; finger slide changes velocity (111 → 56); DUB records repeats on the 1/8 grid.
  - **Step 6, autosave: done (2026-10-17).** `sequencer.ts` saves the song (loops, current loop, bpm, click, quant, swing, countIn, noteRepeat) as the `song` pref, 500 ms after the last change and at once when the page is hidden. `seq.loadSong()` restores it at boot and drops bad values. Undo history isn't saved. Checked by script: reload round trip, save on hide, damaged save.
  - **Browser pane quirk:** when the pane isn't showing, `requestAnimationFrame` and `<dialog>` close events stall. Front the tab (`tabs_select` + a screenshot) before testing dialogs or the LCD.
- **Next:** merge `feat/m3-sequencer` into `main` (if not done yet), then M4 MIDI (SPEC.md milestone 4) in plan mode in a fresh chat, on a new branch `feat/m4-midi`.
