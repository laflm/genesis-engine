type Kid = Node | string | null | false | undefined;
/** Mini-helper DOM : h('button', {class:'x', onclick: fn}, 'texte'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'value') (el as unknown as HTMLInputElement).value = String(v);
    else if (k === 'checked') (el as unknown as HTMLInputElement).checked = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== false && k !== undefined) el.append(k);
  return el;
}

export interface ModalBtn { label: string; primary?: boolean; disabled?: boolean; onClick: () => void | boolean | Promise<void | boolean> }
/** Fenêtre modale. Un bouton dont le handler renvoie `false` ne ferme pas la fenêtre. */
export function modal(title: string, body: HTMLElement, buttons: ModalBtn[] = [{ label: 'Fermer', onClick: () => {} }], wide = false): { close(): void; el: HTMLElement; buttons: HTMLButtonElement[] } {
  const bs = buttons.map((b) => h('button', { class: `btn${b.primary ? ' primary' : ''}`, disabled: b.disabled },
    b.label));
  const box = h('div', { class: `modal-box${wide ? ' wide' : ''}`, role: 'dialog' }, h('h2', {}, title), h('div', { class: 'modal-body' }, body), h('div', { class: 'modal-actions' }, ...bs));
  const ov = h('div', { class: 'modal' }, box);
  const close = (): void => ov.remove();
  bs.forEach((b, i) => b.addEventListener('click', async () => { const r = await buttons[i]!.onClick(); if (r !== false) close(); }));
  document.body.appendChild(ov);
  return { close, el: box, buttons: bs };
}

export function toast(msg: string): void {
  const t = h('div', { class: 'toast' }, msg); document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2700);
}

/**
 * Ouvre le sélecteur de fichiers. Sur iPad/Safari : l'input DOIT être dans la page (sinon `change` peut ne jamais
 * arriver) et un filtre `accept` sur une extension inconnue (.genesis) grise les fichiers : on n'en met donc que pour
 * des types standard, et chaque appelant valide le CONTENU du fichier.
 */
export function pickFiles(opts: { accept?: string; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = h('input', { type: 'file', multiple: opts.multiple, accept: opts.accept, style: 'position:fixed;left:-9999px;opacity:0;width:1px;height:1px' });
    const done = (files: File[]): void => { resolve(files); setTimeout(() => inp.remove(), 1000); };
    inp.addEventListener('change', () => done([...(inp.files ?? [])]));
    inp.addEventListener('cancel', () => done([]));
    document.body.appendChild(inp);
    inp.click();
  });
}
