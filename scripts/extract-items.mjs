// Lit l'objet ITEMS du jeu (index.html) et génère src/games/black-boy-go/items.generated.json.
// Usage : node scripts/extract-items.mjs [chemin/index.html] [sortie.json]
import fs from 'node:fs';

const src = process.argv[2] ?? 'public/game/index.html';
const out = process.argv[3] ?? 'src/games/black-boy-go/items.generated.json';
const html = fs.readFileSync(src, 'utf8');

/** Trouve l'accolade fermante correspondant à l'accolade ouvrante à `open` (ignore les chaînes). */
function matchBrace(s, open) {
  let depth = 0, q = null;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '\\') i++; else if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  throw new Error('Accolade fermante introuvable');
}

const start = html.indexOf('const ITEMS={');
if (start < 0) throw new Error('const ITEMS={ introuvable dans ' + src);
const open = html.indexOf('{', start);
const close = matchBrace(html, open);
const body = html.slice(open + 1, close);

const items = [];
const re = /([A-Za-z0-9_]+):\{/g;
let pos = 0, m;
while ((m = re.exec(body))) {
  if (m.index < pos) continue;
  const o = m.index + m[0].length - 1;
  const c = matchBrace(body, o);
  const entry = body.slice(o, c + 1);
  pos = c + 1;
  const name = /name:'([^']*)'/.exec(entry)?.[1] ?? m[1];
  const slot = /slot:'([a-z]+)'/.exec(entry)?.[1];
  items.push(slot ? { id: m[1], name, slot } : { id: m[1], name });
}
fs.writeFileSync(out, JSON.stringify(items, null, 1) + '\n');
const withSlot = items.filter((i) => i.slot).length;
console.log(`${items.length} items (${withSlot} équipables) -> ${out}`);
