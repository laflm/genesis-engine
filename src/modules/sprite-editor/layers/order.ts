// Ordre des calques (pur, testable). Le dernier élément du tableau est le calque du DESSUS.

/** Position d'insertion d'un nouveau calque : juste au-dessus de l'actif (ou tout en haut s'il n'y en a pas). */
export function insertIndexAbove<T>(arr: readonly T[], active: T | undefined): number {
  const i = active === undefined ? -1 : arr.indexOf(active);
  return i < 0 ? arr.length : i + 1;
}

/** Décale d'un cran tout un groupe de calques (dir = +1 vers le haut, -1 vers le bas) en gardant leur ordre relatif. */
export function moveGroup<T>(arr: readonly T[], sel: ReadonlySet<T>, dir: 1 | -1): T[] {
  const a = [...arr];
  if (dir === 1) { for (let i = a.length - 2; i >= 0; i--) if (sel.has(a[i]!) && !sel.has(a[i + 1]!)) { const t = a[i]!; a[i] = a[i + 1]!; a[i + 1] = t; } }
  else { for (let i = 1; i < a.length; i++) if (sel.has(a[i]!) && !sel.has(a[i - 1]!)) { const t = a[i]!; a[i] = a[i - 1]!; a[i - 1] = t; } }
  return a;
}

/** Calques entre deux positions incluses (sélection par plage avec Maj). */
export function rangeBetween<T>(arr: readonly T[], a: T, b: T): T[] {
  const i = arr.indexOf(a), j = arr.indexOf(b); if (i < 0 || j < 0) return [b];
  return arr.slice(Math.min(i, j), Math.max(i, j) + 1);
}
