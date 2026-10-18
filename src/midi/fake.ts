// Dev-only fake MIDI, switched on by adding ?fakemidi to the URL. The browser pane has no MIDI
// devices, so this stands in for Web MIDI: it logs everything the app sends and lets a script
// inject input, plug and unplug devices. Only imported under import.meta.env.DEV (midi.ts).
//
//   __fakeMidi.log                       sent messages: { t (performance.now ms), ts (timestamp passed), port, data }
//   __fakeMidi.inject('Fake MIDI In', [0x99, 36, 100])
//   __fakeMidi.unplug('Fake MIDI Out') / .plug('Fake MIDI Out')
//   __fakeMidi.clearLog()

import type { AccessLike, InLike, OutLike } from './types';

interface Sent {
  t: number;
  ts: number | undefined;
  port: string;
  data: number[];
}

export function createFakeAccess(): AccessLike {
  const log: Sent[] = [];

  const out = (name: string): OutLike => ({
    id: `fake-out-${name}`,
    name,
    state: 'connected',
    send(data, ts) {
      log.push({ t: performance.now(), ts, port: name, data: [...data] });
    },
  });
  const inp = (name: string): InLike => ({ id: `fake-in-${name}`, name, state: 'connected', onmidimessage: null });

  const outputs = [out('Fake MIDI Out'), out('Fake MIDI Out 2')];
  const inputs = [inp('Fake MIDI In')];

  const access: AccessLike = {
    outputs: { values: () => outputs.values() },
    inputs: { values: () => inputs.values() },
    onstatechange: null,
  };

  const setState = (name: string, state: 'connected' | 'disconnected') => {
    for (const p of [...outputs, ...inputs]) if (p.name === name) p.state = state;
    access.onstatechange?.();
  };

  Object.assign(window, {
    __fakeMidi: {
      log,
      clearLog: () => void (log.length = 0),
      inject(name: string, bytes: number[]) {
        const port = inputs.find((i) => i.name === name && i.state === 'connected');
        port?.onmidimessage?.({ data: new Uint8Array(bytes) });
        return !!port?.onmidimessage;
      },
      plug: (name: string) => setState(name, 'connected'),
      unplug: (name: string) => setState(name, 'disconnected'),
    },
  });
  return access;
}
