# Drum Pad Controller

A drum pad and MIDI controller as an installable web app (PWA). See SPEC.md for the plan and DESIGN.md for the look.

## Run on the PC

```bash
npm install
npm run dev
```

The terminal prints two addresses:
- **Local:** `https://localhost:5173`
- **Network:** `https://192.168.x.x:5173`

If `npm` isn't recognised, open a new terminal so it picks up the Node install.

## Open it on an Android phone (same Wi-Fi)

1. Run `npm run dev` on the PC.
2. In Chrome on the phone, open the **Network** address, e.g. `https://192.168.x.x:5173`.
3. Chrome warns the connection isn't private, because the certificate is self-signed. Tap **Advanced → Proceed**. This is only needed once per address.
4. If the page doesn't load, Windows Firewall may be blocking Node. Allow **Node.js** on **Private** networks: the Windows prompt appears the first time, or go to Windows Security → Firewall → Allow an app.
5. Tap any pad to start the audio. Phones only allow sound after a tap.

### Install as an app and test offline

The service worker, needed for installing and offline use, only runs in the production build:

```bash
npm run lan
```

Open `https://192.168.x.x:4173` on the phone, then use Chrome menu → **Install app** or **Add to Home screen**.

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

- Open **KITS** (or tap the kit name on the LCD) to switch between the 4 built-in kits.
- Pick a pad, then use the **Volume, Pitch, Pan and Decay** sliders. **SWAP SAMPLE** puts any built-in sample on the pad.
- **SAVE** stores the kit under **My kits**. It stays in this browser (IndexedDB) and the last kit reloads on startup.
- On a tablet, the right-hand knobs edit the selected pad too: drag up or down, or double-tap to reset.
- To add a kit, edit `src/audio/kits.json`, then run `npm run fetch-samples`.

## Keys

- Open **KEYS** for a keyboard. **SYNTH** has Warm Pad, Saw Lead, Sub Bass and Glass Pluck. **SAMPLED** has Grand Piano, FM Piano, Strings and Concert Harp (CC0 recordings, see CREDITS.md).
- Touch: slide across keys to play each one; press lower on a key to play harder. Octave −/+ covers C1–C7.
- Computer keyboard on the KEYS tab: `A S D F G H J K L ;` are the white keys, `W E T Y U O P` the black keys, `Z` / `X` the octave. Space, Shift+R, Ctrl+Z and M still work.
- **SNAP** keeps notes in a key and scale (set in SETUP → Auto-tune). **HOLD** latches notes. **ARP** toggles the arpeggiator; hold it for mode and rate. **PITCH** bends ±2 semitones.
- Notes record into LOOP 1–4 with REC / DUB, beside the drums, and play back with the current KEYS sound.
- MIDI: SETUP has a **Keys channel** (default 1). Keys notes and pitch bend go out on it; notes, pitch bend and sustain (CC 64) coming in on it play KEYS. Other channels still play pads.
