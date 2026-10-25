import { bus } from '../../../core/events';
import type { ImportReport } from '../../../shared/types';
import { canvasToPng, decodeImage, makeCanvas } from '../canvas/pixels';
import { flattenAsset, type Asset } from '../model';
import { session } from '../session';
import { h, modal, pickFiles, toast } from '../ui/dom';
import { applyBackground, buildAssetFromImage, suggestBackground, type BgOptions } from './fit';
import { diagnose, type FitDiagnosis, type FitMode } from './fitPlan';
import { collectImport } from './importers';
import { matchEntries, baseName, type MatchResult } from './matcher';
import { CONFIG } from '../../../config';

interface Row {
  m: MatchResult; src: HTMLCanvasElement; key: string; diag: FitDiagnosis | null; mode: FitMode;
  bg: BgOptions; bgSuggested: boolean;
}

export async function pickAndImport(): Promise<void> {
  const files = await pickFiles({ multiple: true });
  if (files.length) await importFiles(files);
}

export async function importFiles(files: File[]): Promise<void> {
  const raw = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
  const ci = await collectImport(raw);
  if (ci.pack) session.project.basePack = { sheets: { ...session.project.basePack?.sheets, ...ci.pack.sheets }, sprites: { ...session.project.basePack?.sprites, ...ci.pack.sprites } };
  const matches = matchEntries(ci.entries, session.adapter, ci.packMap, session.project.customSkins.map((s) => s.key));
  const rows: Row[] = [];
  for (const m of matches) {
    let src: HTMLCanvasElement;
    try { src = await decodeImage(m.entry.bytes); } catch { ci.ignored.push(`${baseName(m.entry.name)} : image illisible par le navigateur.`); continue; }
    const col = suggestBackground(src);
    const r: Row = { m, src, key: m.key ?? '', diag: null, mode: 'exact', bgSuggested: !!col, bg: { enabled: !!col, color: col ?? { r: 255, g: 255, b: 255 }, tolerance: CONFIG.import.bgTolerance, contiguous: true } };
    refreshDiag(r); rows.push(r);
  }
  if (!rows.length) { showReport({ accepted: [], ignored: ci.ignored, corrected: [], warnings: ci.warnings }); return; }
  openMatchDialog(rows, ci.ignored, ci.warnings);
}

function refreshDiag(r: Row): void {
  const spec = r.key ? session.project.spec(r.key) : undefined;
  r.diag = spec ? diagnose(spec, session.adapter, r.src.width, r.src.height) : null;
  r.mode = r.diag ? r.diag.recommended : 'exact';
}

function rendered(r: Row): { asset: Asset; notes: string[] } | null {
  const spec = r.key ? session.project.spec(r.key) : undefined; if (!spec) return null;
  const src = applyBackground(r.src, r.bg);
  return buildAssetFromImage(spec, session.adapter, src, { mode: r.mode, smooth: CONFIG.import.smoothScale });
}

