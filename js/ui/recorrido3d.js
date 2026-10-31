// Recorrido 3D (prototipo, solo PC): caminás por un pasillo de estanterías en primera persona.
// Cada estante es una tabla que sale de la columna hacia el pasillo; los objetos son cajas apoyadas sobre el estante.
// Usa Three.js, cargado en index.html como global THREE (js/vendor/three.min.js).

import { ctx, S, esc, msgHTML, aviso } from './estado.js';
import { posEnPlano } from './plano.js';
import { calcularRuta, limitesDentroDelGalpon, dentroDe, acomodarEnGalpon, pisoLibre, RADIO_CUERPO } from './recorrido/ruta.js';
import { LARGO, FONDO, MITAD, ALTO, BASE, huella, frenteDe, agruparPasillos, calcularDisposicion } from './recorrido/disposicion.js';
import { caja, construirEscena, agregarCajasSueltas } from './recorrido/escena.js';
import { metrosACm, desdeEsquinaCm } from '../core/medidas.js';
import { generarCajas, semillaDe } from './recorrido/obstaculos.js';
import { montarAerea, guardarDisposicion } from './recorrido/aerea.js';

const OJOS = 1.55;       // altura de la cámara
const VEL = 1.1;         // velocidad al caminar (unidades por segundo): suave, para no pasarse de largo
const VEL_MIRAR = 1.2;    // velocidad al mirar arriba/abajo (radianes por segundo)
const TECLAS_MIRAR = { PageUp: 1, r: 1, PageDown: -1, f: -1 };
const VEL_OJOS = 1.0;     // velocidad para subir o bajar la altura de los ojos (metros por segundo)
const TECLAS_OJOS = { e: 1, q: -1 };
const OJO_MIN = 0.5, OJO_MAX = 3.6;   // altura mínima y máxima de los ojos
const GIRO_VEL = 1.1;     // velocidad al girar (radianes por segundo): igual que caminar, mientras se mantiene la tecla
const TECLAS_CAMINAR = { ArrowUp: 1, w: 1, ArrowDown: -1, s: -1 };
const TECLAS_GIRAR = { ArrowLeft: 1, a: 1, ArrowRight: -1, d: -1 };

// Estado del recorrido 3D entre dibujos de la pantalla.
const R = {
  mot: null,                    // motor activo (renderer, cámara, teclas)
  fsListo: false,               // evita registrar dos veces el aviso de pantalla completa
  paseo: null,                  // caminata automática hasta frente a un lugar (botón Pasear)
  pos: { clave: null, z: 0.6, yaw: 0, pitch: 0 },   // posición recordada entre re-dibujos de la pantalla
};


// Altura de los ojos para ver de frente un estante: medio metro sobre su tabla.
function altoOjos(sel, est) {
  const dep = ctx.dep;
  const estante = sel ? dep.ruta(sel)[2] : null;
  const hermanos = est ? dep.hijos(est.id) : [];
  const fi = estante ? hermanos.findIndex(h => h.id === estante.id) : -1;
  if (fi < 0) return OJOS;
  const n = hermanos.length;
  const tabla = BASE + (ALTO / n) * (n - 1 - fi);
  return Math.max(OJO_MIN, Math.min(OJO_MAX, tabla + 0.5));
}

// Ángulo normalizado entre -π y π.
const angulo = a => Math.atan2(Math.sin(a), Math.cos(a));

// Guarda dónde quedó la cámara y libera el motor.
export function desmontarRecorrido3D() {
  if (!R.mot) return;
  R.mot.limpiar?.();
  cancelAnimationFrame(R.mot.raf);
  window.removeEventListener('keydown', R.mot.onDown);
  window.removeEventListener('keyup', R.mot.onUp);
  R.pos = { clave: R.mot.clave, z: R.mot.camara.position.z, x: R.mot.camara.position.x, y: R.mot.camara.position.y, yaw: R.mot.yaw, pitch: R.mot.pitch };
  R.mot.renderer.dispose();
  R.mot.renderer.forceContextLoss?.();
  R.mot = null;
}

