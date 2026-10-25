import { CONFIG } from '../../../config';
import { storage } from '../../../core/storage';
import { canvasToPng } from '../canvas/pixels';
import { buildPack } from '../export/pack';
import { flattenAsset } from '../model';
import { session } from '../session';
import { h, modal, toast } from '../ui/dom';

/**
 * Injecte dans le HTML du jeu un script qui redirige `sprites/<fichier>` vers les blobs du projet
 * (propriété Image.src + fetch). Le code du jeu n'est PAS modifié.
 */
export function buildTestDoc(gameHtml: string, map: Record<string, string>): string {
  // Le service worker du jeu est désactivé DANS l'iframe de test (il polluerait le cache de l'éditeur).
  const inj = `<script>(function(){try{delete Navigator.prototype.serviceWorker}catch(e){}var M=${JSON.stringify(map)};var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');` +
    `Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){if(typeof v==='string'&&M[v])v=M[v];d.set.call(this,v)}});` +
    `var f=window.fetch;window.fetch=function(u){var a=[].slice.call(arguments);if(typeof u==='string'&&M[u])a[0]=M[u];return f.apply(this,a)}})();<\/script>`;
  return /<head[^>]*>/i.test(gameHtml) ? gameHtml.replace(/<head[^>]*>/i, (m) => m + inj) : inj + gameHtml;
}

async function loadGameHtml(): Promise<string | null> {
  const url = session.adapter.testGameUrl;
  if (url) { try { const r = await fetch(url); if (r.ok) return await r.text(); } catch { /* repli */ } }
  return (await storage.get<string>(CONFIG.storage.gameHtmlKey + session.adapter.id)) ?? null;
}

export async function openTestGame(): Promise<void> {
  let html = await loadGameHtml();
  if (!html) {
    const inp = h('input', { type: 'file', accept: '.html' });
    inp.addEventListener('change', async () => { const f = inp.files?.[0]; if (!f) return; await storage.put(CONFIG.storage.gameHtmlKey + session.adapter.id, await f.text()); void openTestGame(); });
    modal('Tester dans le jeu', h('div', {}, h('p', {}, 'Choisis le index.html du jeu (une seule fois, il est mémorisé).'), inp));
    return;
  }
  const map: Record<string, string> = {}, dir = session.adapter.exportDir;
  const keys: string[] = [];
  for (const a of session.project.assets.values()) {
    const png = await canvasToPng(flattenAsset(a, session.adapter));
    map[`${dir}/${a.spec.fileName}`] = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })); keys.push(a.key);
  }
  const pack = buildPack(keys, session.adapter, session.project.customSkins, session.project.basePack);
  map[`${dir}/${session.adapter.packFile}`] = URL.createObjectURL(new Blob([JSON.stringify(pack)], { type: 'application/json' }));
  html = buildTestDoc(html, map);
  const frame = h('iframe', { class: 'game-frame', title: 'Jeu', sandbox: 'allow-scripts allow-same-origin', srcdoc: html });
  const m = modal('Tester dans le jeu', h('div', { class: 'game-wrap' }, frame), [{ label: 'Fermer', onClick: () => { Object.values(map).forEach(URL.revokeObjectURL); } }], true);
  toast('Clique dans le jeu pour jouer (ZQSD, J pour attaquer)'); void m;
}
