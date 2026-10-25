// Outils canvas bas niveau (navigateur uniquement).
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
export const ctxOf = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d', { willReadFrequently: true })!;

export function cloneCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const o = makeCanvas(c.width, c.height); ctxOf(o).drawImage(c, 0, 0); return o;
}
export function isEmptyCanvas(c: HTMLCanvasElement): boolean {
  const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return false;
  return true;
}
export function canvasToPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((res, rej) => c.toBlob((b) => {
    if (!b) return rej(new Error('Encodage PNG impossible (mémoire canvas insuffisante ?)'));
    b.arrayBuffer().then((ab) => res(new Uint8Array(ab)), rej);
  }, 'image/png'));
}
export async function decodeImage(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
  const c = makeCanvas(bmp.width, bmp.height);
  ctxOf(c).drawImage(bmp, 0, 0); bmp.close();
  return c;
}
