// One shared modal <dialog>. openDialog() fills it with a form and resolves with the button pressed
// (its value; "cancel" for Esc or a tap outside) and the form's text fields.

export interface DialogResult {
  value: string;
  fields: Record<string, string>;
}

let dlg: HTMLDialogElement | null = null;

/** `onButton` gets clicks on type="button" buttons (which don't close the dialog), e.g. a preview. */
export function openDialog(formHtml: string, onButton?: (btn: HTMLButtonElement) => void): Promise<DialogResult> {
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    document.body.appendChild(dlg);
    // A tap on the backdrop (outside the form) cancels.
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg!.close('cancel');
    });
  }
  const d = dlg;
  d.innerHTML = `<form method="dialog">${formHtml}</form>`;
  d.returnValue = 'cancel';
  d.showModal();
  d.querySelector<HTMLInputElement>('input')?.select();
  const form = d.querySelector('form')!;
  if (onButton) {
    form.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button[type="button"]');
      if (btn) onButton(btn);
    });
  }
  // Enter in a text field means the primary button (not the first button, which is CANCEL).
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      d.querySelector<HTMLButtonElement>('button.primary')?.click();
    }
  });

  return new Promise((resolve) => {
    d.addEventListener(
      'close',
      () => {
        const fields: Record<string, string> = {};
        for (const input of d.querySelectorAll<HTMLInputElement>('input[name]')) fields[input.name] = input.value;
        resolve({ value: d.returnValue || 'cancel', fields });
      },
      { once: true },
    );
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
