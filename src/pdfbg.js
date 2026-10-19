// Rendu de la 1re page d'un PDF en image (fond de plan), avec pdf.js embarqué.
import * as pdfjs from '../node_modules/pdfjs-dist/legacy/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
window.renderPdfFirstPage = async (base64) => {
  const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bin }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 3 });
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/png');
};
