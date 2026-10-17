# Credits

## Drum samples: Sonic Pi sample library (CC0)

- Source: https://github.com/sonic-pi-net/sonic-pi/tree/v4.5.1/etc/samples
- Pinned tag: `v4.5.1`. Download them with `npm run fetch-samples` (see `scripts/fetch-samples.mjs`).
- Licence: **CC0 1.0 (public domain)**. Sonic Pi's samples README (`etc/samples/README.md`) says the samples were "placed in the public domain via the Creative Commons 0 License". Most come from freesound.org. Sonic Pi trimmed and slightly modified many of them.
- Checked: 2026-10-17.

Files used, per built-in kit (all in `public/samples/sonicpi/`; the list comes from `src/audio/kits.json`):

### Studio Acoustic (Acoustic)

| Pad | Name | File(s) |
|---|---|---|
| 13 | Crash | drum_splash_soft, drum_splash_hard |
| 14 | Ride | drum_cymbal_soft, drum_cymbal_hard |
| 15 | Tom Hi | drum_tom_hi_soft, drum_tom_hi_hard |
| 16 | Tom Lo | drum_tom_lo_soft, drum_tom_lo_hard |
| 9 | Open Hat | drum_cymbal_open |
| 10 | Closed Hat | drum_cymbal_closed |
| 11 | Pedal Hat | drum_cymbal_pedal |
| 12 | Shaker | perc_swash |
| 5 | Snare | drum_snare_soft, drum_snare_hard |
| 6 | Rim | elec_wood |
| 7 | Clap | perc_snap2 |
| 8 | Snap | perc_snap |
| 1 | Kick | drum_heavy_kick |
| 2 | Kick 2 | bd_haus |
| 3 | 808 | bd_808 |
| 4 | Vox FX | elec_blip |

### Neon Electronic (Electronic)

| Pad | Name | File(s) |
|---|---|---|
| 13 | Crash | elec_cymbal |
| 14 | Bell | elec_bell |
| 15 | Fuzz Tom | elec_fuzz_tom |
| 16 | Bong | elec_bong |
| 9 | Open Hat | hat_zild |
| 10 | Closed Hat | hat_tap |
| 11 | Zap Hat | hat_zap |
| 12 | Noise | hat_noiz |
| 5 | Snare | elec_snare |
| 6 | Hi Snare | elec_hi_snare |
| 7 | Filt Snare | elec_filt_snare |
| 8 | Tick | elec_tick |
| 1 | Kick | elec_hollow_kick |
| 2 | Soft Kick | elec_soft_kick |
| 3 | Tek Kick | bd_tek |
| 4 | Blip | elec_blip2 |

### Dusty Hip-hop (Hip-hop)

| Pad | Name | File(s) |
|---|---|---|
| 13 | Crash | drum_splash_soft, drum_splash_hard |
| 14 | Ride | drum_cymbal_soft |
| 15 | Tom Mid | drum_tom_mid_soft, drum_tom_mid_hard |
| 16 | Tom Lo | drum_tom_lo_soft, drum_tom_lo_hard |
| 9 | Open Hat | hat_cats |
| 10 | Closed Hat | hat_cab |
| 11 | Gump Hat | hat_gump |
| 12 | Cowbell | drum_cowbell |
| 5 | Snare | sn_dub |
| 6 | Snare 2 | sn_dolf |
| 7 | Clap | perc_snap2 |
| 8 | Snap | perc_snap |
| 1 | Boom Kick | bd_boom |
| 2 | Fat Kick | bd_fat |
| 3 | 808 | bd_808 |
| 4 | Scratch | vinyl_scratch |

### Lo-fi Tape (Lo-fi)

| Pad | Name | File(s) |
|---|---|---|
| 13 | Crash | drum_splash_soft |
| 14 | Ride | drum_cymbal_soft |
| 15 | Tabla Hi | tabla_tun1 |
| 16 | Tabla Lo | tabla_ghe4 |
| 9 | Open Hat | hat_mess |
| 10 | Closed Hat | hat_bdu |
| 11 | Soft Hat | hat_hier |
| 12 | Bell | perc_bell |
| 5 | Snare | sn_generic |
| 6 | Lo Snare | elec_lo_snare |
| 7 | Zome Snare | sn_zome |
| 8 | Knock | perc_door |
| 1 | Kick | bd_ada |
| 2 | Sone Kick | bd_sone |
| 3 | Zome Kick | bd_zome |
| 4 | Backspin | vinyl_backspin |

### Banks B–D (shared by every kit)

#### Bank B

| Pad | Name | File(s) |
|---|---|---|
| B13 | Chime | elec_chime |
| B14 | Triangle | elec_triangle |
| B15 | Tom Mid | drum_tom_mid_soft, drum_tom_mid_hard |
| B16 | Fuzz Tom | elec_fuzz_tom |
| B09 | Gnu Hat | hat_gnu |
| B10 | Metal Hat | hat_metal |
| B11 | Psych Hat | hat_psych |
| B12 | Star Hat | hat_star |
| B05 | Mid Snare | elec_mid_snare |
| B06 | Dub Snare | sn_dub |
| B07 | Dolf Snare | sn_dolf |
| B08 | Pop | elec_pop |
| B01 | Klub Kick | bd_klub |
| B02 | Pure Kick | bd_pure |
| B03 | Gas Kick | bd_gas |
| B04 | Deep Kick | drum_bass_soft, drum_bass_hard |

#### Bank C

| Pad | Name | File(s) |
|---|---|---|
| C13 | Ghe | tabla_ghe1 |
| C14 | Ghe Low | tabla_ghe3 |
| C15 | Ke | tabla_ke1 |
| C16 | Na | tabla_na |
| C09 | Na Open | tabla_na_o |
| C10 | Re | tabla_re |
| C11 | Tas | tabla_tas1 |
| C12 | Te | tabla_te1 |
| C05 | Ping | elec_ping |
| C06 | Plip | elec_plip |
| C07 | Twip | elec_twip |
| C08 | Beep | elec_beep |
| C01 | Till | perc_till |
| C02 | Blup | elec_blup |
| C03 | Knock | perc_door |
| C04 | Flip | elec_flip |

#### Bank D

| Pad | Name | File(s) |
|---|---|---|
| D13 | Choir | ambi_choir |
| D14 | Swoosh | ambi_swoosh |
| D15 | Dark Woosh | ambi_dark_woosh |
| D16 | Buzz | ambi_soft_buzz |
| D09 | Glitch 1 | glitch_perc1 |
| D10 | Glitch 2 | glitch_perc2 |
| D11 | Glitch 3 | glitch_perc3 |
| D12 | Robot | glitch_robot1 |
| D05 | Impact | perc_impact1 |
| D06 | Whoosh | perc_swoosh |
| D07 | Rewind | vinyl_rewind |
| D08 | Crow | misc_crow |
| D01 | Bass Hit | bass_hit_c |
| D02 | Voxy Hit | bass_voxy_hit_c |
| D03 | Bass Drop | bass_drop_c |
| D04 | DnB Bass | bass_dnb_f |

CC0 does not require attribution. The credit is kept here anyway, as thanks and so the source can be traced.

## Fonts

- Archivo Narrow and JetBrains Mono, loaded from Google Fonts. Both are under the SIL Open Font License 1.1.
