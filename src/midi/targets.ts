// What MIDI Learn can point at. Each target has a stable id (saved in the `midi` pref) and acts
// through the code that already owns that control, so a learned control behaves like a tap.
// Controls in the DOM carry `data-learn="<id>"`; pads carry `data-learn="pad"` and resolve to the
// pad of the bank on screen when tapped, so a learned pad is always one exact pad.
//
// A target has `press` (button), `set` (knob, 0–1) or `pad`. Notes press; a CC sets a knob, or
// presses a button when it rises past 64. The BPM readout has both: tap tempo, or BPM from a CC.

import * as clock from '../audio/clock';
import { BANK_NAMES, PADS_PER_BANK, PAD_COUNT, PARAM_RANGE, padLabel, type ParamKey } from '../audio/kit';
import * as keys from '../keys/keys';
import { PRESET_SLOTS } from '../keys/types';
import { selectBank, setParam } from '../kitControl';
import { FX } from '../mix/knobs';
import * as mix from '../mix/mix';
import { STRIPS, STRIP_LABEL, type StripId } from '../mix/types';
import { toggleFullLevel } from '../pads/hits';
import { SWING_MAX, SWING_MIN } from '../seq/pattern';
import * as repeat from '../seq/repeat';
import * as seq from '../seq/sequencer';
import { state } from '../state';
import { PARAM_LABEL } from '../ui/format';
import type { Mapping } from './types';

export interface Target {
  label: string;
  press?: () => void;
  set?: (v: number) => void;
  /** A pad (0–63): a note plays it with its velocity and releases on note-off. */
  pad?: number;
}

const isStrip = (s: string): s is StripId => (STRIPS as readonly string[]).includes(s);
const between = (min: number, max: number, v: number) => min + v * (max - min);

const FIXED: Record<string, Target> = {
  play: { label: 'PLAY / STOP', press: clock.togglePlay },
  rec: { label: 'REC', press: seq.toggleRec },
  dub: { label: 'DUB', press: seq.toggleDub },
  undo: { label: 'UNDO', press: () => seq.undo() },
  metro: { label: 'METRONOME', press: clock.toggleClick },
  tap: { label: 'TAP TEMPO', press: clock.tapTempo, set: (v) => clock.setBpm(Math.round(between(clock.BPM_MIN, clock.BPM_MAX, v))) },
  'bpm-down': { label: 'BPM −', press: () => clock.nudgeBpm(-1) },
  'bpm-up': { label: 'BPM +', press: () => clock.nudgeBpm(1) },
  'note-repeat': { label: 'NOTE REPEAT', press: repeat.toggleNoteRepeat },
  'full-level': { label: 'FULL LEVEL', press: toggleFullLevel },
  swing: { label: 'SWING', set: (v) => seq.setSwing(between(SWING_MIN, SWING_MAX, v)) },
  master: { label: 'MASTER', set: (v) => mix.setLevel('master', v) },
  'oct-down': { label: 'KEYS OCTAVE −', press: () => keys.nudgeOctave(-1) },
  'oct-up': { label: 'KEYS OCTAVE +', press: () => keys.nudgeOctave(1) },
  hold: { label: 'KEYS HOLD', press: keys.toggleHold },
  arp: { label: 'KEYS ARP', press: keys.toggleArp },
  snap: { label: 'KEYS SNAP', press: keys.toggleSnap },
  'src:synth': { label: 'KEYS SYNTH', press: () => keys.setSource('synth') },
  'src:sampled': { label: 'KEYS SAMPLED', press: () => keys.setSource('sampled') },
};

/** The target for an id, or null if the id is unknown (e.g. from an older save). */
export function findTarget(id: string): Target | null {
  if (FIXED[id]) return FIXED[id];
  const [kind, arg] = id.split(':');
  const n = Number(arg);
  if (kind === 'pad' && Number.isInteger(n) && n >= 0 && n < PAD_COUNT) return { label: `PAD ${padLabel(n)}`, pad: n };
  if (kind === 'bank' && Number.isInteger(n) && n >= 0 && n < BANK_NAMES.length) return { label: `BANK ${BANK_NAMES[n]}`, press: () => selectBank(n) };
  if (kind === 'loop' && Number.isInteger(n) && n >= 0 && n < state.patterns.length) return { label: `LOOP ${n + 1}`, press: () => seq.selectPattern(n) };
  if (kind === 'preset' && Number.isInteger(n) && n >= 0 && n < PRESET_SLOTS) return { label: `KEYS PRESET ${n + 1}`, press: () => keys.selectPreset(n) };
  if (kind === 'level' && isStrip(arg) && arg !== 'master') return { label: `${STRIP_LABEL[arg]} LEVEL`, set: (v) => mix.setLevel(arg, v) };
  if (kind === 'mute' && isStrip(arg)) return { label: `MUTE ${STRIP_LABEL[arg]}`, press: () => mix.toggleMute(arg) };
  if (kind === 'fx') {
    const fx = FX.find((f) => f.id === arg);
    if (fx) return { label: `${fx.name} ON / OFF`, press: () => mix.toggleFx(fx.id) };
  }
  if (kind === 'fxk') {
    const [, fxId, i] = id.split(':');
    const fx = FX.find((f) => f.id === fxId);
    const knob = fx?.knobs[Number(i)];
    if (fx && knob && Number.isInteger(Number(i))) return { label: `${fx.name} ${knob.label}`, set: (v) => knob.apply(knob.scale.from(v)) };
  }
  if (kind === 'keys-send' && (arg === 'reverb' || arg === 'delay')) {
    return { label: `KEYS ${arg.toUpperCase()} SEND`, set: (v) => keys.setSend(arg, Math.round(v * 100) / 100) };
  }
  if (kind === 'param' && arg in PARAM_RANGE) {
    const key = arg as ParamKey;
    const { min, max, step } = PARAM_RANGE[key];
    return {
      label: `PAD ${PARAM_LABEL[key].toUpperCase()}`,
      set: (v) => setParam(state.selectedPad, key, Math.round(between(min, max, v) / step) * step),
    };
  }
  return null;
}

/** "PAD A5", "SWING"; for a learned message, what that message does ("BPM" for a CC on tap). */
export function targetLabel(id: string, kind?: Mapping['kind']): string {
  if (id === 'tap' && kind === 'cc') return 'BPM';
  return findTarget(id)?.label ?? id.toUpperCase();
}

/** The target id of a control element (`data-learn`), or null. */
export function idOf(el: HTMLElement): string | null {
  const id = el.dataset.learn;
  if (!id) return null;
  if (id === 'pad') return `pad:${state.bank * PADS_PER_BANK + Number(el.dataset.screen)}`;
  return id;
}

export const messageLabel = (m: Pick<Mapping, 'kind' | 'num'>) => `${m.kind === 'note' ? 'NOTE' : 'CC'} ${m.num}`;
