# Drum Pad Controller

A drum pad and MIDI controller as an installable web app (PWA). See SPEC.md for the plan and DESIGN.md for the look.

## Run on the PC

```bash
npm install
npm run dev
```

The terminal prints two addresses:
- **Local:** `https://localhost:5173`
- **Network:** the PC's address on the local network, port 5173

If `npm` isn't recognised, open a new terminal so it picks up the Node install.

## Open it on an Android phone (same Wi-Fi)

1. Run `npm run dev` on the PC.
2. In Chrome on the phone, open the **Network** address the terminal printed.
3. Chrome warns the connection isn't private, because the certificate is self-signed. Tap **Advanced → Proceed**. This is only needed once per address.
4. If the page doesn't load, Windows Firewall may be blocking Node. Allow **Node.js** on **Private** networks: the Windows prompt appears the first time, or go to Windows Security → Firewall → Allow an app.
5. Tap any pad to start the audio. Phones only allow sound after a tap.

### Install as an app and test offline

The service worker, needed for installing and offline use, only runs in the production build:

```bash
npm run lan
```

Open the **Network** address it prints (port 4173) on the phone, then use Chrome menu → **Install app** or **Add to Home screen**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server over HTTPS on the local network |
| `npm run build` | Type-check and build to `dist/` |
| `npm run lan` | Build, then serve `dist/` over HTTPS on the network (PWA works here) |
| `npm run fetch-samples` | Download the CC0 drum samples (skips files already present) |
| `npm run fetch-instruments` | Download and convert the CC0 KEYS instrument samples (needs ffmpeg; skips files already present) |
| `npm run check:vocal` | Render synthetic voices through the vocal tuner and measure the result (prints PASS / FAIL; `python scripts/vocal_check.py <folder>` re-measures its WAVs with numpy) |
| `npm run make-icons` | Regenerate PWA icons from `public/icons/icon.svg` |

Set `HTTP=1` to turn off HTTPS. This is only for desktop checks; phones need HTTPS.

## Playing

- **Velocity:** press higher on a pad to hit harder (40 at the bottom, 127 at the top). **FULL LVL** forces 127.
- **Multi-touch:** hold as many pads as there are fingers.
- **Keyboard:** the pad rows top to bottom are `1 2 3 4`, `Q W E R`, `A S D F`, `Z X C V`.

## Kits

- Open **KITS** (or tap the kit name on the LCD) to switch between the 5 built-in kits (the fifth, Kalimba, has 16 kalimba notes on bank A).
- Pick a pad, then use the **Volume, Pitch, Pan, Decay, Reverb send and Delay send** sliders. **SWAP SAMPLE** puts any built-in sample on the pad.
- **SAVE** stores the kit under **My kits**. It stays in this browser (IndexedDB) and the last kit reloads on startup.
- On a tablet, the right-hand knobs edit the selected pad too: drag up or down, or double-tap to reset.
- To add a kit, edit `src/audio/kits.json`, then run `npm run fetch-samples`.

## Your own samples

- **SWAP SAMPLE → IMPORT FILE…** loads a sound file (WAV, MP3, M4A, FLAC, OGG; up to 30 s) onto the selected pad. Silence at the start and end is trimmed and the peak is set to −1 dBFS. The pad takes the file's name.
- Imported sounds are listed under **MY SAMPLES** at the top of the dialog (preview, pick, delete). They stay in this browser. A sample can't be deleted while a saved kit uses it.
- **Record from the mic:** tap the **mic** in the display (or **AUDIO → RECORD…**). It blinks red and the pads get dashed outlines; tap the pad to record onto, make the sound, then tap the same pad (or the mic, or STOP) to end it. Up to 30 s; it also ends if the app is hidden. Other pads still play while recording; MIDI notes never start a take. The take is trimmed and levelled like an import, then **PLAY**, **RETRY**, **CANCEL** or **USE ON PAD**. USE puts it on the pad as "Mic 1", "Mic 2"… and offers **SAVE AS NEW KIT** (or NOT NOW). Use headphones, or the pads and the click get recorded too.

## Sharing kits and songs

