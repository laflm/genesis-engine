import type { AdapterData, AnimState } from '../../shared/types';
import items from './items.generated.json';

/**
 * ADAPTATEUR « Black Boy Go! ».
 * Tout ce que le moteur sait du jeu est ici (valeurs copiées du index.html du jeu :
 * ANIMS, SHEETDIM, LAYER, SLOTS). Les items viennent de items.generated.json
 * (régénéré par `npm run extract:items` à partir du jeu — jamais écrits à la main).
 */
export const blackBoyGo: AdapterData = {
  id: 'black-boy-go',
  name: 'Black Boy Go!',
  exportDir: 'sprites',
  packFile: 'pack.json',
  anims: {
    idle: { row: 0, frames: 4, fps: 6 },
    walk: { row: 1, frames: 6, fps: 10 },
    attack: { row: 2, frames: 4, fps: 14 },
    hurt: { row: 3, frames: 2, fps: 8 },
  },
  layerOrder: ['foot', 'body', 'talisman', 'head', 'shield', 'weapon'],
  slots: ['weapon', 'shield', 'head', 'body', 'foot', 'talisman'],
  skins: [
    { key: 'hero', label: 'Héros (joueur)', fw: 260, fh: 200, ax: 130, ay: 180 },
    { key: 'citizen', label: 'Citoyen', fw: 260, fh: 200, ax: 130, ay: 180 },
    { key: 'robot', label: 'Robot', fw: 160, fh: 200, ax: 80, ay: 180 },
    { key: 'flyer', label: 'Volant', fw: 140, fh: 120, ax: 70, ay: 100 },
    { key: 'pinata', label: 'Piñata', fw: 120, fh: 140, ax: 60, ay: 120 },
    { key: 'boss', label: 'Boss', fw: 260, fh: 260, ax: 130, ay: 235 },
  ],
  playerSkin: 'hero',
  items: items as { id: string; name: string; slot?: string }[],
  fixedSprites: [
    { key: 'shop', label: 'Boutique' },
    { key: 'arcade', label: 'Arcade' },
    { key: 'house', label: 'Maison' },
    { key: 'gate', label: 'Portail' },
    { key: 'church', label: 'Chapelle', recommended: { w: 300, h: 320 } },
    { key: 'forge', label: 'Forge' },
    { key: 'chest', label: 'Coffre', recommended: { w: 152, h: 140 } },
    { key: 'chest_open', label: 'Coffre ouvert', recommended: { w: 152, h: 140 } },
  ],
  itemSheetPrefix: 'item_',
  iconPrefix: 'icon_',
  iconSize: { w: 24, h: 24 },
  // Copie exacte de la logique du jeu : attack si swing>0, sinon hurt si hit>0, sinon walk si |vx|>20, sinon idle.
  selectAnimation(s: AnimState): string {
    return s.swing > 0 ? 'attack' : s.hit > 0 ? 'hurt' : Math.abs(s.vx) > 20 ? 'walk' : 'idle';
  },
  // Attaque : frame = min(n-1, max(0, 1 - swing/.25) * n) ; autres : (t * fps) % n.
  frameFor(anim: string, t: number, swing: number): number {
    const a = this.anims[anim] ?? this.anims.idle!;
    if (anim === 'attack') return Math.min(a.frames - 1, Math.floor(Math.max(0, 1 - swing / 0.25) * a.frames));
    return Math.floor(t * a.fps) % a.frames;
  },
  validation: { keyPattern: /^[a-z0-9_]+$/, maxFileBytes: 2_000_000 },
  testGameUrl: 'game/index.html',
};
