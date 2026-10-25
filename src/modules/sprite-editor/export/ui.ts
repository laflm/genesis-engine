import { CONFIG } from '../../../config';
import { deserializeProject, serializeProject } from '../project-io';
import { assetToExportItem } from '../model';
import { session, setSession, Session } from '../session';
import { bus } from '../../../core/events';
import { h, modal, toast } from '../ui/dom';
import { planExport } from './build';
import { getTarget } from './targets';

export function openExportDialog(): void {
  const partial = h('input', { type: 'checkbox' }), out = h('div', { class: 'exp-out' }, 'Analyse…');
  let go: HTMLButtonElement | undefined;
  const run = async (): Promise<void> => {
    const items = await Promise.all([...session.project.assets.values()].map((a) => assetToExportItem(a, session.adapter)));
    const plan = planExport(items, session.adapter, session.project.customSkins, { partial: partial.checked, basePack: session.project.basePack });
    out.replaceChildren(
      h('p', {}, `${plan.items.length} fichier(s) PNG dans le ZIP (${plan.files.length} fichiers au total).`),
      plan.issues.length ? h('ul', { class: 'issues' }, ...plan.issues.map((i) => h('li', { class: i.level }, `${i.level === 'error' ? '⛔' : '⚠️'} ${i.key ? `[${i.key}] ` : ''}${i.message}`))) : h('p', { class: 'ok' }, '✓ Aucun problème détecté.'),
      h('small', {}, 'Contenu : ' + plan.files.map((f) => f.path).join(', ')));
    if (go) go.disabled = plan.blocked;
    (out as HTMLElement & { plan?: typeof plan }).plan = plan;
  };
  partial.addEventListener('change', () => void run());
  const m = modal('Exporter', h('div', {}, h('label', { class: 'inl' }, partial, ' Export partiel : seulement les sprites modifiés/créés (pas les importés intacts)'), out), [
    { label: 'Annuler', onClick: () => {} },
    { label: 'Télécharger le ZIP', primary: true, onClick: async () => {
      const plan = (out as HTMLElement & { plan?: ReturnType<typeof planExport> }).plan; if (!plan || plan.blocked) return false;
      await getTarget('zip')!.deliver(plan.files, { baseName: `${session.adapter.id}-${CONFIG.export.baseName}` }); toast('Export prêt');
    } },
  ]);
  go = m.buttons[1]!; go.disabled = true; void run();
}

export function openProjectDialog(): void {
  const name = h('input', { type: 'text', value: session.project.name, 'aria-label': 'Nom du projet' });
  modal('Projet', h('div', {}, h('label', { class: 'lbl' }, 'Nom ', name), h('p', { class: 'hint' }, 'Le projet est sauvegardé automatiquement dans ce navigateur. Exporte un fichier .genesis pour le garder ailleurs (calques conservés).')), [
    { label: 'Fermer', onClick: () => {} },
    { label: 'Ouvrir un projet…', onClick: () => {
      const inp = h('input', { type: 'file', accept: '.genesis,.zip' });
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0]; if (!f) return;
        try { const p = await deserializeProject(new Uint8Array(await f.arrayBuffer()), session.adapter); const s = new Session(session.adapter, p); setSession(s); bus.emit('project:changed'); bus.emit('asset:selected'); toast('Projet ouvert'); }
        catch (e) { toast((e as Error).message); }
      }); inp.click();
    } },
    { label: 'Exporter le projet (.genesis)', primary: true, onClick: async () => {
      session.project.name = name.value.trim().replace(/[^a-z0-9_-]+/gi, '_') || 'projet';
      const bytes = await serializeProject(session.project);
      const a = h('a', { href: URL.createObjectURL(new Blob([bytes as BlobPart])), download: `${session.project.name}.genesis` }); document.body.appendChild(a); a.click(); a.remove();
    } },
  ]);
}
