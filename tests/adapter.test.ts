import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { adapter } from './helpers';

describe('adaptateur Black Boy Go!', () => {
  it('reprend SHEETDIM / ANIMS / LAYER du jeu', () => {
    assert.deepEqual(adapter.spec('hero'), { key: 'hero', kind: 'sheet', group: 'skin', label: 'Héros (joueur)', fileName: 'hero.png', packSection: 'sheets', fw: 260, fh: 200, ax: 130, ay: 180 });
    assert.equal(adapter.spec('robot')?.fw, 160);
    assert.equal(adapter.spec('boss')?.ay, 235);
    assert.equal(adapter.sheetCols, 6);
    assert.equal(adapter.sheetRows, 4);
    assert.deepEqual(adapter.layerOrder, ['foot', 'body', 'talisman', 'head', 'shield', 'weapon']);
  });
  it('les sheets d\'équipement suivent la grille du corps', () => {
    const s = adapter.spec('item_ceohat')!;
    assert.equal(s.kind, 'sheet'); assert.equal(s.slot, 'head');
    assert.deepEqual([s.fw, s.fh, s.ax, s.ay], [260, 200, 130, 180]);
  });
  it('déclare sprites fixes, icônes et items lus dans le jeu', () => {
    for (const k of ['shop', 'arcade', 'house', 'gate', 'church', 'forge', 'chest', 'chest_open']) assert.equal(adapter.spec(k)?.kind, 'sprite', k);
    assert.equal(adapter.spec('icon_sword')?.kind, 'icon');
    assert.equal(adapter.specs.filter((s) => s.group === 'item').length, 62);
    assert.equal(new Set(adapter.specs.map((s) => s.key)).size, adapter.specs.length, 'clés uniques');
    assert.equal(adapter.spec('item_potion_hp'), undefined, 'une potion n\'a pas de sheet');
    assert.ok(adapter.spec('icon_potion_hp'));
  });
  it('items.generated.json correspond au index.html du jeu (pas d\'item codé en dur)', () => {
    const out = path.join(os.tmpdir(), 'items-check.json');
    execFileSync('node', ['scripts/extract-items.mjs', 'public/game/index.html', out]);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), JSON.parse(fs.readFileSync('src/games/black-boy-go/items.generated.json', 'utf8')));
  });
  it('choix d\'animation identique au jeu', () => {
    assert.equal(adapter.selectAnimation({ swing: 0.1, hit: 1, vx: 99 }), 'attack');
    assert.equal(adapter.selectAnimation({ swing: 0, hit: 1, vx: 99 }), 'hurt');
    assert.equal(adapter.selectAnimation({ swing: 0, hit: 0, vx: -21 }), 'walk');
    assert.equal(adapter.selectAnimation({ swing: 0, hit: 0, vx: 20 }), 'idle');
    assert.equal(adapter.frameFor('attack', 0, 0.25), 0);
    assert.equal(adapter.frameFor('attack', 0, 0), 3);
    assert.equal(adapter.frameFor('walk', 0.5, 0), 5 % 6);
  });
});
