# Handoff

## Where things stand (2026-10-17)
Milestone 1 (Pads) passed Luke's phone test. Milestone 2 (Kits and presets) is built, committed, and passed Luke's phone test (2026-10-17).

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

## M3 (Sequencer and looping): in progress on `feat/m3-sequencer`

### Decisions from Luke (2026-10-17)
- **Loops are patterns.** Loop slots 1–4 on the pad screen are the same loops as in the SEQ tab (called LOOP 1–4 everywhere). One plays at a time; tapping another slot while playing switches at the next bar line.
- **Grid rows:** 8 rows (the design's KICK, SNR, CLAP, CHH, OHH, TOM, PERC, FX), and a PADS button pages through the other pads and banks.
- **Clock:** Tone.js Transport on `engine.ctx`. **Undo:** every change, one shared stack of 50 steps across all loops. **Saving:** the song autosaves to IndexedDB (step 6).
- **Record key:** Shift+R, because plain R is a pad key.
- **Extras in M3:** Note Repeat, and pad banks B–D filled from Sonic Pi CC0 samples.
- **Claude's choices:** quantise is applied when a hit is recorded (OFF keeps the raw timing). Swing is applied at playback to the off-beat 16ths. Events are `{ tick, pad 0–63, vel }` at 96 ticks per beat. REC on a full slot replaces it; DUB adds to it. Count-in is one bar.

### Steps (Luke checks in after each; one commit per step)
Commits: step 1 dbcad22, step 2 4adf35c, step 3 0f005a8, step 4 588ef6e, step 5 5562f80.
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
   - Loops are not saved yet (step 6).
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
6. Autosave, docs, commit, phone checklist.

## Next step
M3 step 6: autosave the song (loops, BPM, swing, quantise, click, count-in, current loop, Note Repeat) to IndexedDB and restore it on reload. Then the phone checklist, docs and the final M3 commit. Model tip: Sonnet, medium.
