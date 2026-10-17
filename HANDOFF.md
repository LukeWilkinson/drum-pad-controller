# Handoff

## Where things stand (2026-10-17)
Milestone 1 (Pads) is built and committed.
- **Pad grid:** the 4×4 grid in all three layouts.
- **Pad input:** multi-touch, position velocity, keyboard and Full Level.
- **Kit:** the CC0 Sonic Pi kit, with soft/hard layers and a hi-hat choke.
- **PWA:** manifest, icons and an offline service worker.
- **LAN:** HTTPS dev server reachable on the local network.

## Luke's phone test checklist
1. Run `npm run dev`, then open `https://192.168.x.x:5173` on the phone. The IP may change; use the **Network** line the terminal prints.
2. Accept the certificate warning (Advanced → Proceed). Allow Node.js through Windows Firewall if asked.
3. Tap a pad to start audio. Check:
   - [ ] Sound plays with no noticeable delay.
   - [ ] 3–4 fingers at once all trigger and light up.
   - [ ] Top of pad = loud, bottom = soft (LCD shows VEL).
   - [ ] Portrait and landscape both fit with no scrolling.
   - [ ] Closed Hat cuts off Open Hat.
4. Run `npm run lan`, open `https://192.168.x.x:4173`, then Install app. Turn on airplane mode, reopen the app, and check the pads still play.

Report anything off (with a screenshot if it's layout-related).

## Known gaps / choices
- Shaker, Rim, Clap and Vox FX use the closest sample available in Sonic Pi; there is no real clap or vocal. These can be swapped in M2.
- The following are styled but do nothing yet (marked `data-todo`):
  - kit picker, BPM, transport (except the REC look), loops, banks B–D, Note Repeat, tabs, knobs
- The right rail knobs show static values. The master slider works.
- The desktop artboard extras (step strip, shortcut legend) are not built. The tablet layout is used for desktop widths.

## Next step
Milestone 2: kits and presets. Planned work:
- several kits and kit switching
- per-pad volume, pitch, pan and decay
- saving and loading presets in IndexedDB
- read `Kits.dc.html` from the canvas first
