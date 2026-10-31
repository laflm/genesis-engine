import { crc32 } from './zip';

// Encodeur PNG RGBA 8 bits sans dépendance, basé sur CompressionStream. Pourquoi ne pas utiliser canvas.toBlob ?
// Chrome planifie cet encodage pendant les temps morts de la page : si la page dessine en continu (aperçu animé),
// chaque appel attend ~1 s, et un export de 100 calques prend près de 2 minutes. Ici le temps ne dépend que du CPU.
const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Applique à chaque ligne le filtre PNG (0..4) qui minimise la somme des valeurs absolues (heuristique de libpng). */
export function filterRows(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const stride = w * 4, out = new Uint8Array((stride + 1) * h), cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)];
  const zero = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride), prev = y ? rgba.subarray((y - 1) * stride, y * stride) : zero;
    const sums = [0, 0, 0, 0, 0];
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4]! : 0, b = prev[i]!, c = i >= 4 ? prev[i - 4]! : 0, x = cur[i]!;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const v = [x, (x - a) & 255, (x - b) & 255, (x - ((a + b) >> 1)) & 255, (x - paeth) & 255];
      for (let f = 0; f < 5; f++) { cand[f]![i] = v[f]!; sums[f]! += v[f]! < 128 ? v[f]! : 256 - v[f]!; }
    }
    let best = 0; for (let f = 1; f < 5; f++) if (sums[f]! < sums[best]!) best = f;
    out[y * (stride + 1)] = best; out.set(cand[best]!, y * (stride + 1) + 1);
  }
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** PNG RGBA 8 bits (non prémultiplié) à partir de pixels bruts. */
export async function encodePng(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;   // 8 bits, RGBA, pas d'entrelacement
  const parts = [SIG, chunk('IHDR', ihdr), chunk('IDAT', await zlib(filterRows(rgba, w, h))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const canEncodePng = (): boolean => typeof CompressionStream !== 'undefined';

/** Empreinte rapide (FNV-1a sur des mots de 32 bits) du contenu d'une image : sert de clé de cache d'encodage. */
export function hashPixels(rgba: Uint8ClampedArray | Uint8Array): number {
  const words = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
  let h = 0x811c9dc5;
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i]!, 0x01000193);
  return h >>> 0;
}
