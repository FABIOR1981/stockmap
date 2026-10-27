// Etiquetas con código QR para lugares y objetos. Se genera una hoja imprimible en una ventana nueva.
// El QR de un lugar contiene su identificador; el de un objeto, su código interno.

import { esc } from './estado.js';

// SVG del QR de un texto (la librería vendida en js/vendor/qrcode.js deja `qrcode` global).
function qrSVG(texto) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

// items: [{ codigo: texto del QR, titulo, detalle }]
export function abrirEtiquetas(titulo, items) {
  const celdas = items.map(it => `<figure class="et">
      ${qrSVG(it.codigo)}
      <figcaption><strong>${esc(it.titulo)}</strong>${it.detalle ? `<span>${esc(it.detalle)}</span>` : ''}</figcaption>
    </figure>`).join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(titulo)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 12mm; color: #111; }
      h1 { font-size: 15px; margin: 0 0 8mm; }
      .hoja { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm 4mm; }
      .et { margin: 0; border: 1px dashed #999; padding: 3mm; text-align: center; break-inside: avoid; }
      .et svg { width: 34mm; height: 34mm; display: block; margin: 0 auto 2mm; }
      .et figcaption { display: grid; gap: 1mm; font-size: 10px; }
      .et figcaption span { color: #444; word-break: break-word; }
      @media print { .et { border-color: #ccc; } }
    </style></head><body>
    <h1>${esc(titulo)}</h1>
    <div class="hoja">${celdas || '<p>No hay nada para imprimir.</p>'}</div>
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  if (!w) return 'El navegador bloqueó la ventana de impresión. Permití ventanas emergentes para esta página.';
  w.document.open(); w.document.write(html); w.document.close();
  return null;
}
