import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { encodePng, filterRows, hashPixels } from '../src/core/png';
import { pngSize } from '../src/modules/sprite-editor/import/png';

const sample = (w: number, h: number): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = (x * 7 + y) & 255; d[i + 1] = (y * 13) & 255; d[i + 2] = (x * y) & 255; d[i + 3] = (x + y) % 5 === 0 ? 0 : 255 - ((x * 3) & 127); }
  return d;
};
describe('encodeur PNG', () => {
  it('produit un PNG que Pillow relit pixel pour pixel (RGBA, formes variées)', async () => {
    for (const [w, h] of [[1, 1], [37, 23], [260, 200], [4, 300]] as const) {
      const d = sample(w, h), f = path.join(os.tmpdir(), `enc-${w}x${h}.png`);
      fs.writeFileSync(f, await encodePng(d, w, h));
      assert.deepEqual(pngSize(new Uint8Array(fs.readFileSync(f))), { w, h });
      const out = execFileSync('python3', ['-c', `from PIL import Image;import sys;im=Image.open('${f}');im.load();print(im.mode, im.size[0], im.size[1]);sys.stdout.buffer.write(im.tobytes())`], { maxBuffer: 1 << 26 });
      const nl = out.indexOf(10), head = out.subarray(0, nl).toString();
      assert.equal(head, `RGBA ${w} ${h}`);
      assert.deepEqual([...out.subarray(nl + 1)], [...d]);
    }
  });
  it('image entièrement transparente : minuscule', async () => {
    const png = await encodePng(new Uint8ClampedArray(1560 * 800 * 4), 1560, 800);
    assert.ok(png.length < 20_000, `${png.length} octets`);
  });
  it('les filtres réduisent la taille d\'un dégradé par rapport au filtre 0', async () => {
    const w = 128, h = 64, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set([x * 2, y * 4, 128, 255], (y * w + x) * 4);
    const f = filterRows(d, w, h); assert.ok([...Array(h).keys()].some((y) => f[y * (w * 4 + 1)] !== 0), 'un filtre autre que 0 est choisi');
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
