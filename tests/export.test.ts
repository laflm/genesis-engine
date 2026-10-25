import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readZip, writeZip } from '../src/core/zip';
import { History } from '../src/core/undo';
import { buildPack } from '../src/modules/sprite-editor/export/pack';
import { planExport } from '../src/modules/sprite-editor/export/build';
import type { ExportItem } from '../src/modules/sprite-editor/export/types';
import { validateExport } from '../src/modules/sprite-editor/export/validate';
import { adapter } from './helpers';

const item = (key: string, w: number, h: number, o: Partial<ExportItem> = {}): ExportItem => ({ key, width: w, height: h, emptyAnims: [], allEmpty: false, bytes: 5000, status: 'imported', png: new Uint8Array([137, 80]), ...o });

describe('validation d\'export', () => {
  it('sheet correcte + sprite correct : aucun problème', () => assert.deepEqual(validateExport([item('hero', 1560, 800), item('church', 300, 320)], adapter, []), []));
  it('dimensions de frame incorrectes → erreur claire', () => {
    const [i] = validateExport([item('hero', 1500, 800)], adapter, []);
    assert.equal(i!.level, 'error'); assert.match(i!.message, /1500×800 au lieu de 1560×800/);
  });
  it('nom invalide, clé inconnue, animation vide, ratio, poids', () => {
    const iss = validateExport([item('Hero Final', 10, 10), item('inconnu', 10, 10), item('item_ceohat', 1560, 800, { emptyAnims: ['hurt'] }), item('chest', 100, 10), item('gate', 10, 10, { bytes: 3_000_000 })], adapter, []);
    const msg = iss.map((x) => `${x.level}:${x.key}:${x.message}`).join('\n');
    assert.match(msg, /error:Hero Final:.*Nom invalide/);
    assert.match(msg, /error:inconnu:.*Clé inconnue/);
    assert.match(msg, /warning:item_ceohat:.*« hurt » vide/);
    assert.match(msg, /warning:chest:.*Ratio/);
    assert.match(msg, /error:gate:.*trop lourd/);
  });
  it('liste vide bloquée', () => assert.equal(validateExport([], adapter, [])[0]!.level, 'error'));
});

describe('plan d\'export', () => {
  const custom = [{ key: 'ninja', label: 'Ninja', fw: 200, fh: 180, ax: 100, ay: 170 }];
  it('arborescence + pack.json fusionné avec l\'ancien pack', async () => {
    const plan = planExport([item('hero', 1560, 800), item('church', 300, 320)], adapter, [], { partial: false, basePack: { sheets: { robot: 'robot.png' }, sprites: { shop: 'shop.png' } } });
    assert.equal(plan.blocked, false);
    assert.deepEqual(plan.files.map((f) => f.path), ['sprites/pack.json', 'sprites/hero.png', 'sprites/church.png', 'PATCH_NOTES.txt', 'README_UPLOAD.txt']);
    const pack = JSON.parse(new TextDecoder().decode(plan.files[0]!.data));
    assert.deepEqual(pack, { sheets: { hero: 'hero.png', robot: 'robot.png' }, sprites: { church: 'church.png', shop: 'shop.png' } });
    const back = await readZip(writeZip(plan.files));
    assert.equal(back.length, 5);
  });
  it('export partiel : seulement les sprites modifiés', () => {
    const plan = planExport([item('hero', 1560, 800), item('item_ceohat', 1560, 800, { status: 'edited' })], adapter, [], { partial: true });
    assert.deepEqual(plan.items.map((i) => i.key), ['item_ceohat']);
    assert.match(new TextDecoder().decode(plan.files.at(-1)!.data), /PARTIEL/);
  });
  it('nouveau skin → PATCH_NOTES liste la ligne SHEETDIM', () => {
    const plan = planExport([item('ninja', 1200, 720)], adapter, custom, { partial: false });
    assert.equal(plan.blocked, false);
    const notes = new TextDecoder().decode(plan.files.find((f) => f.path === 'PATCH_NOTES.txt')!.data);
    assert.match(notes, /ninja:\{fw:200,fh:180,ax:100,ay:170\},/);
    assert.equal(JSON.parse(new TextDecoder().decode(plan.files[0]!.data)).sheets.ninja, 'ninja.png');
  });
  it('sans nouveau skin → « AUCUNE modification »', () => {
    const plan = planExport([item('hero', 1560, 800)], adapter, [], { partial: false });
    assert.match(new TextDecoder().decode(plan.files.find((f) => f.path === 'PATCH_NOTES.txt')!.data), /AUCUNE modification/);
  });
  it('buildPack ignore les clés inconnues', () => assert.deepEqual(buildPack(['zzz'], adapter, []), { sheets: {}, sprites: {} }));
});

describe('historique', () => {
  it('annuler / rétablir / limite de profondeur', () => {
    let v = 0; const h = new History(() => {}, 3);
    for (let i = 1; i <= 5; i++) { const before = v; v = i; h.push({ label: 'x', undo: () => { v = before; }, redo: () => { v = i; } }); }
    assert.equal(h.size, 3);
    h.undo(); h.undo(); h.undo(); assert.equal(v, 2); assert.equal(h.undo(), false);
    h.redo(); assert.equal(v, 3);
    h.push({ label: 'n', undo() {}, redo() {} }); assert.equal(h.canRedo, false);
  });
});

import { buildTestDoc } from '../src/modules/sprite-editor/preview/testgame';
import { floodFill } from '../src/modules/sprite-editor/tools/fill';
// buildTestDoc/floodFill importent des modules DOM : seules leurs fonctions pures sont appelées ici.
describe('iframe « Tester dans le jeu »', () => {
  it('injecte la redirection AVANT le code du jeu, sans le modifier', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><script>const a=1</script></body></html>';
    const out = buildTestDoc(html, { 'sprites/hero.png': 'blob:abc' });
    assert.ok(out.indexOf('blob:abc') < out.indexOf('const a=1'));
    assert.ok(out.includes('<title>x</title>') && out.includes('const a=1'));
    assert.match(out, /delete Navigator\.prototype\.serviceWorker/);
  });
});
describe('remplissage', () => {
  it('remplit la zone connexe et respecte la tolérance', () => {
    const w = 4, h = 1, d = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    assert.equal(floodFill(d, w, h, 0, 0, [255, 0, 0], 0), 2);
    assert.deepEqual([...d.slice(0, 4)], [255, 0, 0, 255]);
    assert.deepEqual([...d.slice(12, 16)], [0, 0, 0, 255]);
  });
});
