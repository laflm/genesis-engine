// ===== TOUTE valeur modifiable vit ici (voir docs/GUIDE_MODIFICATIONS.md). =====
export const CONFIG = {
  appName: 'GENESIS Engine',
  /** Sauvegarde automatique du projet (IndexedDB). */
  autosaveMs: 1500,
  storage: { dbName: 'genesis-engine', projectKey: 'current-project', gameHtmlKey: 'game-html:' },
  /** Profondeur de l'historique d'annulation. */
  undoDepth: 100,
  /** Taille minimale des zones tactiles (px). */
  minTouchPx: 44,
  brush: {
    defaultSize: 6, minSize: 1, maxSize: 80,
    defaultOpacity: 1,
    /** Épaisseur du contour noir du pinceau d'encrage : max(minPx, taille * ratio). */
    inkOutlineRatio: 0.3, inkOutlineMinPx: 1.5,
    inkOutlineColor: '#000000',
    /** Espacement des tampons (fraction de la taille). */
    spacing: 0.15,
    defaultColor: '#8a5a3c',
    /** Appui long (ms) pour la pipette et tolérance de déplacement (px écran). */
    longPressMs: 550, longPressMovePx: 6,
  },
  fill: { tolerance: 24 },
  /** pixelGridZoom : au-delà de ce zoom, les pixels sont affichés nets (sans lissage). */
  view: { minZoom: 0.25, maxZoom: 40, defaultZoom: 3, pixelGridZoom: 8 },
  gestures: { tapMaxMs: 280, tapMaxMovePx: 14, touchDrawsWithoutPen: true, penRejectPalmMs: 1500 },
  import: { bgTolerance: 24, smoothScale: true },
  export: { baseName: 'genesis-export', warnFileBytes: 1_500_000 },
  onion: { prevAlpha: 0.3, nextAlpha: 0.2 },
  guides: { gridColor: '#00a2ff', anchorColor: '#ff3b6b', safeColor: '#2bd46b', safeMarginPx: 10 },
  reference: { alpha: 0.35 },
  originalOverlay: { alpha: 0.5 },
  preview: { scale: 2, background: '#cfe8ff', maxSwing: 0.25 },
  palettes: {
    storageKey: 'genesis.palettes',
    defaults: ['#000000', '#ffffff', '#8a5a3c', '#b57b55', '#5a3a26', '#c33', '#fd2', '#47a', '#3b5', '#a6f', '#f93', '#888'],
  },
  shortcuts: {
    undo: 'ctrl+z', redo: 'ctrl+shift+z', brush: 'b', eraser: 'e', fill: 'g', pipette: 'i', move: 'v',
    sizeDown: '[', sizeUp: ']', prevFrame: ',', nextFrame: '.', play: 'p',
  },
  /** Onglets de modes (a)(b)(c)(d) de l'éditeur. */
  modes: [
    { id: 'skins', label: 'Skins', groups: ['skin'] },
    { id: 'items', label: 'Équipements', groups: ['item'] },
    { id: 'fixed', label: 'Sprites & icônes', groups: ['fixed', 'icon'] },
    { id: 'retouch', label: 'Retouche', groups: ['skin', 'item', 'fixed', 'icon'] },
  ],
  pwa: { serviceWorker: './sw.js' },
} as const;