// Disposición de las estanterías: funciones puras en recorrido/disposicion.js.
// Las posiciones guardadas están desde la esquina del galpón; el recorrido las usa centradas en el ancho.
const lugaresDe = edificio => {
  const ds = ctx.dep.hijos(edificio.id);
  const ancho = edificio.dim_ancho;
  if (!ancho || !edificio.dim_largo) return ds;
  return ds.map(l => l.vista_x == null ? l : { ...l, vista_x: desdeEsquinaCm(l.vista_x, ancho) });
};
const filasDe = edificio => agruparPasillos(lugaresDe(edificio), posEnPlano);
function disposicionEdificio(edificio) { return calcularDisposicion(filasDe(edificio)); }
// Medidas del galpón en metros (null si el edificio todavía no tiene medidas).
function galponDe(edificio) {
  return edificio.dim_ancho && edificio.dim_largo ? { A: edificio.dim_ancho / 100, L: edificio.dim_largo / 100 } : null;
}
// Arma la escena en el contenedor #r3d de la pantalla actual (se llama después de cada dibujo).
export function montarRecorrido3D() {
  const cont = document.getElementById('r3d');
  desmontarRecorrido3D();
  if (!cont || !S.nodo) return;
  const edificio = ctx.dep.porId(S.nodo);
  if (!edificio) return;
  if (S.rec.aerea) return montarAerea(cont, edificio, { R, disp: disposicionEdificio(edificio), desmontar: desmontarRecorrido3D });
  // Todas las estanterías del edificio, en las mismas posiciones que la vista aérea.
  const fila = pasillosDe(edificio).flat();
  const clave = edificio.id;
  const g = galponDe(edificio);
  const base = disposicionEdificio(edificio);
  const disp = new Map([...(g ? acomodarEnGalpon(base, g, huella) : base)]
    .map(([id, d]) => [id, { ...d, lado: d.x < 0 ? 'izq' : 'der' }]));
  // Cajas sueltas: se evitan las estanterías, sus frentes (los pasos) y la entrada. Misma semilla = misma distribución.
  const evitar = [...disp.values()].map(d => {
    const h = huella(d.giro), f = frenteDe({ ...d, lado: d.x < 0 ? 'izq' : 'der' });
    return [{ x: d.x, z: d.z, ex: h.ex, ez: h.ez }, { x: f.x, z: f.z, ex: 0.8, ez: 0.8 }];
  }).flat();
  evitar.push({ x: 0, z: 0.5, ex: 1.2, ez: 1 });
  const { escena, zMin, xLim, destacado } = construirEscena(fila, disp, g, S.destaque?.id || null);
  const zona = g
    ? { x0: -g.A / 2 + 0.6, x1: g.A / 2 - 0.6, z0: zMin + 0.6, z1: -1.5 }
    : { x0: -xLim + 0.5, x1: xLim - 0.5, z0: zMin + 0.6, z1: -1.5 };
  const cajas = generarCajas({ semilla: semillaDe(edificio.id, (S.cajas?.[edificio.id] || 0) * 101), zona, evitar, cantidad: 10 });
  agregarCajasSueltas(escena, cajas);
  // Dónde se puede pisar: con medidas, dentro de las paredes del galpón; siempre, fuera de las estanterías y cajas.
  const piso = g ? { x0: -g.A / 2 + RADIO_CUERPO, x1: g.A / 2 - RADIO_CUERPO, z0: zMin + 0.05, z1: 1 } : null;
  const libre = pisoLibre(disp, huella, piso, cajas);
  const ancho = cont.clientWidth || 800, alto = 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  cont.innerHTML = '';
  cont.appendChild(renderer.domElement);

  // Búsqueda: si acaba de buscarse un lugar, la cámara se pone frente a su estantería, mirándola.
  if (S.rec.irA) {
    S.rec.irA = false;
    const pasear = !!S.rec.pasear;
    S.rec.pasear = false;
    const sel = S.elegido ? ctx.dep.porId(S.elegido) : null;
    const est = sel ? ctx.dep.ruta(sel)[1] : null;
    const idx = est ? fila.findIndex(k => k.id === est.id) : -1;
    // La cámara queda frente al centro de la estantería (mirando hacia la pared donde está).
    if (idx >= 0) {
      const f = frenteDe(disp.get(est.id));
      const ojo = altoOjos(sel, est);
      if (pasear) {
        // Pasear: camina desde donde está hasta frente al lugar (si está en otro pasillo, arranca desde su inicio).
        if (R.pos.clave !== clave) R.pos = { clave, z: 0.6, x: 0, yaw: 0, pitch: 0 };
        // Camina con la vista a la altura normal; al llegar ajusta la vista al estante (si hace falta).
        R.paseo = { x: f.x, z: f.z, yaw: f.yaw, y: OJOS, yFin: ojo,
          planear: (x, z) => calcularRuta(disp, { x, z }, { x: f.x, z: f.z }, huella, piso, cajas) };
      } else {
        R.pos = { clave, z: f.z, x: f.x, y: ojo, yaw: f.yaw, pitch: 0 };
        R.paseo = null;
      }
    }
  }
  if (R.pos.clave !== clave) R.pos = { clave, z: 0.6, yaw: 0, pitch: 0 };
  const camara = new THREE.PerspectiveCamera(70, ancho / alto, 0.05, 400);
  camara.position.set(R.pos.x || 0, R.pos.y ?? OJOS, R.pos.z);

  const teclas = new Set();
  const onDown = e => {
    // Las flechas siempre caminan (aunque el foco esté en un selector o un botón); las letras se escriben en los campos de texto.
    const campoTexto = e.target.matches?.('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable]');
    if (campoTexto && !e.key.startsWith('Arrow')) return;
    if (TECLAS_GIRAR[e.key] || TECLAS_CAMINAR[e.key]) R.paseo = null;   // tocar una tecla de movimiento corta la caminata
    if (TECLAS_GIRAR[e.key] || TECLAS_CAMINAR[e.key] || TECLAS_MIRAR[e.key] || TECLAS_OJOS[e.key]) { e.preventDefault(); teclas.add(e.key); }
  };
  const onUp = e => teclas.delete(e.key);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  // Botones táctiles: se mantienen apretados para caminar o girar, igual que las flechas.
  cont.parentElement?.querySelectorAll('.r3d-pad [data-tecla]').forEach(b => {
    const k = b.dataset.tecla;
    const abajo = e => { e.preventDefault(); R.paseo = null; teclas.add(k); };
    const arriba = () => teclas.delete(k);
    b.addEventListener('pointerdown', abajo);
    b.addEventListener('pointerup', arriba);
    b.addEventListener('pointerleave', arriba);
    b.addEventListener('pointercancel', arriba);
  });

  // Destello del hueco buscado: empieza al abrir la vista (Ir) o al llegar caminando (Pasear), y dura 5 segundos.
  const ahora = performance.now();
  let destelloDesde = null;
  if (destacado && S.destaque?.pendiente && !R.paseo) { destelloDesde = ahora; S.destaque.pendiente = false; }
  R.mot = { renderer, camara, teclas, cont, clave, onDown, onUp, raf: 0, ultimo: ahora, yaw: R.pos.yaw, pitch: R.pos.pitch || 0, w: ancho, h: alto, xLim, libre,
    destacado: destacado ? { mesh: destacado, desde: destelloDesde } : null, enMarcha: !!R.paseo };

  // Tocar un hueco selecciona su lugar; la lista de abajo muestra lo que tiene.
  const rayo = new THREE.Raycaster();
  // Arrastrar con el mouse mira alrededor (horizontal y vertical); un toque simple selecciona.
  let arrastre = null, movido = false;
  renderer.domElement.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY }; movido = false; });
  window.addEventListener('pointerup', () => { arrastre = null; });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!arrastre || !R.mot) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) movido = true;
    arrastre = { x: e.clientX, y: e.clientY };
    R.mot.yaw -= dx * 0.005;
    R.mot.pitch = Math.max(-1.25, Math.min(1.25, R.mot.pitch + dy * 0.005));
  });
  renderer.domElement.addEventListener('click', e => {
    if (movido) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(ndc, camara);
    const golpe = rayo.intersectObjects(escena.userData.hits || [], false)[0];
    if (!golpe) return;
    S.elegido = golpe.object.userData.lugar;
    S.msg = {};
    ctx.render();
  });
  const frame = t => {
    if (!cont.isConnected) return desmontarRecorrido3D();
    const dt = Math.min((t - R.mot.ultimo) / 1000, 0.05);
    R.mot.ultimo = t;
    // Caminar: W/flecha arriba hacia adelante, S/flecha abajo hacia atrás, en la dirección que mira la cámara.
    let avance = 0;
    for (const k of R.mot.teclas) { avance += TECLAS_CAMINAR[k] || 0; }
    let giro = 0;
    for (const k of R.mot.teclas) { giro += TECLAS_GIRAR[k] || 0; }
    R.mot.yaw += Math.max(-1, Math.min(1, giro)) * GIRO_VEL * dt;
    let mirar = 0;
    for (const k of R.mot.teclas) { mirar += TECLAS_MIRAR[k] || 0; }
    R.mot.pitch = Math.max(-1.25, Math.min(1.25, R.mot.pitch + Math.max(-1, Math.min(1, mirar)) * VEL_MIRAR * dt));
    let subir = 0;
    for (const k of R.mot.teclas) { subir += TECLAS_OJOS[k] || 0; }
    R.mot.camara.position.y = Math.max(OJO_MIN, Math.min(OJO_MAX, R.mot.camara.position.y + Math.max(-1, Math.min(1, subir)) * VEL_OJOS * dt));
    // Si cambia el tamaño (pantalla completa), la escena se ajusta al nuevo recuadro.
    const w = cont.clientWidth, h = cont.clientHeight;
    if (w && h && (w !== R.mot.w || h !== R.mot.h)) {
      R.mot.w = w; R.mot.h = h;
      R.mot.renderer.setSize(w, h);
      R.mot.camara.aspect = w / h;
      R.mot.camara.updateProjectionMatrix();
    }
    const v = Math.max(-1, Math.min(1, avance)) * VEL * dt;
    R.mot.camara.position.x -= Math.sin(R.mot.yaw) * v;
    R.mot.camara.position.z -= Math.cos(R.mot.yaw) * v;
    // Caminata automática (botón Pasear): gira hacia el lugar, camina a la velocidad normal y gira a su frente.
    if (R.paseo && avance === 0) {
      const cam = R.mot.camara.position;
      // Ruta desde donde está hasta el frente del lugar, sin atravesar estanterías.
      if (R.paseo.pts === undefined) R.paseo.pts = R.paseo.planear(cam.x, cam.z);
      if (R.paseo.y !== undefined) { const dy = R.paseo.y - cam.y; cam.y += Math.sign(dy) * Math.min(Math.abs(dy), VEL_OJOS * dt); }
      const tgt = R.paseo.pts[0];
      const dx = tgt.x - cam.x, dz = tgt.z - cam.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const diff = angulo(Math.atan2(-dx, -dz) - R.mot.yaw);
        if (Math.abs(diff) > 0.05) R.mot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), GIRO_VEL * dt);
        else { const m = Math.min(VEL * dt, d); cam.x += dx / d * m; cam.z += dz / d * m; }
      } else if (R.paseo.pts.length > 1) {
        R.paseo.pts.shift();   // siguiente tramo del recorrido
      } else {
        if (R.paseo.yFin !== undefined) R.paseo.y = R.paseo.yFin;   // ya llegó: sube o baja la vista al estante
        const diff = angulo(R.paseo.yaw - R.mot.yaw);
        if (Math.abs(diff) > 0.02 || (R.paseo.yFin !== undefined && Math.abs(R.paseo.yFin - cam.y) > 0.02)) R.mot.yaw += Math.sign(diff) * Math.min(Math.abs(diff), GIRO_VEL * dt);
        else R.paseo = null;
      }
    }
    // No entrar en una estantería ni en una pared: si el paso choca, se desliza por el lado que queda libre.
    const cam = R.mot.camara.position;
    if (R.mot.px !== undefined && R.mot.libre(R.mot.px, R.mot.pz) && !R.mot.libre(cam.x, cam.z)) {
      if (R.mot.libre(cam.x, R.mot.pz)) cam.z = R.mot.pz;
      else if (R.mot.libre(R.mot.px, cam.z)) cam.x = R.mot.px;
      else { cam.x = R.mot.px; cam.z = R.mot.pz; }
    }
    // Si la caminata automática no avanza (una pared o estantería no esperada), se corta en vez de quedar trabada.
    if (R.paseo && R.mot.px !== undefined) {
      const movio = Math.hypot(cam.x - R.mot.px, cam.z - R.mot.pz) > 1e-4 || Math.abs(R.mot.yaw - R.mot.yawPrev) > 1e-3;
      R.paseo.quieto = movio ? 0 : (R.paseo.quieto || 0) + dt;
      if (R.paseo.quieto > 3) R.paseo = null;
    }
    // Quedarse dentro del pasillo.
    R.mot.camara.position.x = Math.max(-R.mot.xLim, Math.min(R.mot.xLim, R.mot.camara.position.x));
    R.mot.camara.position.z = Math.max(zMin, Math.min(0.6, R.mot.camara.position.z));
    // Al llegar caminando (Pasear), el destello del hueco buscado empieza a titilar.
    const dh = R.mot.destacado;
    if (dh && dh.desde === null && R.mot.enMarcha && !R.paseo) { dh.desde = t; if (S.destaque) S.destaque.pendiente = false; }
    R.mot.enMarcha = !!R.paseo;
    if (dh && dh.desde !== null) {
      const e = t - dh.desde;
      dh.mesh.visible = e < 5000;
      if (dh.mesh.visible) dh.mesh.material.opacity = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(e / 150));
    }
    R.mot.px = R.mot.camara.position.x; R.mot.pz = R.mot.camara.position.z; R.mot.yawPrev = R.mot.yaw;
    R.mot.camara.rotation.set(R.mot.pitch, R.mot.yaw, 0, 'YXZ');
    R.mot.renderer.render(escena, R.mot.camara);
    R.mot.raf = requestAnimationFrame(frame);
  };
  R.mot.raf = requestAnimationFrame(frame);
  // Al entrar o salir de pantalla completa se redibuja el botón (y la escena se ajusta en el próximo cuadro).
  if (!R.fsListo) { R.fsListo = true; document.addEventListener('fullscreenchange', () => ctx.render()); }
}

