import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { angleDelta, rotateAt, toFrame, toScreen, zoomAt } from '../src/modules/sprite-editor/canvas/viewMath';
import { insertIndexAbove, moveGroup, rangeBetween } from '../src/modules/sprite-editor/layers/order';
import { applyH, dragFree, dragRatio, homography, hitHandle8, latticeGrid, perspectiveNodes, pointInPolygon, quadValid, rectNodes, renderMesh, smoothGrid, type P, type Rect } from '../src/modules/sprite-editor/tools/deformMath';

const near = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const solid = (w: number, h: number, c = [255, 0, 0, 255]): Uint8ClampedArray => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(c, i * 4); return d; };
const alphaAt = (r: { data: Uint8ClampedArray; w: number }, x: number, y: number): number => r.data[(y * r.w + x) * 4 + 3]!;

describe('perspective', () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it("l'homographie envoie les 4 coins exactement", () => {
    const q = [{ x: 2, y: 1 }, { x: 12, y: 3 }, { x: 11, y: 12 }, { x: -1, y: 9 }], H = homography(rect, q)!;
    rect.forEach((p, i) => { const r = applyH(H, p.x, p.y); near(r.x, q[i]!.x, 1e-6); near(r.y, q[i]!.y, 1e-6); });
  });
  it('identité : un carré sur lui-même', () => { const H = homography(rect, rect)!; const r = applyH(H, 3, 7); near(r.x, 3); near(r.y, 7); });
  it('points dégénérés (alignés) → null', () => assert.equal(homography(rect, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]), null));
  it('quadrilatère valide : convexe seulement', () => {
    assert.equal(quadValid(rect), true);
    assert.equal(quadValid([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 10 }]), false, 'concave');
    assert.equal(quadValid([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), false, 'croisé');
  });
  it('le maillage de perspective garde les coins du quadrilatère', () => {
    const q = [{ x: 0, y: 0 }, { x: 20, y: 5 }, { x: 20, y: 15 }, { x: 0, y: 20 }], m = perspectiveNodes(10, 10, q, 4)!;
    assert.equal(m.nodes.length, 25); near(m.nodes[4]!.x, 20); near(m.nodes[4]!.y, 5); near(m.nodes[24]!.y, 15);
  });
});

describe('warp (grille lissée)', () => {
  it('une grille régulière donne un maillage régulier', () => {
    const g = latticeGrid({ x: 0, y: 0, w: 30, h: 30 }, 4), m = smoothGrid(g, 4, 6);
    assert.equal(m.length, 49); near(m[0]!.x, 0); near(m[6]!.x, 30); near(m[3]!.x, 15, 1e-9); near(m[24]!.y, 15, 1e-9);
  });
  it('la courbe passe par les points de contrôle déplacés', () => {
    const g = latticeGrid({ x: 0, y: 0, w: 30, h: 30 }, 4); g[1] = { x: 10, y: 8 };
    const m = smoothGrid(g, 4, 3);                      // sub = n-1 → nœuds = points de contrôle
    near(m[1]!.x, 10); near(m[1]!.y, 8);
  });
});

describe('rendu du maillage', () => {
  it('rectangle 2×2 identité : mêmes pixels', () => {
    const src = solid(8, 6), r = renderMesh(src, 8, 6, rectNodes({ x: 0, y: 0, w: 8, h: 6 }), 2, 2)!;
    assert.deepEqual([r.w, r.h, r.ox, r.oy], [8, 6, 0, 0]);
    assert.ok([...r.data].every((v, i) => (i % 4 === 0 ? v === 255 : i % 4 === 3 ? v === 255 : v === 0)));
  });
  it('redimensionnement libre ×2 en largeur', () => {
    const r = renderMesh(solid(8, 6), 8, 6, rectNodes({ x: 5, y: 2, w: 16, h: 6 }), 2, 2)!;
    assert.deepEqual([r.w, r.h, r.ox, r.oy], [16, 6, 5, 2]); assert.equal(alphaAt(r, 15, 5), 255);
  });
  it('perspective : le bord supérieur incline la forme (coin haut-droit descendu)', () => {
    const m = perspectiveNodes(40, 40, [{ x: 0, y: 0 }, { x: 40, y: 20 }, { x: 40, y: 40 }, { x: 0, y: 40 }], 8)!, r = renderMesh(solid(40, 40), 40, 40, m.nodes, m.cols, m.rows)!;
    assert.equal(alphaAt(r, 38, 5), 0, 'au-dessus du bord incliné'); assert.equal(alphaAt(r, 38, 30), 255); assert.equal(alphaAt(r, 2, 2), 255);
  });
  it('les couleurs ne bavent pas : transparent reste transparent, pas de halo', () => {
    const d = new Uint8ClampedArray(4 * 4 * 4); for (let y = 1; y < 3; y++) for (let x = 1; x < 3; x++) d.set([0, 255, 0, 255], (y * 4 + x) * 4);
    const r = renderMesh(d, 4, 4, rectNodes({ x: 0, y: 0, w: 12, h: 12 }), 2, 2, 2)!;
    for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3]! > 0) { assert.equal(r.data[i], 0); assert.equal(r.data[i + 2], 0); }
  });
  it('suréchantillonnage ×2 : bord oblique avec alpha intermédiaire (anticrénelage)', () => {
    const m = perspectiveNodes(30, 30, [{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 0, y: 30 }], 6)!, r = renderMesh(solid(30, 30), 30, 30, m.nodes, m.cols, m.rows, 2)!;
    assert.ok([...r.data].some((v, i) => i % 4 === 3 && v > 20 && v < 235));
  });
  it('résultat démesuré ou invalide → null', () => {
    assert.equal(renderMesh(solid(2, 2), 2, 2, rectNodes({ x: 0, y: 0, w: 99999, h: 5 }), 2, 2), null);
    assert.equal(renderMesh(solid(2, 2), 2, 2, [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 2, 2), null);
  });
});