- **KITS → SHARE**, or **SEQ → loop picker → SHARE**, opens one dialog: a **KIT** row (the kit playing now, with its imported samples inside the file), a **SONG** row (the 4 loops, tempo and settings) and **IMPORT FILE…**.
- Each row has **SHARE** (the share sheet: WhatsApp, Drive, email…) and **SAVE FILE** (always a plain download). Browsers with no share sheet for files show SAVE FILE only. Files are named `<name>.drumpad.txt`.
- Importing a kit adds it to **My kits** (a name already used gets " 2"). Importing a song asks first, then replaces the 4 loops (this can't be undone).

## Recording to WAV

- **AUDIO** tab: **REC OUT** and **BOUNCE…** in one place (also on the MIX / FX header and in the SEQ loop picker; on a tablet a **REC OUT** chip sits in the top bar). A red dot on the AUDIO tab shows while anything is recording or the vocal mic is on.
- **REC OUT** records everything you hear except the metronome, up to 10 minutes. A bar at the bottom of every tab shows the time and a STOP button.
- **BOUNCE** plays the current loop 1, 2 or 4 times from bar 1 and records it exactly, plus the reverb or delay tail.
- When a take finishes, **RECORDING READY** offers **SHARE**, **SAVE FILE** (always a download) or **DISCARD**. Files are 16-bit stereo WAV.

## Keys

- Open **KEYS** for a keyboard. **SYNTH** has Warm Pad, Saw Lead, Sub Bass and Glass Pluck. **SAMPLED** has Grand Piano, FM Piano, Strings, Concert Harp and Kalimba (CC0 recordings, see CREDITS.md).
- Touch: slide across keys to play each one; press lower on a key to play harder. Octave −/+ covers C1–C7.
- Computer keyboard on the KEYS tab: `A S D F G H J K L ;` are the white keys, `W E T Y U O P` the black keys, `Z` / `X` the octave. Space, Shift+R, Ctrl+Z and M still work.
- **SNAP** keeps notes in a key and scale (set in SETUP → Auto-tune). **HOLD** latches notes. **ARP** toggles the arpeggiator; hold it for mode and rate. **PITCH** bends ±2 semitones.
- Notes record into LOOP 1–4 with REC / DUB, beside the drums, and play back with the current KEYS sound.
- MIDI: SETUP has a **Keys channel** (default 1). Keys notes and pitch bend go out on it; notes, pitch bend and sustain (CC 64) coming in on it play KEYS. Other channels still play pads.
- The two **REVERB / DELAY** knobs on the KEYS tab send the keys to the effects (they start at 0).

## Mix / FX

- Open **MIX / FX**. Seven strips (KICKS, SNARE, HATS, PERC, KEYS, VOX, MASTER) each have a fader, a level meter, a dB readout and a mute (M). Drag the fader, or touch the track to jump there; double-tap resets it. The OUT readout holds the master peak.
- **REVERB, DELAY and FILTER** cards each have an on/off switch and three knobs (drag, arrow keys, or double-tap to reset). Reverb: SIZE, DECAY, MIX. Delay: TIME (tempo-synced), FDBK, MIX. Filter (on the whole master): TYPE, CUTOFF, RES.
- Pads, keys and the voice only feed reverb and delay when their **send** is above 0: per pad on the KITS tab (and the tablet rail), the two knobs on the KEYS tab, and the VOX sends on the AUDIO tab. Every send starts at 0.
- The metronome click skips the strips and effects but follows MASTER. Mixer and effect settings are saved in this browser.

## Latency and theme (SETUP)

- **Audio & Latency:** CALIBRATE asks for taps along to 8 clicks and stores the measured delay; the **offset** slider (−50 to +50 ms) fine-tunes it. Both shift where recorded hits land. **Low-latency mode** (default on) uses the smallest audio buffer; turn it off for fewer crackles on a slow phone. It applies after a reload.
- **Theme:** Chassis, Chassis light or High contrast; pad colours by drum type or one colour; **Vibrate on hit** (touch hits only, off by default, not on iPhones).

## Vocal pitch correction (AUDIO tab)

- Plug in **headphones** first: the speaker would feed back into the mic.
- Switch on **Vocal pitch correction** on the AUDIO tab (SETUP → Auto-tune links there; on a tablet the **VOX** chip in the top bar is the same switch). The browser asks for the mic once. The mic row shows the input level and the note heard → the note it's pulled to.
- **KEY** and **SCALE** set the notes it pulls to (**Chromatic** = the nearest semitone). **MATCH SCALE SNAP KEY** copies the KEYS snap settings.
- **Strength** is how far it pulls (100 % = all the way). **Speed** is how fast: 0 ms is the hard, robotic effect; towards 200 ms it sounds natural and keeps vibrato.
- The voice plays through the **VOX** strip on MIX / FX, with its own reverb and delay sends on the card, and REC OUT records it. It adds about 20–25 ms of delay.
- The mic switches off when the app is hidden, and is always off when the app starts. The other settings are saved.

## MIDI Learn

Turn on LEARN in SETUP, tap a control, then move a control on the MIDI device. Pads, transport buttons, the master volume, the KEYS buttons, the pad knobs, the mixer faders and mutes, the FX switches and knobs, the KEYS send knobs, REC OUT (including the tablet chip), the REC MIC button, and the vocal switch (including the VOX chip), strength, speed and VOX sends can all be learned. A note presses a button; a CC moves a fader or knob, or presses a button when it rises past 64.

## Licence

The code is under the MIT licence (see `LICENSE`): anyone may use, change and share it, and it comes with no warranty. The sounds are CC0 (see `CREDITS.md`). Each build writes the licences of the bundled libraries (Tone.js and its dependencies, Workbox) to `third-party-licenses.md` beside the page.
