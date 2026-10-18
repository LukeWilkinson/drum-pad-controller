# Design handoff

Source of truth: the Claude Design canvas at https://claude.ai/artifact/79zk33hSLfaD9kSCcWdtTz
(read its `project/*.dc.html` files for exact markup). The chosen design is **Mix** plus the screens and layouts built from it.
Ignore the "A · Chassis", "B · Glow" and "C · Mono" artboards: they were the style options, not the final design.

| Artboard | What it is |
|---|---|
| Mix.dc.html | Main pad screen, phone portrait (390×844) |
| Kits.dc.html | Kits and presets |
| Seq.dc.html | Sequencer and looping |
| Keys.dc.html | Keys / instruments |
| Fx.dc.html | Mixer and effects |
| Settings.dc.html | Settings (scrolling) |
| PhoneLand.dc.html | Pad screen, phone landscape (844×390) |
| Tablet.dc.html | Pad screen, tablet landscape (1280×800) |
| Desktop.dc.html | Pad screen, desktop (fluid, 1440 wide) |

## Design tokens

```css
:root {
  /* surfaces */
  --body: #2B2A28;        /* app background (chassis) */
  --raised: #3C3B38;      /* buttons, cards */
  --well: #1F1E1C;        /* recessed areas: pad well, sliders, sections */
  --drawer: #232220;      /* tab bar / drawer */
  --edge: #191816;        /* borders, deep shadow */
  --pad-rubber: #45433F;  /* pad base under the colour tint */

  /* text */
  --text: #D6D1C6;
  --text-strong: #ECE7DC;
  --text-muted: #A8A399;

  /* LCD */
  --lcd-bg: #241A0C;
  --lcd-text: #FFB547;
  --lcd-dim: #C98A2E;

  /* accents */
  --amber: #FFB547;       /* selected / active state, primary button */
  --rec: #E8432E;
  --play: #8FD16A;        /* also "switch on" */
  --switch-off: #55534E;

  /* pad groups */
  --kick: #FF5A4E;
  --snare: #FF9F1C;
  --hat: #FFD447;
  --tom: #5FD38A;
  --cym: #5BC0EB;
  --perc: #B794F6;
  --fx: #F472B6;
}
```

- **Fonts (Google Fonts):** Archivo Narrow 500/700 for UI labels, mostly uppercase with slight letter-spacing. JetBrains Mono 400/600 for the LCD, numbers and values.
- **Radii:** buttons 6–8px; cards and wells 10–14px; tab drawer 16px at the top corners; round record button.
- **Raised buttons:** `box-shadow: inset 0 -3px 0 rgba(0,0,0,.35)` for the hardware key look.
- **Touch targets:** at least 44px everywhere. Pads should be as large as the layout allows.
- **Icons:** inline stroke SVGs (24 viewBox, 2px stroke). No emoji.

## Pads (core interaction)

- 4×4 grid in a recessed well. Pad numbers follow the MPC layout: pad 1 is bottom-left and pad 16 is top-right.
- Default bank A layout (top row first):
  - Crash, Ride, Tom Hi, Tom Lo
  - Open Hat, Closed Hat, Pedal Hat, Shaker
  - Snare, Rim, Clap, Snap
  - Kick, Kick 2, 808, Vox FX
