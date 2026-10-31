// Lectura de códigos con la cámara.
// 1) BarcodeDetector (navegadores que lo tienen): QR y códigos de barras.
// 2) Respaldo jsQR (solo QR) cargado desde jsDelivr cuando no hay detector nativo.

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.2/dist/jsQR.js';
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

let jsqrCarga = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!jsqrCarga) {
    jsqrCarga = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = JSQR_URL;
      s.onload = () => resolver(window.jsQR);
      s.onerror = () => rechazar(new Error('No se pudo cargar el lector de QR'));
      document.head.appendChild(s);
    });
  }
  return jsqrCarga;
}

export const camaraDisponible = () => Boolean(navigator.mediaDevices?.getUserMedia);

// Devuelve una función para detener la cámara.
// alDetectar(valor) se llama una sola vez con el primer código leído.
export async function escanearCamara({ video, alDetectar, alError }) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch {
    alError(new Error('No se pudo usar la cámara. Revisá el permiso del navegador.'));
    return () => {};
  }

  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();

  const detector = 'BarcodeDetector' in window
    ? new BarcodeDetector({ formats: FORMATOS })
    : null;
  const lienzo = document.createElement('canvas');
  const g = lienzo.getContext('2d', { willReadFrequently: true });
  let jsqr = null;
  let activo = true;
  let ocupado = false;
  let ultimo = 0;
  let frame = 0;

  const parar = () => {
    activo = false;
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  async function decodificar() {
    if (detector) {
      const hallazgos = await detector.detect(video).catch(() => []);
      if (hallazgos.length) return hallazgos[0].rawValue;
    }
    if (!jsqr) jsqr = await cargarJsQR().catch(() => null);
    if (!jsqr || !video.videoWidth) return null;
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    g.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const imagen = g.getImageData(0, 0, lienzo.width, lienzo.height);
    return jsqr(imagen.data, imagen.width, imagen.height)?.data || null;
  }

  async function bucle(t) {
    if (!activo) return;
    if (!ocupado && video.readyState >= 2 && t - ultimo > 250) {
      ocupado = true;
      ultimo = t;
      const valor = await decodificar().catch(() => null);
      ocupado = false;
      if (valor && activo) {
        parar();
        alDetectar(String(valor).trim());
        return;
      }
    }
    frame = requestAnimationFrame(bucle);
  }

  frame = requestAnimationFrame(bucle);
  return parar;
}
