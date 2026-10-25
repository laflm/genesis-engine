import fs from 'node:fs';
import path from 'node:path';
import { createAdapter } from '../src/engine/adapter';
import { blackBoyGo } from '../src/games/black-boy-go/adapter';

export const adapter = createAdapter(blackBoyGo);
export const fixture = (n: string): Uint8Array => new Uint8Array(fs.readFileSync(path.join('tests/fixtures', n)));
