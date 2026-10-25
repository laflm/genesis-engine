import { registerBrush } from './registry';
// Pinceau d'encrage : trait coloré + contour noir épais (réglages du contour dans CONFIG.brush).
registerBrush({ id: 'ink', label: 'Encrage', outline: true, erase: false, radius: (s, p) => Math.max(0.5, (s / 2) * (0.35 + 0.65 * p)) });
