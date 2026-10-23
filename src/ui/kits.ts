// Kits panel (Kits.dc.html): category chips, kit list, pad picker with volume/pitch/pan/decay,
// SAVE and LOAD PRESET. Built once; render functions only update what a state change touched.

import type { AudioEngine } from '../audio/engine';
import { GROUP_COLOUR, PADS_PER_BANK, PARAM_RANGE, padLabel, type PadDef, type ParamKey } from '../audio/kit';
import { CATEGORIES, KITS, allPads, findKit } from '../audio/kits';
import { ImportError, MAX_SECONDS, importFile, isUserSample, removeSample, sampleLabel, type UserSampleInfo } from '../audio/userSamples';
import { deleteKit, selectKit, setParam, swapSample } from '../kitControl';
import { state, subscribe, update, type Change } from '../state';
import { PARAM_LABEL, formatParam } from './format';
import { escapeHtml, openDialog } from './dialog';
import { openSaveKitDialog } from './saveKit';
import { openShareDialog } from './share';

type Category = 'All' | (typeof CATEGORIES)[number] | 'My kits';
const CHIPS: Category[] = ['All', ...CATEGORIES, 'My kits'];
const PARAMS: ParamKey[] = ['volumeDb', 'pitch', 'pan', 'decay', 'reverbSend', 'delaySend'];

const PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>';
const TRASH =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

const NO_SAMPLES = 'No imported samples yet. Tap IMPORT FILE to add one from the phone or PC.';

interface Row {
  id: string;
  name: string;
  meta: string;
  user: boolean;
  dots: string[];
}

