# Drum Pad / MIDI Controller App: Spec

## Goal
A free, cross-platform drum pad and MIDI controller that runs on PC, phones and tablets from one codebase.

## Approach
- Progressive Web App (installable from the browser). No app stores needed.
- Plain TypeScript + Vite. UI framework optional (Svelte or vanilla).
- Audio: Tone.js on top of Web Audio (samplers, synths, effects, transport clock, looping).
- MIDI out: Web MIDI API (Chrome/Edge on PC and Android).
- Input: Pointer Events for true multi-touch (many pads at once), keyboard and physical MIDI-in as extras.
- Save presets, kits and loops in IndexedDB / localStorage.
- Use free, licence-checked samples only (CC0 / public domain / GPL kits such as Hydrogen's, with attribution noted in CREDITS.md).

## Target platforms
- PC (Chrome/Edge, mouse and keyboard), Android phones (portrait and landscape), Android tablets (landscape).
- No Apple devices for now.

## Milestones
1. **Pads:** 4x4 pad grid, multi-touch, low-latency sample playback, velocity (touch-area or fixed levels), responsive layout for phone portrait/landscape and tablet.
2. **Kits and presets:** several drum kits, kit switching, per-pad volume/pitch/pan, save/load presets.
3. **Sequencer and looping:** tempo, metronome, record pad hits into a loop, overdub, undo, quantise, step sequencer view.
4. **MIDI:** Web MIDI output (pad notes, channel select), MIDI input mapping, MIDI learn.
5. **Instruments:** keyboard/melodic mode with synth presets (Tone.js synths), sampled instruments, scale snap (snap notes to a chosen key and scale), switchable on/off.
6. **Effects and settings:** reverb, delay, filter, master volume, latency calibration, theme.
7. **Later / stretch:** vocal pitch correction from the mic (on/off, key, scale, strength, speed), audio export (WAV), sample import, sharing presets. Added after Luke's PC test (2026-10-23): SAVE FILE beside SHARE, an AUDIO tab and tablet REC OUT / VOX chips, REC MIC (from M8).
8. **Recording and custom layouts** (Luke's notes, 2026-10-22):
   - **Record own sounds:** record from the mic on the fly and assign the take to any pad (trim, save with the kit). *Built early, in M7 (2026-10-23): REC MIC.* A waveform trim editor is still open.
   - **Full customisation:** move pads and controls anywhere; free-floating placement or snap to a grid whose rows × columns the user sets. Bigger screens (tablet, monitor) can show many more pads; phones can pack in more, smaller pads.
   - **Preset layouts:** a few good built-in layouts; add, remove and save your own.
   - **Shareable layouts:** save a layout as a seed (short code/string) that others can load.
   - **Design first:** the layout editor and preset layouts start in Claude Design. When M8 reaches that part, Claude prompts Luke to move to a design chat (or moves there) before building.

## Decisions (were open questions)
- **Auto-tune:** both, as two separate on/off options. Scale snap is in milestone 5; vocal pitch correction from the mic is a stretch goal (milestone 7). The settings screen already has a card for each.
- **Apple / iOS MIDI:** out of scope. No Apple devices for now, so no native wrapper needed.
- **Look and feel:** decided. A hardware-style "Chassis" base mixed with colour-coded pads, a big record button, loop slots and tall velocity pads. See DESIGN.md.

## Workflow
1. Claude Design: done. Canvas: https://claude.ai/artifact/79zk33hSLfaD9kSCcWdtTz (handoff notes in DESIGN.md).
2. Claude Code: build milestone 1 first, test on a real phone, then continue in order.
3. M8 layout work: Claude Design first (see milestone 8).
