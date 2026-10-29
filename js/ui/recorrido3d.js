// Recorrido 3D (prototipo, solo PC): caminás por un pasillo de estanterías en primera persona.
// Cada estante es una tabla que sale de la columna hacia el pasillo; los objetos son cajas apoyadas sobre el estante.
// Usa Three.js, cargado en index.html como global THREE (js/vendor/three.min.js).

import { ctx, S, esc, msgHTML } from './estado.js';
import { pasillosDe } from './recorrido.js';

const LARGO = 2.2;       // largo de cada estantería, a lo largo del pasillo
const SEP = 2.7;         // distancia entre pares de estanterías
const FONDO = 0.9;       // cuánto sobresale cada estante hacia el pasillo
const MITAD = 2.3;       // distancia desde el centro del pasillo hasta cada columna
const ALTO = 2.6;        // altura de las estanterías
const OJOS = 1.55;       // altura de la cámara
const VEL = 1.1;         // velocidad al caminar (unidades por segundo): suave, para no pasarse de largo
const SUAVE_GIRO = 6;    // cuán rápido llega la cámara al giro pedido (más bajo = giro más suave)
const GIRO = Math.PI / 2;
const TECLAS_CAMINAR = { ArrowUp: 1, w: 1, ArrowDown: -1, s: -1 };
const TECLAS_GIRAR = { ArrowLeft: 1, a: 1, ArrowRight: -1, d: -1 };

let mot = null;                              // motor activo
let salto = null;                            // posición a usar al cruzar a otro pasillo (se aplica al redibujar)
let pos = { clave: null, z: 0.6, yaw: 0 };   // posición recordada entre re-dibujos de la pantalla

function caja(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function materiales() {
  return {
    estante: new THREE.MeshStandardMaterial({ color: 0x9aa4b5, roughness: 0.7 }),
    poste: new THREE.MeshStandardMaterial({ color: 0x3b4b63, roughness: 0.6 }),
    obj: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 }),
    piso: new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.95 }),
    libre: new THREE.MeshStandardMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 }),
  };
}

