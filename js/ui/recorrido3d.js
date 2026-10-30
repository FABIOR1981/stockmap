// Recorrido 3D (prototipo, solo PC): caminás por un pasillo de estanterías en primera persona.
// Cada estante es una tabla que sale de la columna hacia el pasillo; los objetos son cajas apoyadas sobre el estante.
// Usa Three.js, cargado en index.html como global THREE (js/vendor/three.min.js).

import { ctx, S, esc, msgHTML, aviso } from './estado.js';
import { posEnPlano } from './plano.js';
import { calcularRuta, limitesDentroDelGalpon, dentroDe } from './recorrido/ruta.js';
import { LARGO, SEP, FONDO, MITAD, ALTO, BASE, huella, frenteDe, agruparPasillos, calcularDisposicion, calcularFila } from './recorrido/disposicion.js';
import { caja, materiales, etiqueta, construirEscena } from './recorrido/escena.js';

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
  salto: null,                  // posición a usar al cruzar a otro pasillo (se aplica al redibujar)
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
  if (R.salto) { R.pos = R.salto; R.salto = null; }
  R.mot.renderer.dispose();
  R.mot.renderer.forceContextLoss?.();
  R.mot = null;
}

// Disposición de las estanterías: funciones puras en recorrido/disposicion.js.
const filasDe = edificio => agruparPasillos(ctx.dep.hijos(edificio.id), posEnPlano);
function disposicionEdificio(edificio) { return calcularDisposicion(filasDe(edificio)); }
function disposicionFila(edificio, fi) { return calcularFila(filasDe(edificio), fi); }

// Guarda la posición y el giro de todas las estanterías del edificio.
function guardarDisposicion(disp) {
  for (const [id, d] of disp) {
    const err = ctx.dep.posicionarVista(id, Math.round(d.x * 100), Math.round(d.z * 100), d.giro);
    if (err) return aviso('recorrido', err);
  }
}

