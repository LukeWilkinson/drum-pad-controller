// Pedalboard check, run in the browser on the dev server (Web Audio needs a browser):
//
//   const { run } = await import('/scripts/pedal-check.js'); await run();
//
// Renders test signals offline through src/audio/pedals.ts and measures them:
// - all pedals off: output identical, sample for sample, to no chain at all
// - drive and amp: harmonic distortion (THD) of a 440 Hz sine rises with DRIVE / GAIN
// - crush: 4 bits at full MIX leaves at most 2^4 + 1 sample values
// - level: each pedal (and knob extremes) against bypass on a sawtooth A minor chord at KEYS-like
//   level; within ±LEVEL_DB passes
// - chain order: every pedal on is wired in the fixed order
// Returns { ok, failures, report } and logs the report table. run({ id, k: [[k0, k1], …] }) only returns
// that pedal's levels against bypass, for tuning.

const SR = 48000;
const LEN = SR * 1.5;
const LEVEL_DB = 3;

export async function run(probe) {
  const toneUrl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\.vite\/deps\/tone\.js/.test(n));
  const Tone = await import(/* @vite-ignore */ toneUrl);
  const { PedalChain } = await import('/src/audio/pedals.ts');
  const P = await import('/src/keys/pedals.ts');

  async function render(board, { chain = true, sig = 'sine' } = {}) {
    const off = new OfflineAudioContext(2, LEN, SR);
    const ctx = new Tone.Context({ context: off });
    const head = off.createGain();
    const tail = off.createGain();
    const oscs = [];
    if (sig === 'sine') {
      const o = off.createOscillator();
      o.frequency.value = 440;
      const g = off.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(head);
      oscs.push(o);
    } else {
      const lp = off.createBiquadFilter();
      lp.frequency.value = 3000;
      lp.connect(head);
      for (const f of [220, 261.63, 329.63]) {
        const o = off.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const g = off.createGain();
        g.gain.value = 0.07;
        o.connect(g).connect(lp);
        oscs.push(o);
      }
    }
    tail.connect(off.destination);
    let c = null;
    if (chain) {
      c = new PedalChain(head, tail, ctx);
      c.set(board, false);
    } else head.connect(tail);
    await new Promise((r) => setTimeout(r, 300)); // the crusher's worklet loads
    for (const o of oscs) o.start(0);
    const buf = await off.startRendering();
    return { x: buf.getChannelData(0), active: c?.active ?? [] };
  }

  const from = (x) => Math.floor(x.length / 3); // skip the start (LFOs start 0.1 s in)
  const goertzel = (x, f) => {
    const w = (2 * Math.PI * f) / SR;
    let re = 0;
    let im = 0;
    for (let i = from(x); i < x.length; i++) {
      re += x[i] * Math.cos(w * i);
      im -= x[i] * Math.sin(w * i);
    }
    return Math.hypot(re, im);
  };
  const rmsDb = (x) => {
    let s = 0;
    for (let i = from(x); i < x.length; i++) s += x[i] * x[i];
    return 10 * Math.log10(s / (x.length - from(x)));
  };
  const thd = (x) => {
    const h = [1, 2, 3, 4, 5, 6, 7].map((k) => goertzel(x, 440 * k));
    return (100 * Math.hypot(...h.slice(1))) / h[0];
  };
  const one = (id, k) => {
    const b = P.defaultBoard('synth:0');
    b[id] = { on: true, k: k ?? b[id].k };
    return b;
  };
  if (probe) {
    // Tuning aid: level against bypass (dB) of one pedal at each knob setting in `probe.k` (a list of [k0, k1]).
    const refC = rmsDb((await render(P.defaultBoard('synth:0'), { chain: false, sig: 'chord' })).x);
    const out = [];
    for (const k of probe.k) out.push(+(rmsDb((await render(one(probe.id, k), { sig: 'chord' })).x) - refC).toFixed(2));
    return out;
  }

  const failures = [];
  const report = [];
  const check = (name, value, ok) => {
    report.push({ check: name, value: typeof value === 'number' ? +value.toFixed(2) : value, ok });
    if (!ok) failures.push(name);
  };

  const plain = P.defaultBoard('synth:0');
  const ref = (await render(plain, { chain: false })).x;
  const byp = (await render(plain)).x;
  let diff = 0;
  for (let i = 0; i < ref.length; i++) diff = Math.max(diff, Math.abs(ref[i] - byp[i]));
  check('bypass max sample difference', diff, diff === 0);

  for (const id of ['drive', 'amp']) {
    const t = [];
    for (const v of [0, 0.4, 1]) t.push(thd((await render(one(id, [v, 12000]))).x));
    check(`${id} THD % at 0 / 0.4 / 1`, t.map((v) => v.toFixed(1)).join(' / '), t[0] < t[1] && t[1] < t[2] && t[2] > 20);
  }

  const crushed = (await render(one('crush', [4, 1]))).x;
  const values = new Set();
  // Rounded: the equal-power crossfade leaves the dry signal in at about 6e-17 at full MIX.
  for (let i = from(crushed); i < crushed.length; i++) values.add(Math.round(crushed[i] * 1e6));
  check('crush 4 bits: distinct sample values', values.size, values.size <= 17);

  const refChord = rmsDb((await render(plain, { chain: false, sig: 'chord' })).x);
  const level = async (name, board) => {
    const d = rmsDb((await render(board, { sig: 'chord' })).x) - refChord;
    check(`level ${name} (dB)`, d, Math.abs(d) <= LEVEL_DB);
  };
  for (const p of P.PEDALS) {
    await level(`${p.id} default`, one(p.id));
    for (const i of [0, 1]) {
      const k = p.knobs[i];
      if (p.id === 'comp' && i === 1) continue; // LEVEL is a volume knob
      if (p.id === 'tremolo' && i === 1) continue; // DEPTH is how much it dips
      for (const n of [0, 1]) {
        const ks = [...plain[p.id].k];
        ks[i] = k.scale.from(n);
        await level(`${p.id} ${k.label} ${n ? 'max' : 'min'}`, one(p.id, ks));
      }
    }
  }

  const all = P.defaultBoard('synth:0');
  for (const id of P.PEDAL_IDS) all[id].on = true;
  const order = (await render(all)).active.join();
  check('chain order', order, order === P.PEDAL_IDS.join());

  console.table(report);
  return { ok: failures.length === 0, failures, report };
}
