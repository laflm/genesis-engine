import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bboxOfAlpha, restoreOutsideData } from '../src/modules/sprite-editor/selection/maskMath';
import { angleFromDrag, corners, hitTest, rotateHandle, scaleFromDrag, toFrame, toLocal, type TF } from '../src/modules/sprite-editor/tools/transformMath';

const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const tf = (o: Partial<TF> = {}): TF => ({ cx: 50, cy: 40, w: 20, h: 10, scale: 1, angle: 0, flipX: false, flipY: false, ...o });

describe('géométrie de transformation', () => {
  it('aller-retour frame ↔ local (rotation, échelle, symétries)', () => {
    for (const t of [tf(), tf({ angle: 1.1, scale: 2.5 }), tf({ angle: -2, flipX: true }), tf({ angle: 0.4, flipY: true, scale: 0.3 })]) {
      const l = toLocal(t, 61.5, 33.25), p = toFrame(t, l.x, l.y);
      near(p.x, 61.5); near(p.y, 33.25);
    }
  });
  it('rotation de 90° : le coin haut-gauche passe en haut-droit', () => {
    const c = corners(tf({ cx: 0, cy: 0, angle: Math.PI / 2 }));
    near(c[0]!.x, 5); near(c[0]!.y, -10);
  });
  it('échelle ×2 double les distances au centre', () => {
    const c = corners(tf({ scale: 2 })); near(c[1]!.x - c[0]!.x, 40);
  });
  it('détection des poignées : rotation, coin, intérieur, extérieur', () => {
    const t = tf({ cx: 0, cy: 0 }), r = rotateHandle(t, 8);
    assert.equal(hitTest(t, r.x, r.y, 3, 8), 'rotate');
    assert.equal(hitTest(t, 10, 5, 3, 8), 'scale');
    assert.equal(hitTest(t, 0, 0, 3, 8), 'move');
    assert.equal(hitTest(t, 60, 60, 3, 8), null);
  });
  it('glisser : échelle proportionnelle à la distance, bornée ; angle = écart angulaire', () => {
    near(scaleFromDrag(1, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, 0.05, 20), 2);
    near(scaleFromDrag(1, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1000, y: 0 }, 0.05, 20), 20);
    near(angleFromDrag(0, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }), Math.PI / 2);
  });
});

describe('masque de sélection', () => {
  const px = (v: number[]): Uint8ClampedArray => new Uint8ClampedArray(v);
  it('restaure les pixels hors sélection et compte les changements annulés', () => {
    const before = px([1, 1, 1, 255, 2, 2, 2, 255]), cur = px([9, 9, 9, 255, 8, 8, 8, 255]), mask = px([0, 0, 0, 255, 0, 0, 0, 0]);
    assert.equal(restoreOutsideData(before, cur, mask), 1);
    assert.deepEqual([...cur], [9, 9, 9, 255, 2, 2, 2, 255]);
  });
  it('rectangle englobant', () => {
    const d = new Uint8ClampedArray(4 * 4 * 4); d[(1 * 4 + 2) * 4 + 3] = 255; d[(2 * 4 + 1) * 4 + 3] = 255;
    assert.deepEqual(bboxOfAlpha(d, 4, 4), { x: 1, y: 1, w: 2, h: 2 });
    assert.equal(bboxOfAlpha(new Uint8ClampedArray(16), 2, 2), null);
  });
});
