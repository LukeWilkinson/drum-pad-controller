# Handoff

## Where things stand (2026-10-17)
Milestone 1 (Pads) and Milestone 2 (Kits and presets) passed Luke's phone test (2026-10-17). Milestone 3 (Sequencer and looping) passed Luke's phone test (2026-10-17) and was merged into `main` (125ea1d). Milestone 4 (MIDI) passed Luke's hardware test (2026-10-18) and was merged into `main` (see "M4" at the end).

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

M4 is done: Luke's hardware test passed (2026-10-18) for notes, channel, clock, learn, the SETUP layout, the permission prompt, the "no devices" state and the SEQ header Play/Stop button (abfbd25). `feat/m4-midi` is merged into `main`.

## M5 (Instruments): planned 2026-10-18, building on `feat/m5-instruments`

### Decisions from Luke (2026-10-18)
- **Recording:** keys notes record into LOOP 1–4 (REC/DUB, quantise, undo, autosave) and play back with the drums. No note editing in SEQ; the grid stays drums-only.
- **Where it's played:** the KEYS tab only (no melodic pads mode), by touch, the computer keyboard and MIDI.
- **Samples:** CC0 / public domain only. SAMPLED presets: **Grand Piano** (VCSL Kawai grand), **FM Piano** (VCSL TX81Z, in place of the design's Electric Piano), **Strings** (VSCO-2 CE violin, viola and cello sections), **Concert Harp** (VCSL, in place of Nylon Guitar). Both repos say CC0 (checked 2026-10-18). Pinned to VCSL c1ea7bcc and VSCO-2-CE 44030090. No CC0 nylon guitar or sampled Rhodes/Wurlitzer was found.
- **Storage:** sparse samples (about one per 3 semitones, one velocity layer, trimmed, mono FLAC), all precached for offline use.
- **Extras in M5:** HOLD, ARP and the pitch-bend strip. The MOD strip is drawn as a `data-todo` placeholder.
- **ARP:** tap toggles it; holding ARP opens a dialog with mode (Up, Down, Up-Down, Random) and rate (1/8, 1/16, 1/32, 1/8T). It locks to the transport grid while playing.
- **MIDI:** a new **Keys channel** setting (default 1). Keys notes go out on it, and incoming notes on that channel play the instrument; all other channels still play pads.
- **PC keyboard on the KEYS tab:** A S D F G H J K L = white keys, W E T Y U O P = black keys, Z / X = octave down / up. T plays F# there (tap tempo stays on the BPM readout, and T on other tabs). Space, Shift+R, Ctrl+Z and M still work.
- **Loop sound:** recorded notes play with the current KEYS preset (one instrument for the whole song).

### Claude's choices (Luke can override)
- **Two voice engines.** Synth presets use Tone.js instruments on `engine.ctx`, triggered at `ctx.currentTime` for live notes. Sampled presets use raw Web Audio voices like the drums (nearest root sample, `playbackRate` for pitch, `detune` for bend, a release fade), sharing the engine's buffer cache. Both go through a keys gain bus into the master.
- **Synth presets** follow the design: Warm Pad (poly, slow attack), Saw Lead (mono, glide), Sub Bass (mono, sine + drive), Glass Pluck (poly FM, short). Mono presets use last-note priority.
- **Scale snap** changes the note at input time, so what plays, records and goes out as MIDI is the snapped note. An out-of-scale key snaps to the nearest scale note; a tie goes down. It applies to MIDI input on the Keys channel too. Scales: Major, Minor, Harmonic minor, Dorian, Mixolydian, Pentatonic major, Pentatonic minor, Blues. Default key A, Minor, snap off.
- **HOLD** latches notes until the key is tapped again or HOLD goes off; with ARP on it latches the arp's notes. MIDI CC 64 (sustain) on the Keys channel works like holding HOLD down.
- **Pitch bend** is ±2 semitones, springs back on release, is live only (not recorded), and goes out as MIDI pitch bend.
- **Recorded notes** are `{ tick, note, vel, len }` events next to the drum `{ tick, pad, vel }` events in the same loop. A note held past the loop end is cut at the loop length. Arp notes are recorded at their exact time, like Note Repeat.
- **Scheduled synth notes** are handed to Tone on a timer just before their time (as `src/midi/out.ts` does), so Stop and cancel still work.
- **Layouts:** the KEYS panel sits where the Kits/SEQ/SETUP panels sit. Phone portrait and landscape show 10 white keys (C to E, as in the design); tablet shows 15 (C to C, two octaves).
- **Saved as one `keys` pref:** source, preset per source, octave, arp mode and rate, snap on/off, key, scale. HOLD and ARP on/off aren't restored at boot.
- **MIDI Learn:** octave −/+, HOLD, ARP, snap on/off, SYNTH/SAMPLED and the preset buttons.
- The LCD last-hit line shows e.g. `KEYS · C4 · VEL 100 · WARM PAD`.

### Steps (Luke checks in after each; one commit per step)
Suggested model: Opus, medium for steps 1 and 4; Opus, high for step 5; Sonnet, medium for steps 2, 3, 6 and 7.
Commits: plan 9c5a10f, step 1 f434100, step 2 baff273, step 3 ddb6bb3, step 4 ad11ee6, step 5 80ecc8a, step 6 d263a79.
1. **KEYS tab with the synth presets.** `'keys'` view; `src/ui/keys.ts` + `src/styles/keys.css` from `Keys.dc.html` at all 3 sizes; `src/audio/keys.ts` (keys voice engine, 4 Tone presets, keys bus); `src/keys/keys.ts` (only code that changes `state.keys`, `keys` pref); `src/keys/notes.ts` (the one note-hit path); touch keyboard with multi-touch and slide; PC piano keys on the KEYS tab; octave C1–C7.
2. **Sampled instruments.** `src/audio/instruments.json`; `scripts/fetch-instruments.mjs` (`npm run fetch-instruments`, pinned WAVs → ffmpeg → trimmed mono FLAC in `public/samples/instruments/<id>/`, about 3 MB each); sampled voices; precache; CREDITS.md.
3. **Scale snap.** `src/keys/scales.ts` (pure); snap chip, dimmed out-of-scale keys, root dot; SETUP AUTO-TUNE section with the Scale snap card only (the vocal card is M7).
4. **HOLD, ARP and pitch bend.** HOLD latch; pitch strip; `src/keys/arp.ts` (built like `src/seq/repeat.ts`); ARP options dialog.
5. **Recording keys into loops.** Note events in `src/seq/pattern.ts`; `recordNoteOn` / `recordNoteOff`, playback, undo, cancel on stop and autosave in `src/seq/sequencer.ts`; old saves still load.
6. **Keys MIDI.** `state.midi.keysChannel` + SETUP select; keys notes and pitch bend out; Keys-channel notes, pitch bend and CC 64 in; keys learn targets.
7. **Docs and Luke's phone / hardware checklist.**

### Checks
- Claude, per step, by script in the browser pane (`dev-http`, `?fakemidi` for MIDI), plus layout at 390×844, 844×390 and 1280×800.
- Claude can't hear the browser pane, so the sound of each preset, glide, release tails, bend and timing by ear are Luke's checks.
- Luke, at the end: the phone test (touch keyboard, chords, slide, layout, offline with `npm run lan`) and loopMIDI (keys channel out, notes in, pitch bend, sustain).

Step 1 notes (2026-10-18):
- New files: `src/keys/types.ts` (KeysState, PRESETS, `noteName`, `cOf`; imports nothing), `src/audio/keys.ts` (`KeysEngine`: Tone presets, PolyVoice / MonoVoice, keys bus into `engine.input`), `src/keys/keys.ts` (only code that changes `state.keys`; `keys` pref), `src/keys/notes.ts` (the one note path: sound, then lit key and LCD; counts presses per note so a note ends when the last finger/key lets go), `src/keys/input.ts` (pointer + PC keys), `src/ui/keys.ts` + `src/styles/keys.css` (the panel).
- Touch: the board captures each pointer, so sliding plays every key reached and a finger leaving the keyboard stops its note. Pressing lower on a key plays it harder (v = 40 + 87 × y/height), like the front of a real key.
- PC keys on the KEYS tab only: A S D F G H J K L ; = white, W E T Y U O P = black, Z / X = octave. The pad keys and the O / T shortcuts are off on that tab; Space, Shift+R, Ctrl+Z and M still work.
- The 4 synth presets sound only in the app for now; SAMPLED presets can be picked but are silent until step 2. Snap chip, HOLD, ARP and PITCH are `data-todo="M5"` (steps 3–4); MOD is `data-todo="LATER"`.
- Fixed while checking: Tone throws if a mono synth is restarted at the same audio time (two keys in one event), so a mono voice keeps its attacks at least 1 ms apart.
- The SYNTH / SAMPLED buttons are 38px tall inside a 44px strip, as in the design (under the 44px rule).
- Checked by script at 390×844: C-E-G chord with 3 pointers (3 voices), slide C4 → D4 → C#4, release, LCD `KEYS · G4 · VEL 110 · WARM PAD`; Saw Lead last-note priority (C, E, G held → release G → E sounds); same note pressed twice ends on the second release; 10-note Warm Pad cluster; octave Z/X and −/+ (clamped C1–C7, labels follow); T = F#4 with tap tempo and DUB untouched; M still toggles the click; A plays a pad again on the PADS tab; `keys` pref round trip (SAMPLED, Strings, C2, synth choice kept) and a damaged pref → defaults. Layout measured at 844×390 (head, presets, octave and strips rows 44px, keyboard 158px) and 1280×800 (15 white keys C4–C6, rails kept).
- Not checked: the sound of the presets (Claude can't hear the pane), real multi-touch on a phone.

Step 2 notes (2026-10-18):
- `src/audio/instruments.json`: the 4 instruments (Grand Piano 26 notes A#0–C8, FM Piano 19 C1–C7, Strings 15 C2–D6 from cello → viola → violin sections, Concert Harp 22 E1–F7), each file's source path, its real MIDI note, length, release, gain and (strings) a sustain loop. Picked by a one-off script: about one note every 3 semitones (4 on FM Piano, which only has C / E / G#), medium velocity layer.
- **Octave naming:** measured by pitch detection. The VCSL Kawai piano and the VSCO strings are named an octave below what they play ("C4" plays C5); FM Piano and harp are named correctly. The JSON stores the real pitch. Mid-range roots measured within 15 cents.
- `scripts/fetch-instruments.mjs` (`npm run fetch-instruments`, needs ffmpeg): downloads each pinned WAV (about 175 MB in all, streamed, not kept) and converts it to mono 32 kHz 16-bit FLAC: leading silence removed, cut to 4–5 s, 0.3 s fade-out. Result: 82 files, 8.0 MB (piano 2.07, FM 1.79, strings 2.95, harp 1.17 MB), in `public/samples/instruments/<id>/<note>.flac`, committed like the drum samples.
- Sampled voices (`SampledVoice` in `src/audio/keys.ts`): the nearest recorded note, re-pitched by `playbackRate`; note-off fades over the instrument's release. Strings loop 1.2–4.6 s; the loop seam gets a 0.3 s equal-power crossfade baked into the buffer when first played, so held notes don't click or die out. Piano, FM and harp notes die away after 4–5 s even when held (a choice to keep the files small).
- Gains even out the instruments by their measured loudness: piano +4 dB, FM +3, strings −6, harp +9. These are guesses for Luke's ear check.
- An instrument's samples load when it is first picked (from the precache, ~50 ms locally). The picked preset's button shows "Loading n/26" meanwhile (`state.keysLoad`); if loading fails it shows "Couldn't load samples". Only the latest pick reports. All 82 files are precached (build: 203 entries, 13.0 MB).
- The engine's sample names can now have a folder: `instruments/grand/60` loads from `samples/`, plain names still from `samples/sonicpi/` (`SAMPLES_ROOT` in `kit.ts`). `engine.buffer(name)` gives the keys engine the decoded buffers.
- CREDITS.md has a new section for the instruments.
- Checked by script: load progress readout, nearest-root choice and rates (61 → C4 sample × 1.0595, A0 → A#0 sample), release, all 4 instruments play, strings loop points and seam, quick switching (only the last pick reports), back to SYNTH keeps the synth choice, no console errors, build precache.
- Not checked: the sound (Claude can't hear the pane), memory use on a phone with all four loaded (about 1 MB of decoded audio per file at 48 kHz, so ~80 MB with all four).

Step 3 notes (2026-10-18):
- `src/keys/scales.ts` (pure, imports nothing): `KEY_NAMES`, `SCALES` (Major, Minor, Harmonic minor, Dorian, Mixolydian, Pentatonic major, Pentatonic minor, Blues; each with a short chip name), `inScale()`, `snap()` (nearest scale note, a tie goes down) and `scaleLabel()`.
- `state.keys` gains `snap` (default off), `key` (0–11, default 9 = A) and `scale` (default Minor), saved in the `keys` pref; `keys.toggleSnap()`, `setKey()`, `setScale()`.
- Snap happens in `src/keys/notes.ts`: each pressed key remembers the note it started, so its release ends that note even if snap, the key or the scale changes while it is held. Two keys that snap to the same note hold it until both let go. The snapped note is what sounds, lights up and shows on the LCD. (Loops and MIDI input will go through the same path.)
- KEYS panel: the snap chip toggles snap ("SNAP · A MINOR", green dot; phone landscape shows the short form "A MIN" so SYNTH / SAMPLED still fit). With snap on, keys outside the scale dim to 45%. A dot marks the root on every octave (black keys too), with snap on or off, as in the design.
- SETUP: a new AUTO-TUNE section with only the Scale snap card (switch, KEY, SCALE). KEY and SCALE dim when snap is off but can still be changed. The vocal pitch card waits for M7.
- Checked by script: `snap()` against a brute-force nearest-note search for all 8 scales × 12 keys × 128 notes (12,288 cases, 0 wrong); A minor C# → C (tie down); C#4 played by the W key sounds and lights C4 and the LCD says C4; holding C4 and C#4, switching snap off, then releasing them in turn ends the note on the last release; snap off plays C#4; the chip and SETUP stay in step both ways; C major dims 7 keys; reload keeps snap on, D, Dorian; chip widths at 390×844 (longest "SNAP · C# PENTATONIC MINOR" fits) and 844×390 (short form, 115px, buttons not clipped).
- A console error seen once (`onSixteenth` before the clock existed) came from Vite hot reload mixing module versions; a clean reload had no errors and the transport and sequencer ran.

Step 4 notes (2026-10-18):
- **Scheduled notes:** `KeysEngine.playAt(note, vel, when, length)` hands the note to the voice 30 ms before its time (and its note-off 30 ms before that), so the returned cancel works: a note not yet started never sounds; one sounding ends now. `cancelScheduled()` cancels them all. The arp uses it now; loops will in step 5.
- **HOLD** (`state.keys.hold`): a note keeps sounding after its key comes up. Tapping that key again ends it. HOLD off ends the held notes, but a key still down keeps its note. Lit keys show what HOLD keeps.
- **ARP** (`src/keys/arp.ts`, built like Note Repeat): held (or HOLD-kept) notes play one at a time with an 80% gate. The first note sounds at once; stopped, the grid starts there; playing, steps land on the transport grid, with swing at 1/16 (as Note Repeat swings, stopped too). Each step goes on from the last note played: UP = next higher (wrap to the lowest), DOWN = next lower, UP-DOWN bounces, RANDOM never repeats a note; so notes joining or leaving mid-run fit in. A rate change or transport start/stop re-locks the grid from the next step. ARP on/off stops everything sounding (a note can't carry over between the two ways of playing).
- **ARP button:** tap toggles; holding 0.5 s (or a right-click) opens the options dialog (MODE: UP, DOWN, UP-DOWN, RANDOM; RATE: 1/8, 1/16, 1/32, 1/8T; applied as tapped). When on, the button shows the mode and rate ("ARP ↑ 1/16"). Mode and rate are saved; HOLD and ARP on/off are not (they start off).
- **PITCH strip:** drag sideways for ±2 semitones (`notes.bend()` → `KeysEngine.bend()`); the thumb follows the finger and springs back on release. Bend moves every sounding note: Tone `detune` on synths (15 ms ramp on mono), `detune` on each sampled voice; new notes start at the current bend, and a preset change keeps it.
- The MOD strip is still a placeholder (`data-todo="LATER"`). `grep -r data-todo src` now lists only that and the MIX/FX bits.
- Checked by script: HOLD latch / tap-to-end / HOLD off with a key down; arp at 120 BPM: 1/16 = 0.125 s, 1/8T = 0.167 s, 1/32 = 0.063 s, 1/8 = 0.25 s, gate 0.1 s at 1/16; UP 60 64 67…, DOWN 60 67 64 60…, UP-DOWN 60 64 67 71 67 64 60…, RANDOM never repeats; a note joining mid-run; release stops it; ARP + HOLD (latched chord keeps going, tapping E drops it, HOLD off stops it); playing with swing 66% → 0.165 / 0.085 s; ARP off stops all; bend ±200 cents on poly, mono and sampled, spring back to 0, a new note starts bent; dialog via right-click and a 0.6 s press (the click after it doesn't toggle), a short tap toggles; the octave row fits at 390 and 844 wide with "ARP ↑↓ 1/8T". No console errors.
- Not checked: how bend, glide and the arp sound (Claude can't hear the pane), and real long-press / drag on a phone.

Step 5 notes (2026-10-18):
- **Luke's decisions in planning:** REC clears only what gets played (the take's first pad hit clears the old drums, its first keys note the old notes, so recording keys over a drum loop keeps the drums; the take is one undo step). Notes are a separate `notes` list on each loop, beside `events`, so the SEQ grid, `toggleStep` and drum playback didn't change. Loop playback doesn't light the KEYS keys (the pads don't light on playback either).
- `src/seq/pattern.ts`: `NoteEvent { tick, note, vel, len }` (len in ticks; 0 while still held), `Pattern.notes`; `hasHits()`, `emptyPattern()`, `clonePattern()` cover notes; `insertEvent()` is generic.
- `src/seq/sequencer.ts`: the shared `place()` (count-in rule, quantise, the take's undo snapshot); `recordNoteOn` / `recordNoteOff` (from `notes.ts` `start()` / `end()`, ARP off), `recordNote` (a whole arp step), `endNotes()` (when recording ends, at Stop and on `notes.allOff()`). The length is the time held, from the press (not the quantised start), at least 1 tick and at most loop length − 1 tick. `attachKeys(instrument)` from `main.ts`; `scheduleStep()` plays notes through `KeysEngine.playAt()` and Stop cancels them (sounding loop notes end at once; live keys don't). `clearPattern()` clears both parts. `cleanPattern()` cleans notes; saves without `notes` load with none; a note still held when saved is dropped.
- With REC lazy, the old part keeps playing in a REC take until the first hit or note of that kind. An empty REC take leaves the loop as it was. Pressing DUB during REC (or REC during DUB) clears nothing more. After an undo mid-take, later hits add to the restored loop (they don't clear it again).
- `src/keys/arp.ts`: each step is recorded at its scheduled time on a timer, like Note Repeat; a cancelled step isn't recorded.
- Checked by script in the browser pane: C4 held 0.5 s in DUB → tick 168 (on the 1/16 grid), len 96, played on the next pass 0.5 s long and not twice on the first; quantise OFF keeps the raw tick, 1/16 snaps the start and keeps the length; a note held past the loop end → 383 ticks (1-bar loop); REC over drums + notes: REC pressed changes nothing, a keys take replaces only the notes, one undo brings the old notes back, a drum take replaces only the drums, an empty take changes nothing; HOLD records the latched note until it is tapped off; snap A minor: the C#4 key records C4; ARP UP 1/16 in DUB → steps 24 ticks apart, len 19 (80% gate); Stop cancels the loop note and leaves a held live key alone; a keys-only loop shows "1 · 1 BAR" on its slot; autosave round trip (a held note's len 0 dropped); a damaged save (bad tick, note, vel, len, null, a string, `notes: 'broken'`, a loop without `notes`) loads with only the good note. `npm run build` clean, no console errors after a clean server restart (errors seen before it came from Vite hot reload mixing old and new modules).
- Not checked: how loop notes sound and their timing by ear (Claude can't hear the pane).

Step 6 notes (2026-10-18):
- **Keys channel:** `state.midi.keysChannel` (default 1, saved in the `midi` pref, checked like `channel`), `midi.setKeysChannel()`, and a "Keys channel" select in SETUP (the old Channel select is now "Pads channel"). The hint text explains the split.
- **Out:** `KeysEngine` has a `KeysHook` (`now`, `off`, `at`, `bend`, `allOff`) like the drums' `HitHook`; `midi/out.ts` registers it (`initOut(engine, instrument)`). Live notes send at once with a note-off on release; scheduled ones (ARP steps, loop notes) send a timestamped note-on and note-off from the audio clock and are cancelled with the engine's own cancel. The hook hears notes even when "Play sounds in app" is off. Pitch bend goes out as 14-bit 0xE0 (±2 semitones = full range). Changing the Keys channel or output ends the keys notes on the old one (off + CC 123).
- **Echo:** `notes.noteOn(key, vel, echo = true)`, `notes.bend(amount, echo = true)`, `arp.add(note, vel, echo)` and `KeysEngine.noteOn/noteOff/playAt/bend` take `echo`. Notes from MIDI input pass `false`, so a port used both ways can't feed back (the ARP steps made from them aren't sent either). Loop playback of recorded notes still goes out.
- **In:** `midi/in.ts`: a learned mapping still wins on any channel. Otherwise on the Keys channel, notes play KEYS, pitch bend (0xE0) bends it, and CC 64 sets HOLD on at 64 and above (`keys.setHold()`). Every other channel keeps playing pads, so a drum controller on channel 10 and a keyboard on channel 1 can share one input. Held KEYS notes are released on an input change, status loss or Keys-channel change.
- **Learn:** `data-learn` on octave −/+, HOLD, ARP, snap chip, SYNTH / SAMPLED and the 4 presets; targets `oct-down`, `oct-up`, `hold`, `arp`, `snap`, `src:synth`, `src:sampled`, `preset:0–3` in `midi/targets.ts`. The ARP long-press dialog isn't learnable (a tap is).
- Checked by script with `?fakemidi` (after restarting `dev-http`; hot reload had left stale modules): C4 out as 0x90 on channel 1 and off 0x80; bend +2/0/−2 → 16383 / 8192 / 1; channel 5 moves later notes and ends the held one on the old channel; local sound off still sends; ARP at 120 BPM: on/off 125 ms apart with a 100 ms gate; ARP from MIDI sends nothing; loop notes sent 250 ms apart with the right lengths and Stop ends the sounding one on channel 1; input on channel 1 plays KEYS (LCD "KEYS · G4 · VEL 100"), channel 10 note 36 plays pad A01, nothing echoed out; bend in on channel 1 only (channel 2 ignored); CC 64 127/0 → HOLD on/off; learn for all 8 new targets (arm, learn, trigger); reload keeps keysChannel 5; invalid values rejected. SETUP layout at 390×844, 844×390 and 1280×800 (select 44px tall, no overflow). `tsc` and `npm run build` clean; no new console errors.
- Not checked: real devices (loopMIDI or a keyboard), the bend range on a real synth, and a damaged `keysChannel` pref (it uses the same validation as `channel`).
- Known gaps: incoming pitch bend doesn't move the PITCH strip thumb; pressing a learned CC as sustain isn't a separate target (CC 64 is fixed to HOLD on the Keys channel unless mapped).

## Luke's phone and hardware checklist for M5
Run `npm run dev` (or `npm run lan` for the offline check) and open the **Network** address on the phone. Tap a pad first to start audio.
1. KEYS on the phone:
   - [ ] Open KEYS. Play with 2–3 fingers (chord). Slide across keys. Pressing lower on a key is louder.
   - [ ] Each SYNTH preset: Warm Pad, Saw Lead (glide, one note at a time), Sub Bass, Glass Pluck. Do they sound right?
   - [ ] SAMPLED: Grand Piano, FM Piano, Strings, Concert Harp. Is any much louder or quieter than the others (gains are guesses)? Do held strings keep going without a click?
   - [ ] Octave −/+ and the layout in portrait and landscape (no clipped buttons).
2. Extras:
   - [ ] SNAP on (SETUP → Auto-tune sets key and scale): out-of-scale keys dim and play the nearest scale note.
   - [ ] HOLD latches a chord; tap a key to drop it. ARP: tap to toggle, hold the button for mode and rate. Does the arp feel in time?
   - [ ] PITCH strip bends ±2 semitones and springs back.
3. Recording:
   - [ ] REC or DUB while playing keys over a drum loop. The notes land on the grid and play back; undo removes the take.
   - [ ] Stop ends any sounding loop note. Reload the page: the loop's notes are still there.
4. Offline (`npm run lan`, install the app, switch to airplane mode):
   - [ ] KEYS loads and the sampled instruments still play (first pick may take a moment on a phone).
5. MIDI (loopMIDI or a keyboard):
   - [ ] Keys channel in SETUP (default 1): KEYS notes and pitch bend arrive on it in a MIDI monitor.
   - [ ] A keyboard on the Keys channel plays KEYS; the sustain pedal (CC 64) holds notes; its pitch bend bends them.
   - [ ] A controller on channel 10 still plays pads on the same input.
   - [ ] MIDI Learn on octave, HOLD, ARP, snap and the presets.
6. Known gaps: incoming pitch bend doesn't move the PITCH thumb; MOD strip is a placeholder; memory use with all four sampled instruments loaded on a phone is untested.

## Next step
M5 step 7 is written up. After Luke's phone and hardware test passes: merge `feat/m5-instruments` into `main` (ask Luke first), then plan M6.
