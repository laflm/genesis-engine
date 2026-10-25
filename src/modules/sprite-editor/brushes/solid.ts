import { registerBrush } from './registry';
// Pinceau uni : aplat de couleur, sans contour.
registerBrush({ id: 'solid', label: 'Uni', outline: false, erase: false, radius: (s, p) => Math.max(0.5, (s / 2) * (0.35 + 0.65 * p)) });
