const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Lit largeur/hauteur dans l'en-tête IHDR d'un PNG (sans décoder l'image). null si ce n'est pas un PNG. */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || SIG.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(12) !== 0x49484452) return null; // 'IHDR'
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}
