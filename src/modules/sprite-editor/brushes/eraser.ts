import { registerBrush } from './registry';
// Gomme : efface (même moteur de trait, mode « erase »).
registerBrush({ id: 'eraser', label: 'Gomme', outline: false, erase: true, radius: (s, p) => Math.max(0.5, (s / 2) * (0.5 + 0.5 * p)) });