// Vista aérea del edificio: las estanterías se arrastran sobre el piso y se giran de a 90°.
function montarAerea(cont, edificio) {
  S.rec.irA = false;
  const disp = disposicionEdificio(edificio);
  const ancho = cont.clientWidth || 800, alto = 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  cont.innerHTML = '';
  cont.appendChild(renderer.domElement);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x1e293b);
  const M = materiales();
  escena.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sol = new THREE.DirectionalLight(0xffffff, 0.7);
  sol.position.set(2, 10, 3);
  escena.add(sol);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.95 }));
  piso.rotation.x = -Math.PI / 2;
  escena.add(piso);

  // Galpón con medidas: se dibuja su piso y su contorno, y las estanterías no pueden salirse de él.
  // Origen: centro del frente (x = 0, z = 0); el galpón va hacia el fondo (z negativo). Medidas en metros.
  const g = edificio.dim_ancho && edificio.dim_largo ? { A: edificio.dim_ancho / 100, L: edificio.dim_largo / 100 } : null;
  if (g) {
    // Las que todavía están en la distribución por defecto se acomodan dentro del galpón (no se guarda hasta moverlas).
    for (const d of disp.values()) {
      const lim = limitesDentroDelGalpon(g.A, g.L, huella(d.giro));
      d.x = dentroDe(d.x, lim.x0, lim.x1); d.z = dentroDe(d.z, lim.z0, lim.z1);
    }
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(g.A, g.L), new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.set(0, 0.01, -g.L / 2);
    escena.add(suelo);
    const contorno = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(g.A, g.L)), new THREE.LineBasicMaterial({ color: 0xfacc15 }));
    contorno.rotation.x = -Math.PI / 2; contorno.position.set(0, 0.03, -g.L / 2);
    escena.add(contorno);
  }

  // Encuadre: desde arriba, a una altura que deje ver todo el edificio (y el galpón, si tiene medidas).
  const xs = [...disp.values()].map(d => d.x), zs = [...disp.values()].map(d => d.z);
  if (g) xs.push(-g.A / 2, g.A / 2), zs.push(-g.L, 0);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const extension = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4) + 4;
  const camara = new THREE.PerspectiveCamera(45, ancho / alto, 0.1, 400);
  camara.position.set(cx, extension / (2 * Math.tan(Math.PI / 8)), cz + 0.001);
  camara.lookAt(cx, 0, cz);

  const grupo = new THREE.Group();
  escena.add(grupo);
  const mallas = new Map(), hits = [];
  for (const [id, d] of disp) {
    const l = ctx.dep.porId(id);
    const elegida = id === S.rec.aereaSel;
    const malla = new THREE.Mesh(new THREE.BoxGeometry(FONDO, 0.25, LARGO),
      new THREE.MeshStandardMaterial({ color: elegida ? 0x2563eb : 0x9aa4b5, roughness: 0.7 }));
    malla.position.set(d.x, 0.125, d.z);
    malla.rotation.y = d.giro * Math.PI / 2;
    malla.userData.rack = id;
    grupo.add(malla);
    mallas.set(id, malla);
    hits.push(malla);
    if (l) {
      const rot = etiqueta(l.codigo);
      rot.scale.multiplyScalar(0.6);
      rot.position.set(d.x, 1.2, d.z);
      grupo.add(rot);
    }
  }

  // Arrastrar una estantería la mueve sobre el piso (ajustada a una grilla de 25 cm).
  const rayo = new THREE.Raycaster();
  const piso0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const enRejilla = e => {
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camara);
    const p = new THREE.Vector3();
    return rayo.ray.intersectPlane(piso0, p) ? p : null;
  };
  const ajustar = v => Math.round(v / 0.25) * 0.25;
  let arrastre = null;
  const onDown = e => {
    const r = renderer.domElement.getBoundingClientRect();
    rayo.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camara);
    const golpe = rayo.intersectObjects(hits, false)[0];
    if (!golpe) return;
    const id = golpe.object.userData.rack;
    S.rec.aereaSel = id;
    const p = enRejilla(e), d = disp.get(id);
    if (p) arrastre = { id, dx: p.x - d.x, dz: p.z - d.z, movido: false };
  };
  const onMove = e => {
    if (!arrastre) return;
    const p = enRejilla(e); if (!p) return;
    const d = disp.get(arrastre.id);
    let nx = ajustar(p.x - arrastre.dx), nz = ajustar(p.z - arrastre.dz);
    if (g) {   // que la estantería quede dentro del galpón
      const lim = limitesDentroDelGalpon(g.A, g.L, huella(d.giro));
      nx = dentroDe(nx, lim.x0, lim.x1); nz = dentroDe(nz, lim.z0, lim.z1);
    }
    if (nx === d.x && nz === d.z) return;
    d.x = nx; d.z = nz; arrastre.movido = true;
    const malla = mallas.get(arrastre.id);
    malla.position.x = nx; malla.position.z = nz;
  };
  const onUp = () => {
    if (!arrastre) return;
    const { movido } = arrastre;
    arrastre = null;
    if (movido) {
      guardarDisposicion(disp);
      ctx.sincronizar?.();   // el arrastre no pasa por un botón: hay que mandar el cambio al servidor
    }
    ctx.render();   // redibuja (también marca la estantería elegida)
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  R.mot = { renderer, camara, cont, aerea: true, clave: `${edificio.id}|aerea`, raf: 0, w: ancho, h: alto, yaw: 0, pitch: 0,
    limpiar: () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); } };
  const frame = () => {
    if (!cont.isConnected) return desmontarRecorrido3D();
    const w = cont.clientWidth, h = cont.clientHeight;
    if (w && h && (w !== R.mot.w || h !== R.mot.h)) {
      R.mot.w = w; R.mot.h = h;
      renderer.setSize(w, h);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    }
    renderer.render(escena, camara);
    R.mot.raf = requestAnimationFrame(frame);
  };
  R.mot.raf = requestAnimationFrame(frame);
}