// Medidas del galpón (en metros): sin ellas no hay contorno ni límites para las estanterías.
function panelMedidas(edificio) {
  const tieneMedidas = !!(edificio.dim_ancho && edificio.dim_largo && edificio.dim_alto);
  return `<div class="rec-medidas">
    <span class="rec-tramo">${tieneMedidas ? 'Galpón' : 'Sin medidas: las estanterías pueden salir del galpón.'}</span>
    <label>Ancho <input data-f="medAncho" inputmode="decimal" value="${esc(S.f.medAncho ?? '')}" placeholder="m"></label>
    <label>Largo <input data-f="medLargo" inputmode="decimal" value="${esc(S.f.medLargo ?? '')}" placeholder="m"></label>
    <label>Alto <input data-f="medAlto" inputmode="decimal" value="${esc(S.f.medAlto ?? '')}" placeholder="m"></label>
    <button class="btn sec sm" data-act="medirEdificio">Guardar medidas</button>
    ${msgHTML('medir')}
  </div>`;
}

export function vistaRecorrido3D() {
  const dep = ctx.dep;
  if (!dep.eid) return `<h1>Recorrido</h1><div class="vacio"><p>Elegí un cliente para ver su depósito.</p><small>Está en el menú de cuenta, abajo a la izquierda.</small></div>`;
  const edificio = S.nodo ? dep.porId(S.nodo) : null;
  if (!edificio || dep.prof(edificio) !== 0) {
    const edificios = dep.hijos(null);
    if (!edificios.length) return `<h1>Recorrido</h1><div class="vacio"><p>Todavía no hay edificios para recorrer.</p><small>Creá uno en Asignación y cargá sus medidas para verlo en 3D.</small></div>`;
    return `<h1>Recorrido</h1>
      <p class="sub">Elegí un edificio para caminar por sus pasillos.</p>
      <div class="rec-edificios">${edificios.map(e => `<button class="rec-ed" data-act="recIr" data-id="${e.id}">
          <strong>${esc(e.codigo)}${e.nombre ? ` · ${esc(e.nombre)}` : ''}</strong>
          <small>Recorrer pasillos →</small></button>`).join('')}</div>`;
  }
  const aerea = !!S.rec.aerea;
  const herramientas = aerea
    ? `<div class="r3d-buscar">
        <button class="btn sec sm" data-act="recGirar">Girar 90°</button>
        <span class="rec-tramo">${S.rec.aereaSel ? 'Estantería elegida' : 'Tocá una estantería'}</span>
      </div>`
    : `<div class="r3d-buscar">
        <input data-f="recBusca" data-enter="recBuscar" value="${esc(S.f.recBusca || '')}" placeholder="Código de lugar u objeto" aria-label="Código de lugar u objeto">
        <button class="btn sec sm" data-act="recBuscar">Ir</button>
        <button class="btn sec sm" data-act="recBuscar" data-pasear="1">Pasear</button>
        <button class="btn sec sm" data-act="recInicio" title="Vuelve a la entrada del pasillo">Volver al inicio</button>
        <button class="btn sec sm" data-act="recCajas" title="Otra distribución de las cajas del piso">Cambiar cajas</button>
      </div>`;
  const ayuda = aerea
    ? 'Arrastrá una estantería para moverla. Tocala para elegirla y girala de a 90°. Se guarda para todos los que usan este cliente.'
    : 'Caminá con ↑ y ↓ (o W y S). Girá con ← y → (o A y D). Subí o bajá la vista con E y Q. Tocá un hueco para ver qué tiene.';
  return `<div class="rec-cab">
      <button class="btn sec sm" data-act="recSubir">← Subir</button>
      <button class="btn sec sm" data-act="recIr">Edificios</button>
      <button class="btn sec sm" data-act="recAerea">${aerea ? 'Volver al recorrido' : 'Vista aérea'}</button>
    </div>
    <h1>${esc(dep.dir(edificio))}</h1>
    <p class="sub">${ayuda}</p>
    ${aerea ? panelMedidas(edificio) : ''}
    ${msgHTML('recorrido')}
    <div class="r3d-marco">
      <div id="r3d" class="r3d" aria-label="${aerea ? 'Vista aérea del edificio' : 'Recorrido 3D del pasillo'}"></div>
      ${herramientas}
      ${aerea ? '' : `<div class="r3d-pad" aria-label="Caminar con los botones">
        <button data-tecla="ArrowUp" aria-label="Avanzar">▲</button>
        <button data-tecla="ArrowLeft" aria-label="Girar a la izquierda">◀</button>
        <button data-tecla="ArrowRight" aria-label="Girar a la derecha">▶</button>
        <button data-tecla="ArrowDown" aria-label="Retroceder">▼</button>
      </div>`}
      <button class="btn sec sm r3d-ampliar" data-act="recAmpliar">${document.fullscreenElement ? 'Salir de pantalla completa' : 'Ampliar'}</button>
    </div>
    ${detalleLugar3D()}`;
}

