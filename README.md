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

## Keys

- Open **KEYS** for a keyboard. **SYNTH** has Warm Pad, Saw Lead, Sub Bass and Glass Pluck. **SAMPLED** has Grand Piano, FM Piano, Strings, Concert Harp and Kalimba (CC0 recordings, see CREDITS.md).
- Touch: slide across keys to play each one; press lower on a key to play harder. Octave −/+ covers C1–C7.
- Computer keyboard on the KEYS tab: `A S D F G H J K L ;` are the white keys, `W E T Y U O P` the black keys, `Z` / `X` the octave. Space, Shift+R, Ctrl+Z and M still work.
- **SNAP** keeps notes in a key and scale (set in SETUP → Auto-tune). **HOLD** latches notes. **ARP** toggles the arpeggiator; hold it for mode and rate. **PITCH** bends ±2 semitones.
- Notes record into LOOP 1–4 with REC / DUB, beside the drums, and play back with the current KEYS sound.
- MIDI: SETUP has a **Keys channel** (default 1). Keys notes and pitch bend go out on it; notes, pitch bend and sustain (CC 64) coming in on it play KEYS. Other channels still play pads.
- The two **REVERB / DELAY** knobs on the KEYS tab send the keys to the effects (they start at 0).

## Mix / FX

- Open **MIX / FX**. Six strips (KICKS, SNARE, HATS, PERC, KEYS, MASTER) each have a fader, a level meter, a dB readout and a mute (M). Drag the fader, or touch the track to jump there; double-tap resets it. The OUT readout holds the master peak.
- **REVERB, DELAY and FILTER** cards each have an on/off switch and three knobs (drag, arrow keys, or double-tap to reset). Reverb: SIZE, DECAY, MIX. Delay: TIME (tempo-synced), FDBK, MIX. Filter (on the whole master): TYPE, CUTOFF, RES.
- Pads and keys only feed reverb and delay when their **send** is above 0: per pad on the KITS tab (and the tablet rail), and the two knobs on the KEYS tab. Every send starts at 0.
- The metronome click skips the strips and effects but follows MASTER. Mixer and effect settings are saved in this browser.

## Latency and theme (SETUP)

- **Audio & Latency:** CALIBRATE asks for taps along to 8 clicks and stores the measured delay; the **offset** slider (−50 to +50 ms) fine-tunes it. Both shift where recorded hits land. **Low-latency mode** (default on) uses the smallest audio buffer; turn it off for fewer crackles on a slow phone. It applies after a reload.
- **Theme:** Chassis, Chassis light or High contrast; pad colours by drum type or one colour; **Vibrate on hit** (touch hits only, off by default, not on iPhones).

## MIDI Learn

Turn on LEARN in SETUP, tap a control, then move a control on the MIDI device. Pads, transport buttons, the master volume, the KEYS buttons, the pad knobs, the mixer faders and mutes, the FX switches and knobs, and the KEYS send knobs can all be learned. A note presses a button; a CC moves a fader or knob, or presses a button when it rises past 64.

## Licence

The code is under the MIT licence (see `LICENSE`): anyone may use, change and share it, and it comes with no warranty. The sounds are CC0 (see `CREDITS.md`). Each build writes the licences of the bundled libraries (Tone.js and its dependencies, Workbox) to `third-party-licenses.md` beside the page.
