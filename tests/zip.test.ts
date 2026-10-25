import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { crc32, readZip, writeZip } from '../src/core/zip';

describe('zip', () => {
  it('crc32 connu', () => assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926));
  it('aller-retour écriture/lecture', async () => {
    const e = [{ path: 'sprites/a.png', data: new Uint8Array([1, 2, 3]) }, { path: 'é ü.txt', data: new TextEncoder().encode('bonjour') }];
    const back = await readZip(writeZip(e));
    assert.deepEqual(back.map((x) => x.path), e.map((x) => x.path));
    assert.deepEqual([...back[0]!.data], [1, 2, 3]);
    assert.equal(new TextDecoder().decode(back[1]!.data), 'bonjour');
  });
  it('lit un vrai ZIP compressé (deflate) fabriqué par l\'outil `zip` / python', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x'.repeat(5000));
    fs.mkdirSync(path.join(dir, '__MACOSX'));
    fs.writeFileSync(path.join(dir, '__MACOSX', 'junk'), 'j');
    const zipPath = path.join(dir, 't.zip');
    execFileSync('python3', ['-c', `import zipfile,sys;z=zipfile.ZipFile('${zipPath}','w',zipfile.ZIP_DEFLATED);z.write('${dir}/a.txt','a.txt');z.write('${dir}/__MACOSX/junk','__MACOSX/junk');z.close()`]);
    const out = await readZip(new Uint8Array(fs.readFileSync(zipPath)));
    assert.equal(out.length, 1, '__MACOSX ignoré');
    assert.equal(out[0]!.data.length, 5000);
  });
  it('un ZIP écrit est lisible par python (validité)', () => {
    const f = path.join(os.tmpdir(), 'w.zip');
    fs.writeFileSync(f, writeZip([{ path: 'sprites/pack.json', data: new TextEncoder().encode('{}') }]));
    const r = execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile('${f}');print(z.testzip(), z.namelist())`]).toString();
    assert.match(r, /None \['sprites\/pack.json'\]/);
  });
  it('rejette un fichier non ZIP', async () => assert.rejects(() => readZip(new Uint8Array(100)), /ZIP invalide/));
});