// Arma la escena en el contenedor #r3d de la pantalla actual (se llama después de cada dibujo).
export function montarRecorrido3D() {
  const cont = document.getElementById('r3d');
  desmontarRecorrido3D();
  if (!cont || !S.nodo) return;
  const edificio = ctx.dep.porId(S.nodo);
  if (!edificio) return;
  if (S.rec.aerea) return montarAerea(cont, edificio);
  const filas = pasillosDe(edificio);
  const fi = Math.min(S.rec.fila || 0, filas.length - 1);
  const fila = filas[fi] || [];
  const clave = `${edificio.id}|${fi}`;

  const { disp } = disposicionFila(edificio, fi);
  const { escena, zMin, xLim } = construirEscena(fila, disp);
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
          planear: (x, z) => calcularRuta(disp, { x, z }, { x: f.x, z: f.z }, huella) };
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
    if (e.target.matches?.('input, select, textarea')) return;
    if (TECLAS_GIRAR[e.key] || TECLAS_CAMINAR[e.key]) R.paseo = null;   // tocar una tecla de movimiento corta la caminata
    if (TECLAS_GIRAR[e.key] || TECLAS_CAMINAR[e.key] || TECLAS_MIRAR[e.key] || TECLAS_OJOS[e.key]) { e.preventDefault(); teclas.add(e.key); }
  };
  const onUp = e => teclas.delete(e.key);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  R.mot = { renderer, camara, teclas, cont, clave, onDown, onUp, raf: 0, ultimo: performance.now(), yaw: R.pos.yaw, pitch: R.pos.pitch || 0, w: ancho, h: alto, xLim };

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
  // Cruza al pasillo transversal siguiente (dir 1) o anterior (dir -1), entrando por su inicio.
  const cruzar = dir => {
    const [eid, f] = R.mot.clave.split('|');
    const edif = ctx.dep.porId(eid);
    const filas = edif ? pasillosDe(edif) : [];
    const nf = +f + dir;
    if (nf < 0 || nf >= filas.length) return false;
    const pares = Math.ceil(filas[nf].length / 2);
    R.salto = { clave: `${eid}|${nf}`, z: dir > 0 ? 0.6 : -(pares * SEP) - 1.5, yaw: R.mot.yaw };
    S.rec.fila = nf; S.rec.i = 0; S.rec.resaltado = null; S.elegido = null;
    ctx.render();
    return true;
  };

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
    // Quedarse dentro del pasillo.
    R.mot.camara.position.x = Math.max(-R.mot.xLim, Math.min(R.mot.xLim, R.mot.camara.position.x));
    // Llegar al final del pasillo y seguir caminando cruza al pasillo transversal.
    const zAct = R.mot.camara.position.z;
    if (avance > 0 && zAct <= zMin + 0.05 && cruzar(1)) return;
    if (avance < 0 && zAct >= 0.55 && cruzar(-1)) return;
    R.mot.camara.position.z = Math.max(zMin, Math.min(0.6, zAct));
    R.mot.camara.rotation.set(R.mot.pitch, R.mot.yaw, 0, 'YXZ');
    R.mot.renderer.render(escena, R.mot.camara);
    R.mot.raf = requestAnimationFrame(frame);
  };
  R.mot.raf = requestAnimationFrame(frame);
  // Al entrar o salir de pantalla completa se redibuja el botón (y la escena se ajusta en el próximo cuadro).
  if (!R.fsListo) { R.fsListo = true; document.addEventListener('fullscreenchange', () => ctx.render()); }
}

