// Lector de QR con la cámara (celular o computadora con cámara).
// Vive fuera de la interfaz que se redibuja: así la cámara no se corta cuando la pantalla se actualiza.
// Necesita HTTPS (o localhost) para que el navegador permita usar la cámara.

let activo = null;

// Abre la cámara y llama a alDetectar(texto) con el primer QR que lea. Devuelve un texto de error si no se puede abrir.
export function escanearCamara({ alDetectar, alError }) {
  if (activo) return null;
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador no da acceso a la cámara (hace falta HTTPS).';
  if (!window.jsQR) return 'No se cargó el lector de códigos.';

  const capa = document.createElement('div');
  capa.className = 'escaner';
  capa.innerHTML = `<div class="escaner-caja" role="dialog" aria-label="Escanear código QR">
      <video playsinline muted></video>
      <p>Apuntá la cámara al código QR.</p>
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

  const leer = () => {
    if (cerrado) return;
    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
      // Imagen reducida: suficiente para leer el QR y más liviana en un celular.
      const escala = Math.min(1, 640 / video.videoWidth);
      lienzo.width = Math.round(video.videoWidth * escala);
      lienzo.height = Math.round(video.videoHeight * escala);
      dibujo.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const imagen = dibujo.getImageData(0, 0, lienzo.width, lienzo.height);
      const hallado = window.jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
      if (hallado?.data) {
        const texto = hallado.data.trim();
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