describe('poignées libre / proportionnel', () => {
  const r: Rect = { x: 10, y: 10, w: 40, h: 20 };
  it('libre : la poignée droite ne change que la largeur', () => assert.deepEqual(dragFree(r, 'r', { x: 70, y: 99 }), { x: 10, y: 10, w: 60, h: 20 }));
  it('libre : un coin change les deux dimensions, taille minimale respectée', () => {
    assert.deepEqual(dragFree(r, 'br', { x: 30, y: 40 }), { x: 10, y: 10, w: 20, h: 30 });
    const t = dragFree(r, 'br', { x: -50, y: -50 }, 4); assert.equal(t.w, 4); assert.equal(t.h, 4);
  });
  it('proportionnel : le rapport est conservé, le coin opposé reste fixe', () => {
    const n = dragRatio(r, 'br', { x: 90, y: 20 });          // largeur ×2
    near(n.w / n.h, 2); assert.deepEqual([n.x, n.y], [10, 10]); near(n.w, 80);
    const m = dragRatio(r, 'tl', { x: 30, y: 20 });          // ancre = coin bas-droit (50,30)
    near(m.x + m.w, 50); near(m.y + m.h, 30); near(m.w / m.h, 2);
  });
  it('proportionnel : un bord garde le rapport et se centre', () => {
    const n = dragRatio(r, 'r', { x: 90, y: 0 }); near(n.w / n.h, 2); near(n.y + n.h / 2, 20);
  });
  it('détection de poignée et polygone', () => {
    assert.equal(hitHandle8(r, 50, 30, 3), 'br'); assert.equal(hitHandle8(r, 30, 10, 3), 't'); assert.equal(hitHandle8(r, 30, 20, 3), null);
    const poly: P[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(pointInPolygon(poly, 5, 5), true); assert.equal(pointInPolygon(poly, 15, 5), false);
  });
});

describe('vue : zoom + rotation', () => {
  const v = { zoom: 3, x: 40, y: 25, rot: 0.7 };
  it('écran ↔ frame est réversible', () => { const s = toScreen(v, 12.5, 8), f = toFrame(v, s.x, s.y); near(f.x, 12.5); near(f.y, 8); });
  it('zoomer garde le point sous le doigt', () => {
    const f0 = toFrame(v, 100, 80), nv = zoomAt(v, 100, 80, 1.7, 0.25, 40), f1 = toFrame(nv, 100, 80);
    near(f1.x, f0.x); near(f1.y, f0.y); near(nv.zoom, 5.1);
  });
  it('pivoter garde le point fixe et change l\'angle', () => {
    const f0 = toFrame(v, 60, 90), nv = rotateAt(v, 60, 90, 0.5), f1 = toFrame(nv, 60, 90);
    near(f1.x, f0.x); near(f1.y, f0.y); near(nv.rot, 1.2);
  });
  it('rotation de 90° : l\'axe x de la frame devient l\'axe y de l\'écran', () => {
    const s = toScreen({ zoom: 1, x: 0, y: 0, rot: Math.PI / 2 }, 10, 0); near(s.x, 0); near(s.y, 10);
  });
  it('différence d\'angle ramenée dans ]-π, π]', () => { near(angleDelta(3.0, -3.0), 3.0 - -3.0 - 2 * Math.PI); near(angleDelta(0.2, 0.1), 0.1); });
  it('zoom borné', () => { assert.equal(zoomAt(v, 0, 0, 1000, 0.25, 40).zoom, 40); assert.equal(zoomAt(v, 0, 0, 0.0001, 0.25, 40).zoom, 0.25); });
});

describe('ordre des calques', () => {
  it('nouveau calque juste au-dessus de l\'actif (ou tout en haut)', () => {
    assert.equal(insertIndexAbove(['a', 'b', 'c'], 'a'), 1); assert.equal(insertIndexAbove(['a', 'b', 'c'], 'c'), 3); assert.equal(insertIndexAbove(['a', 'b'], undefined), 2);
  });
  it('monter / descendre un groupe garde leur ordre relatif et s\'arrête aux bords', () => {
    assert.deepEqual(moveGroup(['a', 'b', 'c', 'd'], new Set(['a', 'c']), 1), ['b', 'a', 'd', 'c']);
    assert.deepEqual(moveGroup(['a', 'b', 'c', 'd'], new Set(['c', 'd']), 1), ['a', 'b', 'c', 'd']);
    assert.deepEqual(moveGroup(['a', 'b', 'c', 'd'], new Set(['b', 'd']), -1), ['b', 'a', 'd', 'c']);
    assert.deepEqual(moveGroup(['a', 'b', 'c'], new Set(['a', 'b']), -1), ['a', 'b', 'c']);
  });
  it('plage de sélection', () => assert.deepEqual(rangeBetween(['a', 'b', 'c', 'd'], 'd', 'b'), ['b', 'c', 'd']));
});
