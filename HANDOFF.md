# Handoff

## Where things stand (2026-10-17)
Milestone 1 (Pads) and Milestone 2 (Kits and presets) passed Luke's phone test (2026-10-17). Milestone 3 (Sequencer and looping) passed Luke's phone test (2026-10-17) and was merged into `main` (125ea1d). Milestone 4 (MIDI) is planned (see "M4" at the end) and being built on `feat/m4-midi`.

### M1 (Pads)
- 4×4 grid in all three layouts, multi-touch, position velocity, keyboard and Full Level.
- PWA (manifest, icons, offline service worker) and an HTTPS dev server on the LAN.

### M2 (Kits and presets)
- **4 built-in kits:** Studio Acoustic, Neon Electronic, Dusty Hip-hop and Lo-fi Tape. All are Sonic Pi CC0 samples (62 files, 2.7 MB), defined in `src/audio/kits.json`.
- **KITS tab** (or tap the LCD kit name):
  - category chips
  - kit list with LOADED / EDITED / USER tags
  - pad picker (auditions the pad)
  - Volume, Pitch, Pan and Decay sliders (the pad plays when a slider is let go)
  - SWAP SAMPLE: any of the 62 samples, with a preview button
  - SAVE, LOAD PRESET and delete
- **Saved kits** are stored in IndexedDB. The last kit and the master volume are restored on reload. Switching away from an edited kit asks first.
- **Tablet right rail:** Volume, Pitch, Pan and Decay knobs are live. Drag up or down, use the arrow keys (Shift for bigger steps), or double-tap to reset.

