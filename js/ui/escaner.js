// Lector de códigos con la cámara: QR y códigos de barras comunes (celular o computadora con cámara).
// Vive fuera de la interfaz que se redibuja: así la cámara no se corta cuando la pantalla se actualiza.
// Necesita HTTPS (o localhost) para que el navegador permita usar la cámara.
// Lee con BarcodeDetector si el navegador lo trae (Chrome en Android); si no, con jsQR (solo QR).

let activo = null;
const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

// Abre la cámara y llama a alDetectar(texto) con el primer código que lea. Devuelve un texto de error si no se puede abrir.
export function escanearCamara({ alDetectar, alError }) {
  if (activo) return null;
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador no da acceso a la cámara (hace falta HTTPS).';
  const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: FORMATOS }) : null;
  if (!detector && !window.jsQR) return 'No se cargó el lector de códigos.';

  const capa = document.createElement('div');
  capa.className = 'escaner';
  capa.innerHTML = `<div class="escaner-caja" role="dialog" aria-label="Escanear código">
      <video playsinline muted></video>
      <p>Apuntá la cámara al código (QR o de barras).</p>
      <button class="btn sec" type="button">Cancelar</button>
    </div>`;
  document.body.append(capa);

  const video = capa.querySelector('video');
  const lienzo = document.createElement('canvas');
  const dibujo = lienzo.getContext('2d', { willReadFrequently: true });
  let flujo = null, cuadro = 0, cerrado = false;

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    cancelAnimationFrame(cuadro);
    flujo?.getTracks().forEach(t => t.stop());
    capa.remove();
    activo = null;
  };
  capa.querySelector('button').addEventListener('click', cerrar);
  activo = { cerrar };

  // Primero el lector nativo de códigos de barras; si no encuentra nada, jsQR para los QR.
  const decodificar = async () => {
    if (detector) {
      try {
        const hallados = await detector.detect(lienzo);
        if (hallados.length) return hallados[0].rawValue.trim();
      } catch { /* sigue con jsQR */ }
    }
    if (window.jsQR) {
      const imagen = dibujo.getImageData(0, 0, lienzo.width, lienzo.height);
      const hallado = window.jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
      if (hallado?.data) return hallado.data.trim();
    }
    return null;
  };

  const leer = async () => {
    if (cerrado) return;
    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
      // Imagen reducida: suficiente para leer el código y más liviana en un celular.
      const escala = Math.min(1, 640 / video.videoWidth);
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      dibujo.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const texto = await decodificar();
      if (cerrado) return;
      if (texto) {
        cerrar();
        alDetectar(texto);
        return;
      }
    }
    cuadro = requestAnimationFrame(leer);
  };

  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    .then(s => {
      if (cerrado) { s.getTracks().forEach(t => t.stop()); return; }
      flujo = s;
      video.srcObject = s;
      return video.play().then(() => { cuadro = requestAnimationFrame(leer); });
    })
    .catch(() => {
      cerrar();
      alError?.('No se pudo usar la cámara. Revisá que hayas dado permiso en el navegador.');
    });
  return null;
}