// Etiqueta con el código de un lugar: un rótulo que siempre mira a la cámara.
function etiqueta(texto, grande) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15, 23, 42, 0.88)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#f8fafc';
  g.font = `bold ${grande ? 38 : 30}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(texto), 128, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(grande ? 0.9 : 0.5, grande ? 0.225 : 0.125, 1);
  return sp;
}

// Una estantería: columna contra la pared y sus estantes saliendo hacia el pasillo.
// zFrente es el borde más cercano al pasillo de inicio; la estantería se extiende hacia -z.
function estanteria(l, lado, zFrente, M, grupo, hits) {
  const dep = ctx.dep;
  const dir = lado === 'izq' ? 1 : -1;                 // hacia dónde salen los estantes (el pasillo)
  const xPared = lado === 'izq' ? -MITAD : MITAD;
  const xMed = xPared + dir * FONDO / 2;
  const zc = zFrente - LARGO / 2;
  const xFrente = xPared + dir * FONDO;

  // Columna trasera y postes en el frente.
  grupo.add(caja(0.05, ALTO, LARGO, M.poste, xPared, ALTO / 2, zc));
  [zFrente - 0.02, zFrente - LARGO + 0.02].forEach(z => grupo.add(caja(0.05, ALTO, 0.05, M.poste, xFrente, ALTO / 2, z)));
  // Código de la estantería, arriba de la columna.
  const rotulo = etiqueta(l.codigo, true);
  rotulo.position.set(xPared, ALTO + 0.25, zc);
  grupo.add(rotulo);

  // Estantes: cada franja de la estantería tiene una tabla en su borde inferior.
  const estantes = dep.hijos(l.id);
  const filas = estantes.length ? estantes : [l];
  const n = filas.length;
  filas.forEach((f, fi) => {
    const yTabla = ALTO * (1 - (fi + 1) / n);
    grupo.add(caja(FONDO, 0.05, LARGO, M.estante, xMed, yTabla + 0.025, zc));
    // Cada hueco del estante reparte sus objetos a lo largo de la tabla.
    const subs = estantes.length ? dep.hijos(f.id) : [];
    const celdas = subs.length ? subs : [f];
    const cl = LARGO / celdas.length;
    // Código del estante (si tiene huecos adentro) al frente de la tabla.
    if (subs.length) {
      const rot = etiqueta(f.codigo, false);
      rot.position.set(xFrente + dir * 0.05, yTabla + 0.12, zFrente - 0.12);
      grupo.add(rot);
    }
    celdas.forEach((c, ci) => {
      const objs = dep.objetosDe(c.id);
      const m = Math.min(objs.length, 4);
      const zCentro = zFrente - cl * (ci + 0.5);
      // Hueco libre: una marca verde sobre la tabla. Los ocupados muestran sus cajas.
      if (objs.length === 0) grupo.add(caja(FONDO * 0.8, 0.01, cl * 0.8, M.libre, xMed, yTabla + 0.06, zCentro));
      for (let j = 0; j < m; j++) {
        const z = zCentro - (cl * 0.6) / 2 + (cl * 0.6) * (j + 0.5) / m;
        grupo.add(caja(0.4, 0.3, 0.35, M.obj, xMed, yTabla + 0.05 + 0.15, z));
      }
      // Código del hueco (o del estante, si no tiene huecos), encima de las cajas.
      const rot = etiqueta(c.codigo, false);
      rot.position.set(xMed, yTabla + 0.5, zCentro);
      grupo.add(rot);
      // Zona invisible sobre el hueco: sirve para tocarlo y saber qué lugar es.
      const bandH = ALTO / n;
      const zona = new THREE.Mesh(new THREE.BoxGeometry(FONDO, bandH, cl), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      zona.position.set(xMed, yTabla + bandH / 2, zCentro);
      zona.userData.lugar = c.id;
      grupo.add(zona);
      hits.push(zona);
    });
  });
}

// Escena del pasillo: piso, luces y las estanterías de la fila a ambos lados.
function construirEscena(fila) {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x1e293b);
  escena.fog = new THREE.Fog(0x1e293b, 5, 24);
  const M = materiales();
  escena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sol = new THREE.DirectionalLight(0xffffff, 0.8);
  sol.position.set(2, 6, 3);
  escena.add(sol);

  const largo = Math.ceil(fila.length / 2) * SEP + 10;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(MITAD * 2 + 8, largo), M.piso);
  piso.rotation.x = -Math.PI / 2;
  piso.position.set(0, 0, -largo / 2 + 4);
  escena.add(piso);

  // Pares de estanterías: los de índice par a la izquierda, los impares a la derecha.
  const grupo = new THREE.Group();
  const hits = [];
  const pares = Math.ceil(fila.length / 2);
  for (let p = 0; p < pares; p++) {
    const zF = -1.2 - p * SEP;
    if (fila[2 * p]) estanteria(fila[2 * p], 'izq', zF, M, grupo, hits);
    if (fila[2 * p + 1]) estanteria(fila[2 * p + 1], 'der', zF, M, grupo, hits);
  }
  escena.add(grupo);
  escena.userData.hits = hits;
  return { escena, zMin: -(pares * SEP) - 2 };
}

// Guarda dónde quedó la cámara y libera el motor.
export function desmontarRecorrido3D() {
  if (!mot) return;
  cancelAnimationFrame(mot.raf);
  window.removeEventListener('keydown', mot.onDown);
  window.removeEventListener('keyup', mot.onUp);
  pos = { clave: mot.clave, z: mot.camara.position.z, yaw: mot.yaw };
  if (salto) { pos = salto; salto = null; }
  mot.renderer.dispose();
  mot.renderer.forceContextLoss?.();
  mot = null;
}

// Arma la escena en el contenedor #r3d de la pantalla actual (se llama después de cada dibujo).
export function montarRecorrido3D() {
  const cont = document.getElementById('r3d');
  desmontarRecorrido3D();
  if (!cont || !S.nodo) return;
  const edificio = ctx.dep.porId(S.nodo);
  if (!edificio) return;
  const filas = pasillosDe(edificio);
  const fi = Math.min(S.rec.fila || 0, filas.length - 1);
  const fila = filas[fi] || [];
  const clave = `${edificio.id}|${fi}`;

  const { escena, zMin } = construirEscena(fila);
  const ancho = cont.clientWidth || 800, alto = 520;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(ancho, alto);
  cont.innerHTML = '';
  cont.appendChild(renderer.domElement);

  // Búsqueda: si acaba de buscarse un lugar, la cámara se pone frente a su estantería, mirándola.
  if (S.rec.irA) {
    S.rec.irA = false;
    const sel = S.elegido ? ctx.dep.porId(S.elegido) : null;
    const est = sel ? ctx.dep.ruta(sel)[1] : null;
    const idx = est ? fila.findIndex(k => k.id === est.id) : -1;
    // La cámara queda frente al centro de la estantería (mirando hacia la pared donde está).
    if (idx >= 0) pos = { clave, z: -1.2 - Math.floor(idx / 2) * SEP - LARGO / 2, yaw: idx % 2 === 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  if (pos.clave !== clave) pos = { clave, z: 0.6, yaw: 0 };
  const camara = new THREE.PerspectiveCamera(70, ancho / alto, 0.05, 60);
  camara.position.set(0, OJOS, pos.z);

  const teclas = new Set();
  const onDown = e => {
    if (e.target.matches?.('input, select, textarea')) return;
    if (TECLAS_GIRAR[e.key] && mot) { e.preventDefault(); if (!e.repeat) mot.giroDestino += TECLAS_GIRAR[e.key] * GIRO; return; }
    if (TECLAS_CAMINAR[e.key]) { e.preventDefault(); teclas.add(e.key); }
  };
  const onUp = e => teclas.delete(e.key);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  mot = { renderer, camara, teclas, cont, clave, onDown, onUp, raf: 0, ultimo: performance.now(), yaw: pos.yaw, giroDestino: pos.yaw };

  // Tocar un hueco selecciona su lugar; la lista de abajo muestra lo que tiene.
  const rayo = new THREE.Raycaster();
  renderer.domElement.addEventListener('click', e => {
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
    const [eid, f] = mot.clave.split('|');
    const edif = ctx.dep.porId(eid);
    const filas = edif ? pasillosDe(edif) : [];
    const nf = +f + dir;
    if (nf < 0 || nf >= filas.length) return false;
    const pares = Math.ceil(filas[nf].length / 2);
    salto = { clave: `${eid}|${nf}`, z: dir > 0 ? 0.6 : -(pares * SEP) - 1.5, yaw: mot.yaw };
    S.rec.fila = nf; S.rec.i = 0; S.rec.resaltado = null; S.elegido = null;
    ctx.render();
    return true;
  };

  const frame = t => {
    if (!cont.isConnected) return desmontarRecorrido3D();
    const dt = Math.min((t - mot.ultimo) / 1000, 0.05);
    mot.ultimo = t;
    // Caminar: W/flecha arriba hacia adelante, S/flecha abajo hacia atrás, en la dirección que mira la cámara.
    let avance = 0;
    for (const k of mot.teclas) { avance += TECLAS_CAMINAR[k] || 0; }
    mot.yaw += (mot.giroDestino - mot.yaw) * Math.min(1, dt * SUAVE_GIRO);
    const v = Math.max(-1, Math.min(1, avance)) * VEL * dt;
    mot.camara.position.x -= Math.sin(mot.yaw) * v;
    mot.camara.position.z -= Math.cos(mot.yaw) * v;
    // Quedarse dentro del pasillo.
    mot.camara.position.x = Math.max(-MITAD + 0.5, Math.min(MITAD - 0.5, mot.camara.position.x));
    // Llegar al final del pasillo y seguir caminando cruza al pasillo transversal.
    const zAct = mot.camara.position.z;
    if (avance > 0 && zAct <= zMin + 0.05 && cruzar(1)) return;
    if (avance < 0 && zAct >= 0.55 && cruzar(-1)) return;
    mot.camara.position.z = Math.max(zMin, Math.min(0.6, zAct));
    mot.camara.rotation.set(0, mot.yaw, 0, 'YXZ');
    mot.renderer.render(escena, mot.camara);
    mot.raf = requestAnimationFrame(frame);
  };
  mot.raf = requestAnimationFrame(frame);
}

export function vistaRecorrido3D() {
  const dep = ctx.dep;
  if (!dep.eid) return `<h1>Recorrido 3D</h1><p class="vacio">Elegí un cliente en el menú de cuenta para ver su depósito.</p>`;
  const edificio = S.nodo ? dep.porId(S.nodo) : null;
  if (!edificio || dep.prof(edificio) !== 0) {
    const edificios = dep.hijos(null);
    return `<h1>Recorrido 3D</h1>
      <p class="sub">Elegí un edificio para caminar por sus pasillos.</p>
      <div class="rec-edificios">${edificios.map(e => `<button class="btn sec" data-act="recIr" data-id="${e.id}">${esc(e.codigo)}${e.nombre ? ` ${esc(e.nombre)}` : ''}</button>`).join('')}</div>`;
  }
  const filas = pasillosDe(edificio);
  const f = Math.min(S.rec.fila || 0, filas.length - 1);
  const cruce = filas.length > 1 ? `<div class="rec-controles">
      <button class="btn sec sm" data-act="recCruzar" data-dir="-1" ${f <= 0 ? 'disabled' : ''}>↑ Pasillo anterior</button>
      <span class="rec-tramo">Pasillo ${f + 1} de ${filas.length}</span>
      <button class="btn sec sm" data-act="recCruzar" data-dir="1" ${f >= filas.length - 1 ? 'disabled' : ''}>Pasillo siguiente ↓</button>
    </div>` : '';
  return `<div class="rec-cab">
      <button class="btn sec sm" data-act="recSubir">← Subir</button>
      <button class="btn sec sm" data-act="recIr">Edificios</button>
    </div>
    <h1>${esc(dep.dir(edificio))}</h1>
    <p class="sub">Caminá con ↑ y ↓ (o W y S). Girá con ← y → (o A y D). Tocá un hueco para ver qué tiene.</p>
    <div class="rec-barra">
      <input data-f="recBusca" data-enter="recBuscar" value="${esc(S.f.recBusca || '')}" placeholder="Código de lugar u objeto" aria-label="Código de lugar u objeto">
      <button class="btn sec" data-act="recBuscar">Ir</button>
    </div>
    ${msgHTML('recorrido')}
    <div class="r3d-marco">
      <div id="r3d" class="r3d" aria-label="Recorrido 3D del pasillo"></div>
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
