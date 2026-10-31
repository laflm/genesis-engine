import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it } from 'node:test';
import { encodePng, filterRows, hashPixels } from '../src/core/png';
import { pngSize } from '../src/modules/sprite-editor/import/png';

const sample = (w: number, h: number): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = (x * 7 + y) & 255; d[i + 1] = (y * 13) & 255; d[i + 2] = (x * y) & 255; d[i + 3] = (x + y) % 5 === 0 ? 0 : 255 - ((x * 3) & 127); }
  return d;
};
/**
 * Décodeur PNG de référence, écrit pour le test et INDÉPENDANT de l'encodeur : signature, CRC de chaque bloc (zlib.crc32),
 * décompression zlib, puis défiltrage des 5 filtres PNG. Aucune dépendance externe (ni Python ni Pillow).
 */
function decodePng(buf: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const b = Buffer.from(buf);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'signature PNG');
  let o = 8, w = 0, h = 0; const idat: Buffer[] = []; let sawEnd = false;
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    assert.equal(b.readUInt32BE(o + 8 + len), crcRef(b.subarray(o + 4, o + 8 + len)), `CRC du bloc ${type}`);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); assert.deepEqual([...data.subarray(8, 13)], [8, 6, 0, 0, 0], 'RGBA 8 bits, sans entrelacement'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') sawEnd = true;
    o += 12 + len;
  }
  assert.ok(sawEnd && o === b.length, 'IEND présent et rien après');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, out = new Uint8Array(stride * h);
  assert.equal(raw.length, (stride + 1) * h, 'taille des données décompressées');
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4]! : 0, up = y ? out[(y - 1) * stride + i]! : 0, c = i >= 4 && y ? out[(y - 1) * stride + i - 4]! : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? up : c) : -1;
      assert.ok(pred >= 0, `filtre inconnu ${f}`);
      out[y * stride + i] = (row[i]! + pred) & 255;
    }
  }
  return { w, h, rgba: out };
}
// CRC-32 de référence : zlib.crc32 (Node >= 22.2) ou, à défaut, une implémentation locale indépendante.
const crcRef = (b: Uint8Array): number => {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(b) >>> 0;
  let c = 0xffffffff; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0;
};
const usedFilters = (png: Uint8Array, w: number, h: number): Set<number> => {
  const raw = zlib.inflateSync(Buffer.concat((() => { const b = Buffer.from(png), parts: Buffer[] = []; let o = 8; while (o < b.length) { const len = b.readUInt32BE(o); if (b.toString('latin1', o + 4, o + 8) === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + len)); o += 12 + len; } return parts; })()));
  return new Set(Array.from({ length: h }, (_, y) => raw[y * (w * 4 + 1)]!));
};
const hasPillow = (): boolean => { try { execFileSync('python3', ['-c', 'import PIL']); return true; } catch { return false; } };

describe('encodeur PNG', () => {
  it('décodé par un décodeur indépendant : pixels identiques (RGBA, formes variées)', async () => {
    for (const [w, h] of [[1, 1], [37, 23], [260, 200], [4, 300], [301, 7]] as const) {
      const d = sample(w, h), png = await encodePng(d, w, h);
      assert.deepEqual(pngSize(png), { w, h });
      const r = decodePng(png);
      assert.deepEqual([r.w, r.h], [w, h]);
      assert.deepEqual([...r.rgba], [...d], `pixels ${w}×${h}`);
    }
  });
  it('les 5 types de filtres PNG sont bien produits et relus (dégradés, bruit, aplats)', async () => {
    const w = 96, h = 120, d = new Uint8ClampedArray(w * h * 4);
    let seed = 12345; const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) & 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, band = Math.floor(y / 24);
      const px = band === 0 ? [x * 2, y, 100, 255] : band === 1 ? [rnd(), rnd(), rnd(), 255] : band === 2 ? [(x * 5 + y * 3) & 255, (x * 3) & 255, (y * 7) & 255, 255] : band === 3 ? [200, 30, 30, 255] : [x, x, y, (x + y) & 255];
      d.set(px, i);
    }
    const png = await encodePng(d, w, h);
    assert.ok(usedFilters(png, w, h).size >= 3, `filtres utilisés : ${[...usedFilters(png, w, h)]}`);
    assert.deepEqual([...decodePng(png).rgba], [...d]);
  });
  it('image entièrement transparente : minuscule', async () => {
    const png = await encodePng(new Uint8ClampedArray(1560 * 800 * 4), 1560, 800);
    assert.ok(png.length < 20_000, `${png.length} octets`);
    assert.equal(decodePng(png).rgba.every((v) => v === 0), true);
  });
  it('les filtres réduisent la taille d\'un dégradé par rapport au filtre 0', async () => {
    const w = 128, h = 64, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x * 2, y * 4, 128, 255], (y * w + x) * 4);
    const f = filterRows(d, w, h); assert.ok([...Array(h).keys()].some((y) => f[y * (w * 4 + 1)] !== 0), 'un filtre autre que 0 est choisi');
  });
  // Contrôle supplémentaire, seulement si Pillow est installé (absent sur GitHub Actions : le test est alors ignoré, pas en échec).
  it('relu aussi par Pillow quand il est disponible', { skip: !hasPillow() && 'Pillow non installé' }, async () => {
    const w = 37, h = 23, d = sample(w, h), f = path.join(os.tmpdir(), 'enc-pillow.png');
    fs.writeFileSync(f, await encodePng(d, w, h));
    const out = execFileSync('python3', ['-c', `from PIL import Image;import sys;im=Image.open('${f}');im.load();print(im.mode, im.size[0], im.size[1]);sys.stdout.buffer.write(im.tobytes())`], { maxBuffer: 1 << 26 });
    const nl = out.indexOf(10); assert.equal(out.subarray(0, nl).toString(), `RGBA ${w} ${h}`); assert.deepEqual([...out.subarray(nl + 1)], [...d]);
  });
});

describe('empreinte de contenu (cache d\'encodage)', () => {
  it('identique pour un même contenu, différente dès qu\'un seul pixel change', () => {
    const a = sample(64, 40), b = new Uint8ClampedArray(a);
    assert.equal(hashPixels(a), hashPixels(b));
    const k = (20 * 64 + 31) * 4 + 1; b[k] = b[k]! ^ 1; assert.notEqual(hashPixels(a), hashPixels(b));
    const c = new Uint8ClampedArray(a); c[3] = (c[3]! + 1) & 255; assert.notEqual(hashPixels(a), hashPixels(c));
  });
});
