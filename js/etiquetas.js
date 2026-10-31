// Etiquetas QR de los objetos. El generador es local (js/vendor), sin CDN.
let cargando = null;

export function cargarGeneradorQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!cargando) {
    cargando = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/qrcode-generator.js';
      s.onload = () => resolver(window.qrcode);
      s.onerror = () => rechazar(new Error('No se pudo cargar el generador de QR'));
      document.head.appendChild(s);
    });
  }
  return cargando;
}

// SVG del QR con el código interno. El contenido es solo el código, igual que lo que se escanea.
export async function svgQR(texto) {
  const qrcode = await cargarGeneradorQR();
  const qr = qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}