## Luke's phone test checklist for M2 (passed 2026-10-17)
1. Run `npm run dev` and open the **Network** address on the phone, as before.
2. Tap a pad to start audio, then open **KITS**. Check:
   - [ ] Each of the 4 kits loads and plays. Do the sample choices sound right? (Claude can't hear the browser pane.)
   - [ ] Pitch, pan and decay sound right. A short decay should have no click at the end.
   - [ ] Switching kits has no delay or glitch.
   - [ ] SWAP SAMPLE: the preview plays, and the picked sample replaces the pad.
   - [ ] SAVE a kit, reload the page, and check the kit comes back loaded. Then delete it.
   - [ ] The KITS panel scrolls in landscape (the pad settings are below the fold).
3. `npm run lan` → install → airplane mode: all 4 kits still play.

## Known gaps / choices
- The SEQ grid cells are 40px tall (the design has 36px) and about 33px wide on a 390px phone, so they are under the 44px rule. Eight steps across leave no more room.
- The pad picker cells on the Kits panel are 40px, slightly under the 44px touch-target rule, so they fit beside the sliders on a 390px-wide phone, as in the design. Hitting a real pad also selects it.
- On phone portrait, long kit names are cut short in the LCD (e.g. "KIT 01 · STUDIO ACOUSTI…").
- Shaker, Rim, Clap and Vox FX in Studio Acoustic still use the closest Sonic Pi sample (there is no real clap or vocal). They can be changed with SWAP SAMPLE.
- Styled but not working yet (`data-todo`; `grep -r data-todo src` lists them): KEYS/MIX/SETUP tabs, and the FX send knobs (M6).
- The desktop artboard extras (step strip, shortcut legend) are not built.

## M3 (Sequencer and looping): built on `feat/m3-sequencer`, phone test passed (2026-10-17)

### Decisions from Luke (2026-10-17)
- **Loops are patterns.** Loop slots 1–4 on the pad screen are the same loops as in the SEQ tab (called LOOP 1–4 everywhere). One plays at a time; tapping another slot while playing switches at the next bar line.
- **Grid rows:** 8 rows (the design's KICK, SNR, CLAP, CHH, OHH, TOM, PERC, FX), and a PADS button pages through the other pads and banks.
- **Clock:** Tone.js Transport on `engine.ctx`. **Undo:** every change, one shared stack of 50 steps across all loops. **Saving:** the song autosaves to IndexedDB (step 6).
- **Record key:** Shift+R, because plain R is a pad key.
- **Extras in M3:** Note Repeat, and pad banks B–D filled from Sonic Pi CC0 samples.
- **Claude's choices:** quantise is applied when a hit is recorded (OFF keeps the raw timing). Swing is applied at playback to the off-beat 16ths. Events are `{ tick, pad 0–63, vel }` at 96 ticks per beat. REC on a full slot replaces it; DUB adds to it. Count-in is one bar.

### Steps (Luke checks in after each; one commit per step)
Commits: step 1 dbcad22, step 2 4adf35c, step 3 0f005a8, step 4 588ef6e, step 5 5562f80, step 6 is the final M3 commit.
1. **Transport, tempo and metronome: done (2026-10-17)**
   - Play/Stop (Space), metronome on/off (M, accent on beat 1)
   - BPM −/+ (hold to repeat, 40–240), tap tempo (tap the BPM number or press T)
   - LCD bar counter, adjusted for output latency
2. **Loops, recording, overdub, undo, quantise and loop slots: done (2026-10-17)**
   - REC (Shift+R; plain R still plays its pad) records over the current loop. A one-bar count-in plays first when starting from stop. DUB (O) adds to the loop. Pressing REC or DUB again stops recording, and switching between them keeps the hits.
   - Undo (button or Ctrl+Z) covers every take, clear and length change, across all loops (50 steps).
   - Loop slots: tap to select (stopped) or queue (playing, switches at the next bar line); hold a full slot to clear it. The current slot has an amber border, red while recording, and a progress bar.
   - The LCD shows the loop bar, Q, SWING and READY / PLAY / COUNT / REC / DUB.
   - New loops are 2 bars; quantise defaults to 1/16 and swing to 50%. Their controls (and count-in on/off) arrive with the SEQ tab in step 3.
   - Loops are called **LOOP 1–4** everywhere, not "PATTERN A–D" as in the design, so they don't get mixed up with pad banks A–D.
   - Loops autosave from step 6 on.
3. **SEQ tab: done (2026-10-17)**
   - Built from `Seq.dc.html`: loop picker (LOOP n ▾ opens a list; while playing, the choice is queued), loop length, REC / OVERDUB / COUNT-IN / CLICK, QNT, and SWING (drag up or down, arrow keys, double-tap resets to 50%).
   - STEPS 1–8 / 9–16, plus a BAR n/N button when the loop is longer than 1 bar. While playing, the grid follows the playhead until a page or bar is picked by hand.
   - The PADS 9–16 button in the header shows the other 8 pads. Tapping a row name plays that pad.
   - Tapping a cell adds a hit at velocity 100 (the pad plays if stopped) or removes the hits in that 16th. Each tap is one undo step. Cells are tinted by velocity, beat-start cells are lighter, and the playhead column is outlined.
   - Row labels are the kit's full pad names on up to 2 lines, since names differ per kit.
4. **Pad banks B–D: done (2026-10-17)**
   - One shared set for all kits: B = extra drums, C = tabla and electro percussion, D = FX and bass hits. Defined in `kits.json` `banks`; a kit can override any bank.
   - 44 new Sonic Pi CC0 samples were fetched (106 in all, 5.0 MB, all cached for offline). CREDITS.md has the new tables.
   - Bank buttons A–D work. The keyboard keys play the bank on screen, and the LCD shows e.g. "PAD B13 · CHIME". The Kits pad picker and the rail edit pads in the current bank. SWAP SAMPLE lists the bank samples too.
   - In the SEQ tab, the PADS button steps through A 1–8, A 9–16, B 1–8 … D 9–16 (phone portrait has no bank buttons on that screen).
   - The bank on screen loads first, so a kit is playable quickly; the other banks load in the background.
   - Kits saved before banks existed (16 pads) get banks B–D from their base kit when loaded. Saving writes all 64 pads.
5. **Note Repeat: done (2026-10-17)**
   - Toggle NOTE RPT on the bank row. While it's on, a held pad (touch, mouse or key) retriggers at the quantise rate (1/16 when quantise is OFF).
   - Playing: repeats lock to the beat grid, with swing. Stopped: the grid starts at the press. A grid point closer to the press than a third of the rate is skipped, so there is no flam.
   - Sliding the finger up or down the pad changes the velocity of later repeats, and the pad fill follows the finger. Letting go cancels any repeat not yet heard.
   - With REC or DUB on, every repeat is recorded at its exact time.
6. **Autosave: done (2026-10-17)**
   - The song autosaves to IndexedDB as one `song` pref: loops 1–4, the current loop, BPM, click, quantise, swing, count-in and Note Repeat. A save happens half a second after the last change, and straight away when the app is hidden (phone home button, app switch).
   - It is restored at boot, before the kit finishes loading. Saved values that are missing or out of range keep their defaults, so an old or damaged save can't break the app.
   - Undo history is not saved: after a reload there is nothing to undo.
   - Checked by script: a full round trip (loop 4, 8 bars, OFF, swing 55, 143.2 BPM on the Tone transport and the LCD, click off, NOTE RPT on), the save on hide, and a damaged save (bad bars, pad 99, junk events, bad BPM / quantise / loop index).

## Luke's phone test checklist for M3 (passed 2026-10-17)
1. Run `npm run dev` and open the **Network** address on the phone, as before. Tap a pad to start audio.
2. Transport and tempo:
   - [ ] Play / Stop. The metronome is steady and beat 1 is accented. Turn it off and on.
   - [ ] BPM − / + (hold to repeat) and tap tempo on the BPM number. The loop and click follow straight away.
3. Recording (Claude can't hear the browser pane, so timing by ear is the main check):
   - [ ] REC from stop: one bar of count-in, then recording. Played hits land in time on the next pass and aren't heard twice.
   - [ ] DUB adds hits without clearing. Undo removes the last take.
   - [ ] Try quantise 1/8, 1/16 and OFF, and swing at about 60%. Does the groove feel right?
4. Loops:
   - [ ] Record something in LOOP 1 and LOOP 2. While playing, tap the other slot: it switches on the next bar line.
   - [ ] Hold a full slot to clear it (undo brings it back).
5. SEQ tab:
   - [ ] Tap cells to add and remove hits. The grid follows the playhead. PADS steps through the banks.
   - [ ] Are the 40px grid cells easy enough to hit on the phone (see Known gaps)?
6. Banks and Note Repeat:
   - [ ] Banks B–D play their own sounds, and a loop can use pads from several banks.
   - [ ] NOTE RPT: holding a pad repeats in time while playing. Sliding the finger changes the loudness. Letting go stops at once.
7. Autosave:
   - [ ] Make a loop, change BPM and swing, then close the tab (or swipe the app away) and reopen. Everything comes back.
8. `npm run lan` → install → airplane mode: the sequencer and the new bank sounds still work.

## M4 (MIDI): planned 2026-10-17, building on `feat/m4-midi`

### Decisions from Luke (2026-10-17)
- **Note map:** chromatic from 36. Note = 36 + bank × 16 + (padNumber − 1): A1–A16 = 36–51, B = 52–67, C = 68–83, D = 84–99.
- **MIDI out:** everything: live hits, Note Repeat hits and sequenced loop hits. A "Play sounds in app" switch mutes the app's own audio.
- **MIDI Learn:** pads, buttons and knobs.
- **Input:** read on all channels. The Channel setting is for output only (default 10 · Drums).
- **Clock:** "Send MIDI clock" is in M4, as the last step. Off by default.
- **SETUP tab:** the MIDI card only. Latency, Auto-tune and Theme cards come in their own milestones.
- **Test gear:** none yet. The PC test setup will be loopMIDI (free virtual MIDI cable) + a MIDI monitor (MIDI-OX or similar) in Chrome/Edge.

### Claude's choices (Luke can override)
- The app asks for MIDI only when Luke taps ENABLE MIDI in SETUP, then reconnects at boot. Devices are remembered by name; plugging in or unplugging is picked up live.
- No MIDI thru: hits from MIDI input play and record but are not sent back out (so a loopMIDI port used both ways can't feed back). Loops recorded from MIDI input do go out on playback.
- Live hits send note-off on release; scheduled hits 60 ms later (or just before the next hit on that note). Stop, output change and disable send All Notes Off (CC 123).
- Scheduled hits get a Web MIDI timestamp from `engine.ctx.getOutputTimestamp()`, so MIDI lines up with the app's audio as heard. Each send waits on a timer until ~20 ms before its time, so the cancel `playAt()` returns still works.
- Learned pad mappings point at an exact pad and override the chromatic map for that note. CCs drive knobs; notes or CCs (≥ 64, rising) drive buttons.
- Firefox etc. without Web MIDI: the card says to use Chrome or Edge.
- Saved as one `midi` pref: enabled, output name, input name, channel, local sound, clock, mappings.

### Steps (Luke checks in after each; one commit per step)
Suggested model: Sonnet, medium for steps 1, 2, 3, 5; Opus, medium for step 4.
1. **MIDI core and the SETUP tab: done (2026-10-18).** `src/midi/midi.ts` (access, devices, hot-plug, `midi` pref, store field), `src/midi/fake.ts` (dev-only fake MIDI via `?fakemidi`, logs sends, injects input), `'setup'` view, `src/ui/setup.ts` + `src/styles/setup.css` (MIDI card from Settings.dc.html), SETUP tab, tablet gear and MIDI chip.
2. **MIDI output: done (2026-10-18).** `src/midi/out.ts`; an `onHit` hook in `engine.ts` so `play()`/`playAt()` send MIDI (covers live, repeat and sequencer); `echo` flag; `localSound` flag; note-off on release; All Notes Off on stop.
3. **MIDI input → pads: done (2026-10-18).** move pad hit/release out of `main.ts` into `src/pads/hits.ts` (shared by touch, keys and MIDI); `src/midi/in.ts` (chromatic 36–99 or learned map, note-off releases, all channels, activity blink).
4. **MIDI Learn: done (2026-10-18).** `src/midi/targets.ts` (pads; Play, REC, DUB, Undo, metronome, tap, banks, Note Repeat, Full Level, loop slots; BPM, swing, master, selected pad volume/pitch/pan/decay), `data-learn` attributes, learn mode across tabs with a capture-phase listener, mappings list with ×. Full Level moves into the store.
5. **Send MIDI clock: done (2026-10-18).** `src/midi/clock.ts`: Song Position 0 + Start at transport start (after count-in too), 24 clocks per beat via Tone `scheduleRepeat`, Stop on stop.

### Checks
- Claude, per step, by script in the browser pane with `?fakemidi` (no real MIDI there).
- Luke, at the end: loopMIDI + MIDI monitor in Chrome/Edge on the PC (notes, channel, clock, learn; a DAW if available), and on the phone the SETUP layout, permission prompt and "no devices" state.

Step 1 notes (2026-10-18):
- SETUP shows an ENABLE switch (MIDI), Output / Input / Channel selects, "Play sounds in app" and the (not yet working) clock switch and MIDI LEARN button. Off → the controls dim and are disabled. Unsupported / denied / waiting show a message.
- With no saved choice, the first output and first input that appear are picked once. A saved device that is unplugged stays listed as "(not connected)" and reconnects when plugged back in.
- Settings save as the `midi` pref and MIDI reconnects at boot if it was on. A refused permission turns it off again.
- `?fakemidi` (dev only, not in the production build): fake devices "Fake MIDI Out", "Fake MIDI Out 2", "Fake MIDI In". `__fakeMidi.log` lists sent messages, `.inject(name, bytes)`, `.plug(name)`, `.unplug(name)`, `.clearLog()`.
- `midi.outputPort()` and `midi.onMidiMessage(fn)` are ready for steps 2 and 3.

Step 2 notes (2026-10-18):
- `src/midi/notes.ts`: `noteOfPad()` / `padOfNote()` (36–99; step 3 uses `padOfNote`). `src/midi/out.ts` hooks into the engine (`engine.setHitHook`), so every `play()` / `playAt()` goes out, including auditions and step taps (those send a 60 ms note). A pad held on the pad screen calls `midiOut.hold()` and ends with `midiOut.release()`.
- `engine.play(…, echo)` / `playAt(…, echo)`: `echo = false` keeps a hit from going out (for MIDI-input hits in step 3). `engine.localSound = false` mutes the app's sound; main.ts only mutes while an output device is connected, so the app can't go silent by accident.
- Scheduled notes are sent ~25 ms ahead with a timestamp from `getOutputTimestamp()`; the note-off follows 60 ms later, or goes just before a retrigger of the same note. Transport stop, output change, channel change and MIDI off send note-offs and CC 123 on the old output/channel.

Step 3 notes (2026-10-18):
- `src/pads/hits.ts` is the one pad-hit path (`hit`, `release`, `move`, `setLast`, `padTitle`): touch and keys call it from `main.ts`, MIDI input from `src/midi/in.ts`. `fromMidi` hits skip MIDI output, including their Note Repeat repeats (`repeat.press(pad, vel, echo)`).
- Notes 36–99 play pads A1–D16 on every channel; note-on vel 0 counts as note-off. Other messages (CC etc.) are ignored until step 4. The pad is shown hit only if its bank is on screen; the LCD and selected pad follow. Held pads are released when the input changes or MIDI goes off. The tablet MIDI chip dot blinks amber on any incoming message.
- Full Level applies to touch only; MIDI velocity is used as sent.

Step 4 notes (2026-10-18):
- Luke's choices: learn mode stays on until DONE; an amber bar with DONE shows on every screen; knob CCs are absolute (0–127 → the full range).
- `src/midi/targets.ts`: target ids saved in the pref (`pad:0–63`, `play`, `rec`, `dub`, `undo`, `metro`, `tap`, `bpm-down`, `bpm-up`, `bank:0–3`, `loop:0–3`, `note-repeat`, `full-level`, `swing`, `master`, `param:volumeDb|pitch|pan|decay`). Each acts through the code that owns the control. Notes press; a CC sets a knob, or presses a button when it rises past 64. `tap` (the BPM readout) is tap tempo from a note and BPM 40–240 from a CC. A CC on a pad hits it (value = velocity) and releases below 64. Param knobs act on the selected pad.
- `data-learn` is on: transport keys, BPM −/readout/+, loop slots, banks, Note Repeat, Full Level, tablet rail knobs and master, SEQ REC/OVERDUB/CLICK/swing, Kits panel sliders, and the pads (`data-learn="pad"` + `data-screen`; a tapped pad is learned as that exact pad of the bank on screen).
- `src/midi/learn.ts` (only code that changes `state.learn`): a window capture-phase listener stops taps while learning, so the control doesn't act; tapping a `data-learn` control arms it (solid outline; others dashed). Tabs, the learn bar, SETUP, the tablet header and dialogs still work. The next note-on or CC from the input (`in.ts` calls `capture()`) becomes a mapping; the same message learned again replaces the old one. MIDI going off ends learn mode.
- Mappings are `state.midi.mappings` (saved in the `midi` pref; bad entries dropped on load). `in.ts` checks a mapping first; unmapped notes still use the chromatic map, unmapped CCs are ignored. SETUP lists them ("CC 21 → SWING") with a × each.
- The learn bar sits at the bottom of the screen and the layout shrinks to make room (`--learn-h` in app.css), so it covers nothing.
- Full Level is now `state.fullLevel` (`hits.toggleFullLevel()`), so MIDI can toggle it. Still not saved.
- Checked by script with `?fakemidi`: learning pads, buttons and knobs across PADS, SEQ and KITS; a tapped control doesn't act while learning; mapped note plays its pad and unmapped note 36 still plays A1; swing 50/75 at CC 0/127; PLAY only on a rising CC; BPM 40/240 from CC and tap tempo from a note; Full Level, bank, loop, master, pad volume; relearn replaces; × removes; reload keeps mappings; MIDI off ends learn. Layout at 390×844, 844×390 and 1280×800.
- Not checked here: real hardware (Luke's loopMIDI test at the end of M4), and real touch on a range slider while learning (the scripts used synthetic events).

Step 5 notes (2026-10-18):
- `src/midi/clock.ts` (`initMidiClock`, called in main.ts): a Tone `scheduleRepeat` every `PPQ/24` ticks. At transport tick 0 it sends Song Position 0 (F2 00 00) then Start (FA); every callback sends a clock (F8). Clocks use `out.timestampOf()` (now exported) and go to the browser ~25 ms ahead on cancelable timers. Stop (FC) is sent, and pending clocks dropped, when the transport stops, the switch goes off or MIDI goes off (only if clocks were running).
- Switching clock on while playing sends clocks only (no Start; the receiver is not told a song restarted). Off by default; the SETUP switch (`midi.setClockOut`) is disabled while MIDI is off.
- Checked by script with `?fakemidi`: nothing sent with the switch off; F2 00 00, FA, then F8 spaced 20.8 ms at 120 BPM (52 messages in ~1.1 s); Stop sends CC 123 then FC and nothing after; mid-play enable = clocks only; mid-play disable = FC; REC count-in sends no clock until the bar ends, then Start at ~1.98 s. Not checked: real hardware, and tempo changes mid-play (Tone follows the BPM, but not measured).

## Next step
M4 is built. Luke's end-of-milestone test: loopMIDI + a MIDI monitor in Chrome/Edge on the PC (notes, channel, clock, learn; a DAW if available), and on the phone the SETUP layout, permission prompt and "no devices" state. Then merge `feat/m4-midi` into `main`.
