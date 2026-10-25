import type { GameAdapter, SkinDef } from '../../../shared/types';
import type { ExportItem } from './types';

/** PATCH_NOTES.txt : tout ce qui demande une modification MANUELLE du code du jeu (sinon : aucune). */
export function buildPatchNotes(items: ExportItem[], adapter: GameAdapter, custom: SkinDef[], date = new Date()): string {
  const used = custom.filter((s) => items.some((i) => i.key === s.key));
  const L: string[] = [];
  L.push(`PATCH_NOTES — ${adapter.name}`, `Généré par GENESIS Engine le ${date.toISOString().slice(0, 10)}`, '');
  if (!used.length) {
    L.push('AUCUNE modification du code du jeu n\'est nécessaire pour ces fichiers.',
      'Le jeu lit déjà sprites/pack.json et remplace les visuels dessinés par ces PNG.');
  } else {
    L.push(`${used.length} nouveau(x) skin(s) : ajoute ces lignes dans la constante SHEETDIM du index.html du jeu,`,
      'sinon le jeu utilisera les dimensions du héros et découpera mal la sheet :', '');
    for (const s of used) L.push(`    ${s.key}:{fw:${s.fw},fh:${s.fh},ax:${s.ax},ay:${s.ay}},`);
    L.push('', 'Puis, pour qu\'un ennemi/PNJ utilise ce skin : skin:\'<clé>\' dans son entrée (ENEMY, LEVELS…).',
      'Les skins sans entrée dans SKINS (dessin en code) n\'ont pas de repli : fournis alors toutes les animations.');
  }
  L.push('', '--- Rappel ---',
    `Les fichiers vont dans le dossier « ${adapter.exportDir}/ » à côté de index.html (voir README_UPLOAD.txt).`,
    'Si ton repo a déjà un pack.json avec d\'autres clés, ce fichier les contient déjà SEULEMENT si tu as importé',
    'ton ancien pack.json dans GENESIS Engine. Sinon, fusionne les deux à la main avant d\'écraser.');
  return L.join('\n') + '\n';
}

/** README_UPLOAD.txt : mode d'emploi pas à pas pour poser les fichiers dans le repo GitHub. */
export function buildReadmeUpload(items: ExportItem[], adapter: GameAdapter, partial: boolean): string {
  const dir = adapter.exportDir;
  return [
    `README_UPLOAD — ${adapter.name}`, '',
    `Contenu : ${items.length} fichier(s) PNG + ${dir}/${adapter.packFile} + PATCH_NOTES.txt${partial ? ' (export PARTIEL : uniquement les sprites modifiés)' : ''}.`, '',
    'ÉTAPES (depuis un navigateur ou l\'app GitHub) :',
    '1. Décompresse ce ZIP (app Fichiers sur iPad : appui long sur le ZIP > Décompresser).',
    `2. Ouvre ton repo GitHub, à la racine (là où se trouve index.html du jeu).`,
    `3. « Add file » > « Upload files » et glisse le DOSSIER « ${dir} » (ou son contenu dans « ${dir}/ »).`,
    `4. Si GitHub propose de remplacer des fichiers du même nom : accepte, c'est voulu.`,
    '5. Lis PATCH_NOTES.txt : si des modifications de code sont listées, fais-les dans index.html.',
    '6. « Commit changes ». GitHub Pages republie le jeu en 1 à 2 minutes (recharge sans cache).',
    '',
    'ATTENTION',
    `- GitHub Pages distingue majuscules/minuscules : ne renomme pas les fichiers.`,
    `- Les clés absentes de ${adapter.packFile} gardent leur version dessinée en code (rien n'est cassé).`,
    `- ${adapter.packFile} : si ton repo en a déjà un avec d'autres clés, fusionne-les (voir PATCH_NOTES.txt).`,
    '',
    'Fichiers :', ...items.map((i) => `  ${dir}/${i.key}.png  (${i.width}×${i.height}, ${(i.bytes / 1024).toFixed(0)} Ko)`),
  ].join('\n') + '\n';
}