export function vistaRecorrido3D() {
  const dep = ctx.dep;
  if (!dep.eid) return `<h1>Recorrido</h1><p class="vacio">Elegí un cliente en el menú de cuenta para ver su depósito.</p>`;
  const edificio = S.nodo ? dep.porId(S.nodo) : null;
  if (!edificio || dep.prof(edificio) !== 0) {
    const edificios = dep.hijos(null);
    return `<h1>Recorrido</h1>
      <p class="sub">Elegí un edificio para caminar por sus pasillos.</p>
      <div class="rec-edificios">${edificios.map(e => `<button class="btn sec" data-act="recIr" data-id="${e.id}">${esc(e.codigo)}${e.nombre ? ` ${esc(e.nombre)}` : ''}</button>`).join('')}</div>`;
  }
  const filas = pasillosDe(edificio);
  const f = Math.min(S.rec.fila || 0, filas.length - 1);
  const cruce = !S.rec.aerea && filas.length > 1 ? `<div class="rec-controles">
      <button class="btn sec sm" data-act="recCruzar" data-dir="-1" ${f <= 0 ? 'disabled' : ''}>↑ Pasillo anterior</button>
      <span class="rec-tramo">Pasillo ${f + 1} de ${filas.length}</span>
      <button class="btn sec sm" data-act="recCruzar" data-dir="1" ${f >= filas.length - 1 ? 'disabled' : ''}>Pasillo siguiente ↓</button>
    </div>` : '';
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
    ${msgHTML('recorrido')}
    <div class="r3d-marco">
      <div id="r3d" class="r3d" aria-label="${aerea ? 'Vista aérea del edificio' : 'Recorrido 3D del pasillo'}"></div>
      ${herramientas}
      <button class="btn sec sm r3d-ampliar" data-act="recAmpliar">${document.fullscreenElement ? 'Salir de pantalla completa' : 'Ampliar'}</button>
    </div>
    ${cruce}
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
  // Elige el edificio cuyo pasillo se recorre (sin id: vuelve a la lista de edificios).
  recIr: el => { S.nodo = el.id || null; S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {}; },
  // Sube un nivel dentro del recorrido.
  recSubir: () => {
    const l = ctx.dep.porId(S.nodo);
    S.nodo = l?.padre_id || null;
    S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {};
  },
  // Cruza al pasillo transversal anterior (-1) o siguiente (1): pasa a otra fila de estanterías del edificio.
  recCruzar: el => {
    const edificio = ctx.dep.porId(S.nodo);
    if (!edificio || ctx.dep.prof(edificio) !== 0) return;
    const filas = pasillosDe(edificio);
    S.rec.fila = Math.min(Math.max((S.rec.fila || 0) + Number(el.dir), 0), filas.length - 1);
    S.rec.i = 0; S.rec.resaltado = null; S.elegido = null;
  },
  // Pantalla completa para ver el pasillo más grande (con las flechas se sigue caminando; Esc sale).
  recAmpliar: () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },
  // Alterna entre el recorrido y la vista aérea del edificio.
  recAerea: () => { S.rec.aerea = !S.rec.aerea; S.rec.irA = false; S.elegido = null; S.msg = {}; },
  // Gira 90° la estantería elegida en la vista aérea y guarda la disposición del edificio.
  recGirar: () => {
    const id = S.rec.aereaSel;
    const edificio = ctx.dep.porId(S.nodo);
    if (!id || !edificio) return aviso('recorrido', 'Tocá una estantería en la vista aérea para elegirla.');
    const disp = disposicionEdificio(edificio);
    const d = disp.get(id);
    if (!d) return;
    d.giro = (d.giro + 1) % 4;
    guardarDisposicion(disp);
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
    if (estanteria) {
      // Va a la fila de estanterías (pasillo) que contiene la estantería, y a su tramo dentro de esa fila.
      const filasEd = pasillosDe(edificio);
      const fi = Math.max(0, filasEd.findIndex(fila => fila.some(k => k.id === estanteria.id)));
      const idx = Math.max(0, filasEd[fi].findIndex(k => k.id === estanteria.id));
      S.rec.fila = fi;
      S.rec.i = Math.floor(idx / 2);
    }
    S.elegido = ruta.length > 1 ? lugar.id : null;
    S.f.recBusca = raw;
    // Para el recorrido 3D: la cámara va frente a la estantería encontrada.
    S.rec.irA = true;
    S.rec.pasear = el?.pasear === '1';
    aviso('recorrido', null, obj ? `${obj.codigo_interno} está en ${dep.dir(lugar)}.` : `Lugar encontrado: ${dep.dir(lugar)}.`);
  },
};