// Lo que tiene el lugar tocado (o una indicación si no se tocó ninguno).
function detalleLugar3D() {
  const dep = ctx.dep;
  const l = S.elegido ? dep.porId(S.elegido) : null;
  if (!l) return `<p class="sub" style="margin-top:12px">Tocá un hueco en el pasillo para ver qué tiene.</p>`;
  const objs = dep.objetosDe(l.id);
  return `<section class="panel" style="margin-top:12px"><h2>${esc(dep.dir(l))}</h2>${objs.length
    ? `<ul class="rec-lista">${objs.map(o => `<li><b>${esc(o.codigo_interno)}</b> ${esc(o.descripcion || '')}</li>`).join('')}</ul>`
    : '<p class="vacio" style="border:0;margin:0">Libre.</p>'}</section>`;
}

// Acciones de la vista (se suman a ACCIONES en acciones.js).
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Agrupa las estanterías del edificio por fila en el plano: cada fila es un pasillo longitudinal.
// El espacio entre filas es el pasillo transversal. Dentro de cada fila, de izquierda a derecha.
export function pasillosDe(edificio) {
  return filasDe(edificio);
}

export const accionesRecorrido3d = {
  // Otra distribución al azar de las cajas sueltas del piso.
  // La distribución de cajas se guarda por edificio: no se pierde al buscar, Pasear o cambiar de pasillo.
  recCajas: () => { S.cajas = { ...(S.cajas || {}), [S.nodo]: (S.cajas?.[S.nodo] || 0) + 1 }; },
  // Lleva la cámara a la entrada del pasillo, mirando hacia el fondo (para salir de entre las estanterías).
  recInicio: () => {
    if (!R.mot) return;
    R.mot.camara.position.x = 0; R.mot.camara.position.z = 0.6;
    R.mot.yaw = 0; R.mot.pitch = 0; R.paseo = null;
  },
  // Elige el edificio cuyo pasillo se recorre (sin id: vuelve a la lista de edificios).
  recIr: el => { S.nodo = el.id || null; S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {}; },
  // Sube un nivel dentro del recorrido.
  recSubir: () => {
    const l = ctx.dep.porId(S.nodo);
    S.nodo = l?.padre_id || null;
    S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {};
  },
  // Pantalla completa para ver el pasillo más grande (con las flechas se sigue caminando; Esc sale).
  recAmpliar: () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },
  // Alterna entre el recorrido y la vista aérea del edificio.
  recAerea: () => {
    S.rec.aerea = !S.rec.aerea; S.rec.irA = false; S.elegido = null; S.msg = {};
    // Al entrar a la vista aérea, el formulario de medidas muestra las del edificio.
    const ed = S.rec.aerea && S.nodo ? ctx.dep.porId(S.nodo) : null;
    if (ed) {
      const m = (v) => (v ? String(v / 100) : '');
      Object.assign(S.f, { medAncho: m(ed.dim_ancho), medLargo: m(ed.dim_largo), medAlto: m(ed.dim_alto) });
    }
  },
  // Guarda las medidas del galpón (en metros) del edificio que se está viendo.
  medirEdificio: () => {
    const medidas = metrosACm(S.f.medAncho, S.f.medLargo, S.f.medAlto);
    if (!medidas) return aviso('medir', 'Indicá ancho, largo y alto en metros.');
    if (medidas.error) return aviso('medir', medidas.error);
    const err = ctx.dep.medirEdificio(S.nodo, medidas);
    aviso('medir', err, 'Medidas guardadas.');
  },
  // Gira 90° la estantería elegida en la vista aérea y guarda la disposición del edificio.
  recGirar: () => {
    const id = S.rec.aereaSel;
    const edificio = ctx.dep.porId(S.nodo);
    if (!id || !edificio) return aviso('recorrido', 'Tocá una estantería en la vista aérea para elegirla.');
    const disp = disposicionEdificio(edificio);
    const d = disp.get(id);
    if (!d) return;
    d.giro = (d.giro + 1) % 4;
    guardarDisposicion(disp, edificio);
  },
  // Busca un código de lugar u objeto y lleva la vista a su módulo.
  recBuscar: el => {
    const dep = ctx.dep;
    const raw = String(S.f.recBusca || '').trim();
    const q = norm(raw);
    if (!q) return aviso('recorrido', 'Escribí un código de lugar u objeto.');

    // Mismas reglas que "Por código": id del lugar o dirección normalizada; objeto por código interno o propio.
    let lugar = dep.lugares.find(l => l.id === raw || norm(dep.dir(l)) === q) || null;
    let obj = null;
    if (!lugar) {
      obj = dep.objetos.find(o => norm(o.codigo_interno) === q || (o.codigo_propio && norm(o.codigo_propio) === q)) || null;
      if (!obj) return aviso('recorrido', `No encuentro un lugar ni un objeto con el código "${raw}".`);
      const ubicaciones = dep.ubicacionesDe(obj.id);
      if (!ubicaciones.length) return aviso('recorrido', `${obj.codigo_interno} no está puesto en ningún lugar.`);
      lugar = ubicaciones[0];
    }

    // El pasillo es el edificio: así se ven sus estanterías con los estantes adentro.
    // Se resalta la estantería que contiene el lugar y se selecciona el lugar buscado.
    const ruta = dep.ruta(lugar);
    const edificio = ruta[0], estanteria = ruta[1] || null;
    S.nodo = edificio.id;
    S.rec = { i: 0, resaltado: estanteria ? estanteria.id : null };
    S.elegido = ruta.length > 1 ? lugar.id : null;
    S.destaque = { id: lugar.id, pendiente: true };
    S.f.recBusca = raw;
    // Para el recorrido 3D: la cámara va frente a la estantería encontrada.
    S.rec.irA = true;
    S.rec.pasear = el?.pasear === '1';
    aviso('recorrido', null, obj ? `${obj.codigo_interno} está en ${dep.dir(lugar)}.` : `Lugar encontrado: ${dep.dir(lugar)}.`);
  },
};