- Each pad has:
  - **Idle:** the rubber base tinted with its group colour at 16% opacity, a 3–4px LED strip in the group colour at the top, the pad number (mono) and the name (uppercase).
  - **Hit:** a fill in the group colour rises from the bottom, its height set by the velocity. The pad also gets a 2px ring and a glow in the group colour. When velocity is above about 75, the text turns dark (#1B1A18).
- **Velocity:** set by where the pad is pressed, higher means harder: `v = 40 + 87 * (1 - y / height)`, clamped to 1–127. **Full Level** forces 127.
- **Multi-touch:** use Pointer Events per pad with `touch-action: none`. Track each pointer separately so many pads can be held at once. Release on pointerup, pointerleave and pointercancel.
- **Pad banks:** A, B, C and D. **Note Repeat** and **Full Level** are toggles that show amber when on.
- **Desktop keyboard:** the four pad rows (top to bottom) map to keys `1 2 3 4`, `Q W E R`, `A S D F`, `Z X C V`. Other shortcuts:
  - Space: play/stop
  - R: record
  - O: overdub
  - Ctrl+Z: undo
  - M: metronome
  - T: tap tempo

## Main pad screen structure (phone portrait)

Elements from top to bottom:

1. **LCD panel:** kit selector, BPM with − and +, the line "BAR · Q · SWING · REC state", and the last hit ("PAD 13 · KICK · VEL 104").
2. **Transport row:** Undo, Metronome, big round REC button (68px; red glow when recording), Play, Overdub (DUB).
3. **Loop slots:** four slots, each showing its progress bar; empty slots are dashed.
4. **Bank row:** A–D, plus Note Repeat and Full Level.
5. **Pad grid:** fills the remaining height, so pads are taller than they are wide.
6. **Bottom drawer / tab bar:** Pads, Kits, Seq, Keys, Mix/FX, Setup.

Keep the pad screen uncluttered. Everything else lives behind the tabs.

## Responsive layouts

- **Phone landscape:** controls column on the left (LCD, transport, loops, banks, text tabs) and a square pad grid on the right.
- **Tablet landscape:** top tab bar with MIDI status and a settings button. Three columns:
  - left rail, 320px: LCD, transport, 2×2 loop slots, banks, Note Repeat / Full Level
  - centre: square pad grid
  - right rail: selected pad's volume, pitch, pan and FX sends, plus master volume
- **Desktop:** the same three columns with a max width of 1440, wrapping to a single column on narrow windows. Adds a 16-step pattern strip under the pads and a keyboard shortcut legend.

## Other screens (key points)

- **Kits:**
  - category chips
  - kit list with 16 colour dots per kit and a LOADED tag
  - pad picker plus volume, pitch, pan and decay sliders
  - Load preset / Save buttons
- **Sequencer:**
  - pattern selector
  - loop length 1/2/4/8 bars
  - REC, Overdub, Count-in and Click toggles
  - quantise (1/4, 1/8, 1/16, 1/32, Off) and swing
  - 8 rows by 8 steps, with pages for steps 1–8 and 9–16; beat-start cells are lighter and the playhead column is outlined
- **Keys:**
  - SYNTH / SAMPLED switch with four presets each
  - octave −/+, Hold and Arp
  - pitch-bend and mod strips
  - keyboard from C to E (10 white keys); the root note is marked
  - when scale snap is on, out-of-scale keys are dimmed and a snap chip shows the key and scale in the header
  - built: tablet shows 15 white keys (C to C); PC keys `A S D F G H J K L ;` / `W E T Y U O P`, `Z` / `X` octave; MOD strip is still a placeholder
- **Mix/FX:**
  - five channels plus master, each with a fader, meter, dB readout and mute button
  - Reverb, Delay and Filter cards, each with an on/off switch and three 270° arc knobs
- **Settings:**
  - **MIDI:** output, input, channel, send clock, MIDI Learn (amber "listening" state) and a list of mappings
  - **Latency:** measured value shown in the LCD style, a calibrate button (tap along to 8 clicks), manual offset, low-latency mode
  - **Auto-tune:** two separate cards, each with its own on/off switch. Scale snap has key and scale. Vocal pitch correction has a mic status and level meter, a headphones note, key and scale, a "match scale snap key" button, strength and speed (hard to natural). When a card is off its controls dim to 45%.
  - **Theme:** Chassis, Chassis light, High contrast; pad colours (by drum type or a single colour); vibrate on hit

## Build note

The design files use inline styles and a small templating runtime. Rebuild them as normal components with the tokens above; don't copy the `.dc.html` runtime.