export function buildKitsPanel(app: HTMLElement, engine: AudioEngine): void {
  const panel = document.createElement('section');
  panel.className = 'kits-panel';
  panel.setAttribute('aria-label', 'Kits and presets');
  panel.innerHTML = `
    <header class="kp-head">
      <h1>KITS</h1>
      <div class="kp-actions">
        <button class="kp-btn kp-share">SHARE</button>
        <button class="kp-btn kp-load">LOAD PRESET</button>
        <button class="kp-btn primary kp-save">SAVE</button>
      </div>
    </header>
    <div class="kp-cats" role="group" aria-label="Kit categories">
      ${CHIPS.map((c) => `<button class="kp-chip" data-cat="${c}" aria-pressed="false">${c}</button>`).join('')}
    </div>
    <div class="kp-list" role="list" aria-label="Kits"></div>
    <section class="kp-pad" aria-label="Pad settings">
      <div class="kp-pick">
        <div class="kp-label">PICK PAD</div>
        <div class="kp-grid" role="group" aria-label="Pads">
          ${Array.from({ length: 16 }, (_, i) => `<button class="kp-cell" data-pad="${i}" aria-pressed="false"></button>`).join('')}
        </div>
        <button class="kp-btn kp-swap">SWAP SAMPLE</button>
      </div>
      <div class="kp-sliders">
        <div class="kp-title"></div>
        <div class="kp-sample"></div>
        ${PARAMS.map((k) => {
          const r = PARAM_RANGE[k];
          return `<label class="kp-slider" data-learn="param:${k}">
            <span class="kp-slider-top"><span>${PARAM_LABEL[k]}</span><span class="kp-val" data-val="${k}"></span></span>
            <input type="range" data-key="${k}" min="${r.min}" max="${r.max}" step="${r.step}">
          </label>`;
        }).join('')}
      </div>
    </section>`;
  app.appendChild(panel);

  // One hidden file picker for IMPORT FILE (opened from the swap dialog).
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac';
  fileInput.hidden = true;
  panel.appendChild(fileInput);
  let onFile: ((file: File) => void) | null = null;
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) onFile?.(file);
  });

  const $ = <T extends Element>(sel: string) => panel.querySelector(sel) as T;
  const list = $<HTMLElement>('.kp-list');
  const cells = [...panel.querySelectorAll<HTMLButtonElement>('.kp-cell')];
  const inputs = [...panel.querySelectorAll<HTMLInputElement>('.kp-slider input')];
  let category: Category = 'All';
  let loadingId: string | null = null;

  // ---------- kit list ----------

  function rows(): Row[] {
    const factory: Row[] = KITS.map((k) => ({
      id: k.id,
      name: k.name,
      meta: `${k.category} · 4 banks`,
      user: false,
      dots: k.pads.slice(0, PADS_PER_BANK).map((p) => GROUP_COLOUR[p.group]),
    }));
    const user: Row[] = state.userKits.map((u) => ({
      id: u.id,
      name: u.name,
      meta: `My kit · ${savedWhen(u.savedAt)}`,
      user: true,
      dots: u.pads.slice(0, PADS_PER_BANK).map((p) => GROUP_COLOUR[p.group]),
    }));
    if (category === 'All') return [...factory, ...user];
    if (category === 'My kits') return user;
    return factory.filter((r) => findKit(r.id)?.category === category);
  }

  function tag(r: Row): string {
    if (r.id === loadingId) return 'LOADING';
    if (r.id === state.kit?.id) return state.edited ? 'EDITED' : 'LOADED';
    return r.user ? 'USER' : '';
  }

  function renderList(): void {
    const items = rows();
    list.innerHTML = items.length
      ? items
          .map(
            (r) => `
      <div class="kp-row" role="listitem" aria-current="${r.id === state.kit?.id}">
        <button class="kp-kit" data-kit="${r.id}">
          <span class="kp-dots" aria-hidden="true">${r.dots.map((c) => `<span style="background:${c}"></span>`).join('')}</span>
          <span class="kp-kit-text"><span class="kp-kit-name">${escapeHtml(r.name)}</span><span class="kp-kit-meta">${r.meta}</span></span>
          <span class="kp-tag">${tag(r)}</span>
        </button>
        ${r.user ? `<button class="kp-del" data-del="${r.id}" aria-label="Delete ${escapeHtml(r.name)}">${TRASH}</button>` : ''}
      </div>`,
          )
          .join('')
      : `<p class="kp-empty">No saved kits yet. Change a kit, then tap SAVE.</p>`;
  }

  function renderChips(): void {
    for (const b of panel.querySelectorAll<HTMLButtonElement>('.kp-chip')) {
      b.setAttribute('aria-pressed', String(b.dataset.cat === category));
    }
  }

  // ---------- pad section ----------

  function renderPad(): void {
    const kit = state.kit;
    if (!kit) return;
    const i = state.selectedPad;
    const pad = kit.pads[i];
    const p = kit.params[i];
    cells.forEach((c, n) => {
      const index = state.bank * PADS_PER_BANK + n; // the picker shows the bank on screen
      c.dataset.pad = String(index);
      c.style.setProperty('--c', GROUP_COLOUR[kit.pads[index].group]);
      c.setAttribute('aria-label', `Pad ${padLabel(index)}, ${kit.pads[index].name}`);
      c.setAttribute('aria-pressed', String(index === i));
    });
    $('.kp-title').textContent = `PAD ${padLabel(i)} · ${pad.name.toUpperCase()}`;
    $('.kp-sample').textContent = isUserSample(pad.hard)
      ? `MY SAMPLE · ${sampleLabel(pad.hard)}${engine.padMissing(i) ? ' (MISSING)' : ''}`
      : pad.hard;
    const seconds = engine.sampleDuration(pad.hard);
    for (const input of inputs) {
      const key = input.dataset.key as ParamKey;
      if (input.value !== String(p[key])) input.value = String(p[key]);
      $(`[data-val="${key}"]`).textContent = formatParam(key, p, seconds);
    }
  }

  // ---------- events ----------

  panel.addEventListener('click', async (e) => {
    const t = (e.target as Element).closest('button');
    if (!t) return;

    if (t.dataset.cat) {
      category = t.dataset.cat as Category;
      renderChips();
      renderList();
    } else if (t.dataset.kit) {
      await pickKit(t.dataset.kit);
    } else if (t.dataset.del) {
      const row = state.userKits.find((u) => u.id === t.dataset.del);
      if (row && (await confirmDelete(row.name))) await deleteKit(row.id);
    } else if (t.dataset.pad) {
      const i = Number(t.dataset.pad);
      update({ selectedPad: i });
      engine.play(i, 100); // audition
    } else if (t.classList.contains('kp-swap')) {
      await askSwap();
    } else if (t.classList.contains('kp-save')) {
      await openSaveKitDialog();
    } else if (t.classList.contains('kp-share')) {
      await openShareDialog();
    } else if (t.classList.contains('kp-load')) {
      category = 'My kits';
      renderChips();
      renderList();
    }
  });

  panel.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.key) setParam(state.selectedPad, input.dataset.key as ParamKey, Number(input.value));
  });
  // Play the pad when a slider is let go, so the change can be heard.
  panel.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).dataset.key) engine.play(state.selectedPad, 100);
  });

  async function pickKit(id: string): Promise<void> {
    if (id === state.kit?.id && !state.edited) return;
    if (state.edited && !(await confirmDiscard())) return;
    loadingId = id;
    renderList();
    try {
      await selectKit(id);
    } catch (err) {
      console.error(err);
    } finally {
      loadingId = null;
      renderList();
    }
  }

  // ---------- dialogs ----------

  function userRow(s: UserSampleInfo, current: string): string {
    return `<div class="sw-row${s.id === current ? ' current' : ''}" data-row="${s.id}">
      <button type="button" class="sw-play" data-preview="${s.id}" aria-label="Preview ${escapeHtml(s.name)}">${PLAY}</button>
      <button value="pick:${s.id}" class="sw-pick">${escapeHtml(s.name)} <span class="sw-len">${s.seconds.toFixed(1)} s</span></button>
      <button type="button" class="sw-del" data-del-sample="${s.id}" aria-label="Delete ${escapeHtml(s.name)}">${TRASH}</button>
    </div>`;
  }

  async function askSwap(): Promise<void> {
    const kit = state.kit;
    if (!kit) return;
    const index = state.selectedPad;
    const current = kit.pads[index].hard;
    const mine = state.userSamples.length
      ? state.userSamples.map((s) => userRow(s, current)).join('')
      : `<p class="sw-empty">${NO_SAMPLES}</p>`;
    const seen = new Set<string>();
    // Every built-in sample, grouped by the kit (bank A) or shared bank it comes from.
    const sources: [title: string, pads: PadDef[]][] = [
      ...KITS.map((k): [string, PadDef[]] => [k.name, k.pads]),
      ...(['B', 'C', 'D'] as const).map((b, n): [string, PadDef[]] => [
        `Bank ${b}`,
        allPads(KITS[0]).slice((n + 1) * PADS_PER_BANK, (n + 2) * PADS_PER_BANK),
      ]),
    ];
    const groups = sources.map(([title, pads]) => {
      const names = pads.flatMap((p) => (p.soft ? [p.soft, p.hard] : [p.hard])).filter((n) => !seen.has(n) && seen.add(n));
      return names.length
        ? `<div class="sw-kit">${escapeHtml(title.toUpperCase())}</div>` +
            names
              .map(
                (n) => `<div class="sw-row${n === current ? ' current' : ''}">
                  <button type="button" class="sw-play" data-preview="${n}" aria-label="Preview ${n}">${PLAY}</button>
                  <button value="pick:${n}" class="sw-pick">${n}</button>
                </div>`,
              )
              .join('')
        : '';
    }).join('');
    const res = await openDialog(
      `<h2>SWAP SAMPLE · ${escapeHtml(kit.pads[index].name.toUpperCase())}</h2>
      <div class="sw-top">
        <button type="button" class="kp-btn sw-import">IMPORT FILE…</button>
        <p class="sw-msg" role="status">WAV, MP3, FLAC, OGG or M4A, up to ${MAX_SECONDS} s. Silence is trimmed and the level evened out.</p>
      </div>
      <div class="sw-list">
        <div class="sw-kit">MY SAMPLES</div>
        <div class="sw-mine">${mine}</div>
        ${groups}
      </div>
      <div class="dlg-btns"><button value="cancel" class="kp-btn">CANCEL</button></div>`,
      (btn) => {
        const dialog = btn.closest('dialog')!;
        const msg = dialog.querySelector<HTMLElement>('.sw-msg')!;
        if (btn.dataset.preview) engine.preview(btn.dataset.preview).catch(console.error);
        else if (btn.dataset.delSample) void removeMine(btn.dataset.delSample, dialog, msg);
        else if (btn.classList.contains('sw-import')) {
          // The file picker answers later, through the input's change event.
          onFile = (file) => void importInto(file, btn, dialog, msg);
          fileInput.value = '';
          fileInput.click();
        }
      },
    );
    onFile = null;
    if (res.value.startsWith('pick:')) {
      const sample = res.value.slice(5);
      await swapSample(index, sample, isUserSample(sample) ? sampleLabel(sample) : undefined);
      engine.play(index, 100);
    }
  }

  /** Imports a file chosen in the swap dialog, then puts it straight on the pad. */
  async function importInto(file: File, btn: HTMLButtonElement, dialog: HTMLDialogElement, msg: HTMLElement): Promise<void> {
    btn.disabled = true;
    msg.textContent = `IMPORTING ${file.name}…`;
    try {
      const added = await importFile(file);
      if (dialog.open) dialog.close(`pick:${added.id}`);
    } catch (err) {
      if (!(err instanceof ImportError)) console.error(err);
      msg.textContent = err instanceof ImportError ? err.message : "That file couldn't be imported.";
    } finally {
      btn.disabled = false;
    }
  }

  async function removeMine(id: string, dialog: HTMLDialogElement, msg: HTMLElement): Promise<void> {
    const name = sampleLabel(id);
    const users = await removeSample(id).catch((err: unknown) => (console.error(err), null));
    if (users === null) msg.textContent = `“${name}” couldn't be deleted.`;
    else if (users.length) msg.textContent = `“${name}” is used by ${users.join(', ')}. Swap it off ${users.length > 1 ? 'those kits' : 'that kit'} first.`;
    else {
      dialog.querySelector(`[data-row="${id}"]`)?.remove();
      const box = dialog.querySelector('.sw-mine')!;
      if (!box.children.length) box.innerHTML = `<p class="sw-empty">${NO_SAMPLES}</p>`;
      msg.textContent = `Deleted “${name}”.`;
    }
  }

  async function confirmDelete(name: string): Promise<boolean> {
    const res = await openDialog(`
      <h2>DELETE KIT</h2>
      <p>Delete “${escapeHtml(name)}”? This can't be undone.</p>
      <div class="dlg-btns">
        <button value="cancel" class="kp-btn">CANCEL</button>
        <button value="ok" class="kp-btn danger">DELETE</button>
      </div>`);
    return res.value === 'ok';
  }

  async function confirmDiscard(): Promise<boolean> {
    const res = await openDialog(`
      <h2>UNSAVED CHANGES</h2>
      <p>Switching kits drops the changes to “${escapeHtml(state.kit?.name ?? '')}”.</p>
      <div class="dlg-btns">
        <button value="cancel" class="kp-btn">CANCEL</button>
        <button value="ok" class="kp-btn primary">SWITCH</button>
      </div>`);
    return res.value === 'ok';
  }

  // ---------- state ----------

  subscribe((_s, changed: ReadonlySet<Change>) => {
    if (changed.has('kit') || changed.has('edited') || changed.has('userKits')) renderList();
    if (['kit', 'params', 'pads', 'selectedPad', 'bank', 'userSamples'].some((c) => changed.has(c as Change))) renderPad();
  });
  renderChips();
  renderList();
  renderPad();
}

function savedWhen(t: number): string {
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) return 'saved today';
  return `saved ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}
