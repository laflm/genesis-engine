import { CONFIG } from '../../../config';
import { writeZip } from '../../../core/zip';
import type { ExportFile, ExportTarget } from '../../../shared/types';

// ===== ExportTarget : aujourd'hui « ZIP téléchargeable », demain « commit GitHub » (nouveau fichier ici). =====
const targets = new Map<string, ExportTarget>();
export const registerTarget = (t: ExportTarget): void => { targets.set(t.id, t); };
export const getTarget = (id: string): ExportTarget | undefined => targets.get(id);
export const listTargets = (): ExportTarget[] => [...targets.values()];

export function zipBlob(files: ExportFile[]): Blob {
  return new Blob([writeZip(files.map((f) => ({ path: f.path, data: f.data }))) as BlobPart], { type: 'application/zip' });
}

export const zipDownloadTarget: ExportTarget = {
  id: 'zip',
  label: 'ZIP téléchargeable',
  async deliver(files, meta) {
    const blob = zipBlob(files);
    const name = `${meta.baseName || CONFIG.export.baseName}.zip`;
    const file = new File([blob], name, { type: 'application/zip' });
    // iPad : la feuille de partage permet « Enregistrer dans Fichiers » ; sinon téléchargement classique.
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] }) && /iPad|iPhone|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document) {
      try { await navigator.share({ files: [file] }); return; } catch { /* annulé : repli sur le téléchargement */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  },
};
registerTarget(zipDownloadTarget);