function openMatchDialog(rows: Row[], ignored: string[], warnings: string[]): void {
  const keys = [...session.adapter.specs.map((s) => s.key), ...session.project.customSkins.map((s) => s.key)];
  const list = h('div', { class: 'imp-list' });
  const draw = (): void => {
    list.replaceChildren(...rows.map((r) => {
      const before = h('canvas', { class: 'imp-thumb' }), after = h('canvas', { class: 'imp-thumb' });
      const fitCanvas = (src: HTMLCanvasElement, cv: HTMLCanvasElement): void => { const k = Math.min(120 / src.width, 90 / src.height, 1); cv.width = Math.max(1, src.width * k); cv.height = Math.max(1, src.height * k); cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height); };
      fitCanvas(r.src, before);
      let note = r.m.note ?? '';
      try { const out = rendered(r); if (out) { fitCanvas(flattenAsset(out.asset, session.adapter), after); if (out.notes.length) note += ` ${out.notes.join(' ; ')}.`; } else fitCanvas(makeCanvas(1, 1), after); } catch (e) { note += ` Erreur : ${(e as Error).message}`; }
      const keySel = h('select', { 'aria-label': 'Clé du jeu' }, h('option', { value: '' }, '— ignorer —'), ...keys.map((k) => h('option', { value: k, selected: k === r.key }, k)));
      keySel.addEventListener('change', () => { r.key = keySel.value; refreshDiag(r); draw(); });
      const modeSel = r.diag && !r.diag.ok ? h('select', { 'aria-label': 'Correction' }, ...r.diag.options.map((o) => h('option', { value: o.mode, selected: o.mode === r.mode, title: o.detail }, o.label))) : null;
      modeSel?.addEventListener('change', () => { r.mode = modeSel.value as FitMode; draw(); });
      const bgChk = h('input', { type: 'checkbox', checked: r.bg.enabled }), bgTol = h('input', { type: 'number', min: 0, max: 255, value: r.bg.tolerance, class: 'tol', 'aria-label': 'Tolérance' });
      bgChk.addEventListener('change', () => { r.bg.enabled = bgChk.checked; draw(); });
      bgTol.addEventListener('change', () => { r.bg.tolerance = Number(bgTol.value); draw(); });
      const detail = modeSel && r.diag ? r.diag.options.find((o) => o.mode === r.mode)?.detail ?? '' : '';
      return h('div', { class: `imp-row${r.key ? '' : ' unmatched'}` },
        h('div', { class: 'imp-thumbs' }, before, h('span', {}, '→'), after),
        h('div', { class: 'imp-info' },
          h('strong', {}, baseName(r.m.entry.name)), h('small', {}, `${r.src.width}×${r.src.height}`), keySel,
          r.m.how === 'ambiguous' || (!r.key && r.m.candidates.length) ? h('small', { class: 'warn' }, `Choix possibles : ${r.m.candidates.join(', ')}`) : null,
          r.diag ? h('small', { class: r.diag.ok ? 'ok' : 'warn' }, r.diag.message) : h('small', {}, r.key ? '' : 'Non associé : sera ignoré.'),
          modeSel, detail ? h('small', {}, detail) : null,
          h('label', { class: 'inl' }, bgChk, ` Supprimer le fond${r.bgSuggested ? ' (détecté)' : ''} · tolérance `, bgTol),
          note.trim() ? h('small', {}, note.trim()) : null));
    }));
  };
  draw();
  modal('Correspondance des fichiers', h('div', {}, h('p', { class: 'hint' }, 'Vérifie la clé du jeu associée à chaque fichier, puis valide. Rien n\'est refusé en silence : les écarts de taille sont listés et corrigeables.'), list), [
    { label: 'Annuler', onClick: () => {} },
    { label: 'Importer', primary: true, onClick: () => { applyImport(rows, ignored, warnings); } },
  ], true);
}

function applyImport(rows: Row[], ignored: string[], warnings: string[]): void {
  const rep: ImportReport = { accepted: [], ignored: [...ignored], corrected: [], warnings: [...warnings] };
  const prev = new Map<string, Asset | undefined>(), next = new Map<string, Asset>();
  for (const r of rows) {
    const name = baseName(r.m.entry.name);
    if (!r.key) { rep.ignored.push(`${name} : non associé à une clé du jeu.`); continue; }
    try {
      const out = rendered(r); if (!out) continue;
      if (next.has(r.key)) { rep.ignored.push(`${name} : doublon pour « ${r.key} » (le premier est conservé).`); continue; }
      prev.set(r.key, session.project.assets.get(r.key)); next.set(r.key, out.asset);
      rep.accepted.push(`${name} → ${r.key}`);
      if (r.diag && !r.diag.ok) rep.corrected.push(`${name} → ${r.key} : ${r.diag.message} Correction : ${r.diag.options.find((o) => o.mode === r.mode)?.label ?? r.mode}.`);
      if (r.bg.enabled) rep.corrected.push(`${name} : fond supprimé (tolérance ${r.bg.tolerance}).`);
      if (r.m.how === 'alias' && r.m.note) rep.warnings.push(`${name} : ${r.m.note}`);
    } catch (e) { rep.ignored.push(`${name} : ${(e as Error).message}`); }
  }
  const apply = (m: Map<string, Asset | undefined>): void => { for (const [k, a] of m) { if (a) session.project.assets.set(k, a); else session.project.assets.delete(k); } bus.emit('project:changed'); bus.emit('asset:selected'); };
  if (next.size) {
    apply(next);
    session.history.push({ label: 'Import', undo: () => apply(prev), redo: () => apply(next) });
    if (!session.asset) session.select([...next.keys()][0]!);
  }
  bus.emit('import:report', rep); showReport(rep);
}

export function showReport(rep: ImportReport): void {
  const sec = (title: string, items: string[], cls: string) => items.length ? h('div', { class: `rep ${cls}` }, h('h3', {}, `${title} (${items.length})`), h('ul', {}, ...items.map((i) => h('li', {}, i)))) : null;
  modal('Rapport d\'import', h('div', {}, sec('Acceptés', rep.accepted, 'ok'), sec('Corrigés', rep.corrected, 'fix'), sec('Avertissements', rep.warnings, 'warn'), sec('Ignorés', rep.ignored, 'bad'), rep.accepted.length + rep.ignored.length === 0 ? h('p', {}, 'Rien à importer.') : null), [{ label: 'OK', primary: true, onClick: () => {} }]);
  if (rep.accepted.length) toast(`${rep.accepted.length} fichier(s) importé(s)`);
  void canvasToPng;
}
