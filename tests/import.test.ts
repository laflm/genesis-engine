import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeZip } from '../src/core/zip';
import { removeBackground, detectBackground } from '../src/modules/sprite-editor/import/bgremove';
import { diagnose } from '../src/modules/sprite-editor/import/fitPlan';
import { collectImport } from '../src/modules/sprite-editor/import/importers';
import { matchEntries, normalizeName } from '../src/modules/sprite-editor/import/matcher';
import { pngSize } from '../src/modules/sprite-editor/import/png';
import { adapter, fixture } from './helpers';

const ent = (name: string, w = 10, h = 10) => ({ name, bytes: new Uint8Array(), width: w, height: h });

describe('png / importers', () => {
  it('lit les dimensions des fixtures', () => {
    assert.deepEqual(pngSize(fixture('hero_sheet.png')), { w: 1560, h: 800 });
    assert.deepEqual(pngSize(fixture('church.png')), { w: 300, h: 320 });
    assert.equal(pngSize(new Uint8Array(40)), null);
  });
  it('collecte PNG + ZIP + pack.json, ignore le reste avec une raison', async () => {
    const zip = writeZip([{ path: 'dossier/item_ceohat.png', data: fixture('item_ceohat.png') }, { path: 'pack.json', data: new TextEncoder().encode('{"sheets":{"hero":"hero_sheet.png"}}') }]);
    const r = await collectImport([
      { name: 'hero_sheet.png', bytes: fixture('hero_sheet.png') },
      { name: 'pack.zip', bytes: zip },
      { name: 'photo.jpg', bytes: new Uint8Array(3) },
      { name: 'cassé.png', bytes: new Uint8Array(30) },
    ]);
    assert.equal(r.entries.length, 2);
    assert.equal(r.packMap.get('hero_sheet.png'), 'hero');
    assert.equal(r.ignored.length, 2);
    assert.match(r.ignored.join('|'), /format non pris en charge/);
    assert.match(r.ignored.join('|'), /PNG invalide/);
  });
});

describe('association fichier → clé', () => {
  it('normalise les noms', () => {
    assert.equal(normalizeName('hero_sheet.png'), 'hero');
    assert.equal(normalizeName('Item-Sword (1).PNG'), 'item_sword');
    assert.equal(normalizeName('chest open.png'), 'chest_open');
    assert.equal(normalizeName('dir/Icon_Sword_final.png'), 'icon_sword');
  });
  it('les 8 fichiers de l\'utilisateur sont rangés aux bonnes clés', () => {
    const names = ['hero_sheet.png', 'item_ceohat.png', 'church.png', 'chest.png', 'chest_open.png', 'item_ceosuit.png', 'item_mecha.png', 'item_meteorstaff.png'];
    const r = matchEntries(names.map((n) => ent(n)), adapter);
    assert.deepEqual(r.map((x) => x.key), ['hero', 'item_ceohat', 'church', 'chest', 'chest_open', 'item_ceosuit', 'item_mecha', 'item_meteorstaff']);
  });
  it('ambigu → pas de choix silencieux', () => {
    const [r] = matchEntries([ent('sword.png')], adapter);
    assert.equal(r!.key, null);
    assert.equal(r!.how, 'ambiguous');
    assert.deepEqual(r!.candidates.sort(), ['icon_sword', 'item_sword']);
  });
  it('un alias non ambigu est accepté (cap → item_cap ET icon_cap = ambigu, ceohat idem)', () => {
    const [r] = matchEntries([ent('hero.PNG')], adapter);
    assert.equal(r!.key, 'hero');
  });
  it('pack.json prioritaire ; doublons signalés', () => {
    const r = matchEntries([ent('moi.png'), ent('hero.png'), ent('hero_sheet.png')], adapter, new Map([['moi.png', 'robot']]));
    assert.equal(r[0]!.key, 'robot'); assert.equal(r[0]!.how, 'pack');
    assert.equal(r[1]!.key, 'hero'); assert.equal(r[1]!.how, 'exact');
    assert.equal(r[2]!.key, null); assert.match(r[2]!.note!, /Doublon/);
  });
  it('inconnu → propose des candidats', () => {
    const [r] = matchEntries([ent('xyz_zzz.png')], adapter);
    assert.equal(r!.how, 'none');
  });
});

describe('diagnostic de taille', () => {
  const hero = adapter.spec('hero')!;
  it('sheet conforme', () => assert.equal(diagnose(hero, adapter, 1560, 800).ok, true));
  it('moitié de taille → mise à l\'échelle recommandée, autres choix proposés, message clair', () => {
    const d = diagnose(hero, adapter, 780, 400);
    assert.equal(d.ok, false);
    assert.match(d.message, /attendues 1560×800.*reçu 780×400/);
    assert.deepEqual(d.options.map((o) => o.mode).sort(), ['crop-pad', 'reslice', 'scale', 'single-frame']);
    assert.equal(d.recommended, 'scale');
  });
  it('ratio différent et grille non multiple → recadrage ancré aux pieds', () => {
    const d = diagnose(hero, adapter, 1000, 900);
    assert.equal(d.recommended, 'crop-pad');
    assert.ok(!d.options.some((o) => o.mode === 'reslice'));
  });
  it('grille de frames de la bonne taille mais autre nombre → redécoupage', () => {
    const d = diagnose(hero, adapter, 1040, 600);
    assert.ok(d.options.some((o) => o.mode === 'reslice'));
    assert.equal(d.recommended, 'reslice');
  });
  it('image plus petite qu\'une frame → image unique', () => assert.equal(diagnose(hero, adapter, 120, 150).recommended, 'single-frame'));
  it('sprites fixes : seul le ratio compte', () => {
    const church = adapter.spec('church')!;
    assert.equal(diagnose(church, adapter, 300, 320).ok, true);
    const half = diagnose(church, adapter, 150, 160);
    assert.equal(half.ok, true); assert.match(half.message, /ratio compatible/);
    const bad = diagnose(church, adapter, 300, 100);
    assert.equal(bad.ok, false); assert.match(bad.message, /déformée/);
  });
  it('les sheets d\'équipement attendent 1560×800 comme le corps', () => assert.equal(diagnose(adapter.spec('item_ceohat')!, adapter, 1560, 800).ok, true));
});

describe('suppression de fond', () => {
  // 7×7 : fond blanc, anneau noir, « œil » blanc au centre (à conserver).
  const mk = (): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(7 * 7 * 4).fill(255);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) { const i = (y * 7 + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    const c = (3 * 7 + 3) * 4; d[c] = d[c + 1] = d[c + 2] = 255;
    return d;
  };
  it('détecte un fond uni, pas un fond transparent', () => {
    assert.deepEqual(detectBackground(mk(), 7, 7), { r: 255, g: 255, b: 255 });
    assert.equal(detectBackground(new Uint8ClampedArray(7 * 7 * 4), 7, 7), null);
  });
  it('mode contigu : garde l\'œil blanc intérieur', () => {
    const d = mk(); const n = removeBackground(d, 7, 7, { r: 255, g: 255, b: 255 }, 10, true);
    assert.equal(n, 49 - 25);
    assert.equal(d[(3 * 7 + 3) * 4 + 3], 255);
    assert.equal(d[3], 0);
  });
  it('mode global : efface aussi l\'intérieur ; tolérance respectée', () => {
    const d = mk(); assert.equal(removeBackground(d, 7, 7, { r: 255, g: 255, b: 255 }, 10, false), 25);
    const e = mk(); e[0] = 240; assert.equal(removeBackground(e, 7, 7, { r: 255, g: 255, b: 255 }, 5, true), 24 - 1);
  });
});
