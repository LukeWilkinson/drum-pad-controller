// WAV export controls: the REC OUT button (MIX header), the BOUNCE dialog (SEQ loop picker), the
// status bar shown on every tab while recording (with STOP), and the dialog that saves a finished
// take. SHARE / SAVE FILE are their own taps because the phone's share sheet only opens from one.
// The recording itself is src/audio/recorder.ts.

import * as recorder from '../audio/recorder';
import { deliver } from '../share/deliver';
import { state, subscribe } from '../state';
import { escapeHtml, openDialog } from './dialog';
import { shareButtons } from './share';

const PASSES = [1, 2, 4];

export function initRecordUi(app: HTMLElement): void {
  const bar = document.createElement('div');
  bar.className = 'rec-bar';
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  bar.innerHTML = `<span class="rec-dot" aria-hidden="true"></span><span class="rec-text"></span><button class="rec-stop">STOP</button>`;
  app.appendChild(bar);
  const text = bar.querySelector<HTMLElement>('.rec-text')!;
  bar.querySelector('.rec-stop')!.addEventListener('click', recorder.stopRecording);

  const outBtn = app.querySelector<HTMLButtonElement>('.mx-rec');
  outBtn?.addEventListener('click', () => void run(recorder.toggleRecordOut));

  let timer = 0;
  const showTime = () => {
    const s = Math.max(0, Math.floor((performance.now() - state.recorder.since) / 1000));
    text.textContent = `${state.recorder.label} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  subscribe((s, changed) => {
    if (!changed.has('recorder')) return;
    const on = s.recorder.mode !== 'off';
    bar.hidden = !on;
    app.toggleAttribute('data-rec-on', on);
    outBtn?.setAttribute('aria-pressed', String(s.recorder.mode === 'out'));
    clearInterval(timer);
    if (on) {
      showTime();
      timer = window.setInterval(showTime, 250);
    }
  });

  recorder.onTake((take) => void offerTake(take));
}

/** BOUNCE TO WAV (SEQ loop picker): pick how many passes, then bounce the loop playing now. */
export async function openBounceDialog(): Promise<void> {
  const loop = state.pattern + 1;
  const res = await openDialog(`
    <h2>BOUNCE LOOP ${loop} TO WAV</h2>
    <p>Plays loop ${loop} from bar 1 and records it, then the reverb and delay tails. The metronome isn't recorded; pads played meanwhile are.</p>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">CANCEL</button>
      ${PASSES.map((n) => `<button value="${n}" class="kp-btn${n === 1 ? ' primary' : ''}">${n} × LOOP</button>`).join('')}
    </div>`);
  const passes = Number(res.value);
  if (PASSES.includes(passes)) await run(() => recorder.bounceLoop(passes));
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    if (!(err instanceof recorder.RecordError)) console.error(err);
    await openDialog(`<h2>RECORD</h2><p>${escapeHtml(err instanceof recorder.RecordError ? err.message : "The recording couldn't start.")}</p>
      <div class="dlg-btns"><button value="ok" class="kp-btn primary">OK</button></div>`);
  }
}

async function offerTake(take: recorder.Take): Promise<void> {
  const s = Math.round(take.seconds);
  const mb = (take.blob.size / 1024 / 1024).toFixed(1);
  // A dialog already open (rare: a take finishing while one is shown) waits for that one to close.
  while (document.querySelector('dialog[open]')) await new Promise((r) => setTimeout(r, 300));
  await openDialog(
    `<h2>RECORDING READY</h2>
    <p class="rec-file">${escapeHtml(take.name)}<br>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ${mb} MB · WAV</p>
    <p class="sh-msg" role="status"></p>
    <div class="dlg-btns">
      <button value="cancel" class="kp-btn">DISCARD</button>
      ${shareButtons('data-take', true)}
    </div>`,
    (btn) => {
      if (!btn.hasAttribute('data-take')) return;
      const dialog = btn.closest('dialog')!;
      const msg = dialog.querySelector<HTMLElement>('.sh-msg')!;
      btn.disabled = true;
      deliver(take.blob, take.name, btn.dataset.how === 'download' ? 'download' : 'share')
        .then((how) => {
          if (how === 'cancelled') {
            btn.disabled = false;
            return;
          }
          dialog.close('saved');
        })
        .catch((err: unknown) => {
          console.error(err);
          msg.textContent = "The file couldn't be saved.";
          btn.disabled = false;
        });
    },
  );
}
