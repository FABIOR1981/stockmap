// Escena del recorrido 3D: piso, paredes, estanterías, etiquetas y objetos (Three.js como global THREE).
// Sin estado de la pantalla: solo construye los objetos a partir de la disposición.

import { RADIO_CUERPO } from './ruta.js';
import { ctx } from '../estado.js';
import { LARGO, SEP, FONDO, MITAD, ALTO, BASE, huella } from './disposicion.js';

export function caja(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// Texturas de depósito dibujadas con canvas (sin imágenes externas). Se crean una sola vez.
export function texturaCanvas(ancho, alto, dibujar) {
  const c = document.createElement('canvas');
  c.width = ancho; c.height = alto;
  dibujar(c.getContext('2d'), ancho, alto);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export function puntos(g, w, h, n, color, tam) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(Math.random() * w, Math.random() * h, tam, tam);
}
export const dibujarPiso = (g, w, h) => {   // concreto: gris con manchas y juntas
  g.fillStyle = '#6b7280'; g.fillRect(0, 0, w, h);
  puntos(g, w, h, 1500, 'rgba(0,0,0,0.12)', 2);
  puntos(g, w, h, 900, 'rgba(255,255,255,0.06)', 2);
  g.strokeStyle = '#4b5563'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
};
export const dibujarPared = (g, w, h) => {  // panel metálico con nervios verticales y una franja horizontal
  g.fillStyle = '#d1d5db'; g.fillRect(0, 0, w, h);
  for (const x of [0, w / 2]) {
    g.fillStyle = '#9ca3af'; g.fillRect(x - 3, 0, 6, h);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x + 3, 0, 2, h);
  }
  g.fillStyle = '#9ca3af'; g.fillRect(0, h / 2 - 3, w, 6);
};
export const dibujarCarton = (g, w, h) => { // caja de cartón con cinta y etiqueta
  g.fillStyle = '#b8875a'; g.fillRect(0, 0, w, h);
  puntos(g, w, h, 300, 'rgba(0,0,0,0.08)', 2);
  g.fillStyle = '#d9b382'; g.fillRect(w / 2 - 10, 0, 20, h);
  g.fillStyle = '#f8fafc'; g.fillRect(w * 0.12, h * 0.2, w * 0.3, h * 0.18);
};
let texCache = null;
export function texturasDeposito() {
  if (!texCache) texCache = {
    piso: texturaCanvas(256, 256, dibujarPiso),
    pared: texturaCanvas(256, 256, dibujarPared),
    carton: texturaCanvas(128, 128, dibujarCarton),
  };
  return texCache;
}

export function materiales() {
  const T = texturasDeposito();
  return {
    estante: new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.6 }),   // tablas naranjas
    poste: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5, metalness: 0.2 }),   // columnas azules
    obj: new THREE.MeshStandardMaterial({ map: T.carton, roughness: 0.9 }),
    piso: new THREE.MeshStandardMaterial({ map: T.piso, roughness: 0.95 }),
    pared: new THREE.MeshStandardMaterial({ map: T.pared, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
    amarillo: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7 }),
    libre: new THREE.MeshStandardMaterial({ color: 0x22c55e, transparent: true, opacity: 0.45 }),
  };
}

// Superficie con la textura repetida a un tamaño fijo (en metros por repetición).
export function conTextura(mat, tex, anchoM, altoM, tile) {
  const t = tex.clone();
  t.repeat.set(anchoM / tile, altoM / tile);
  t.needsUpdate = true;
  const m = mat.clone();
  m.map = t;
  return m;
}

// Etiqueta con el código de la estantería: un rótulo que siempre mira a la cámara.
export function etiqueta(texto) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15, 23, 42, 0.9)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#f8fafc';
  g.lineWidth = 10;
  g.strokeRect(14, 14, 484, 100);
  g.fillStyle = '#f8fafc';
  g.font = 'bold 78px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(texto), 256, 66);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.set(2.2, 0.55, 1);
  return sp;
}

// Tapete con el código de la estantería (va tirado en el piso, frente a ella).
export function tapete(texto, ancho, largo) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * largo / ancho);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15, 23, 42, 0.85)';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#f8fafc';
  g.lineWidth = 10;
  g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.fillStyle = '#f8fafc';
  g.font = `bold ${Math.round(c.height * 0.5)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(texto), c.width / 2, c.height / 2);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ancho, largo), mat);
  m.rotation.x = -Math.PI / 2;   // tirada en el piso, como un felpudo
  return m;
}

// Placa plana pegada a una superficie (no gira con la cámara): letras y números de los estantes.
export function placa(texto, ancho, alto) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round(256 * alto / ancho);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15, 23, 42, 0.92)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f8fafc';
  g.font = `bold ${Math.round(c.height * 0.62)}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(texto), c.width / 2, c.height / 2);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), mat);
}

// Una estantería: columna contra la pared y sus estantes saliendo hacia el pasillo.
// zFrente es el borde más cercano al pasillo de inicio; la estantería se extiende hacia -z.
// La altura es fija: con muchos estantes, cada franja es más baja.
// Posición de un hueco dentro de su estante, de izquierda a derecha vista desde el pasillo.
// Las estanterías del lado derecho se miran desde el otro lado, así que el orden se invierte.
export function posicionEnEstante(indice, cantidad, dir) {
  return dir > 0 ? indice : cantidad - 1 - indice;
}

// Cajas sueltas en el piso (sobras de la operativa): obstáculos que no tienen lugar asignado.
export function agregarCajasSueltas(escena, cajas) {
  const M = materiales();
  cajas.forEach(c => escena.add(caja(c.w, c.h, c.d, M.obj, c.x, c.h / 2, c.z)));
}

export function estanteria(l, lado, zFrente, M, grupo, hits) {
  const dep = ctx.dep;
  const dir = lado === 'izq' ? 1 : -1;                 // hacia dónde salen los estantes (el pasillo)
  const xPared = lado === 'izq' ? -MITAD : MITAD;
  const xMed = xPared + dir * FONDO / 2;
  const zc = zFrente - LARGO / 2;
  const xFrente = xPared + dir * FONDO;

  const estantes = dep.hijos(l.id);
  const filas = estantes.length ? estantes : [l];
  const n = filas.length;
  const alto = ALTO;
  const top = BASE + alto;                             // altura total de la columna

  // Columna trasera y postes en el frente.
  grupo.add(caja(0.05, top, LARGO, M.poste, xPared, top / 2, zc));
  [zFrente - 0.02, zFrente - LARGO + 0.02].forEach(z => grupo.add(caja(0.05, top, 0.05, M.poste, xFrente, top / 2, z)));
  // Código de la estantería, arriba de la columna.
  const rotulo = etiqueta(l.codigo);
  rotulo.position.set(xPared, top + 0.5, zc);
  grupo.add(rotulo);
  // Tapete en el piso, frente a la estantería, girado 90° para ocupar todo su ancho (a lo largo del pasillo).
  const tap = new THREE.Group();
  tap.add(tapete(l.codigo, LARGO * 0.95, 0.7));
  tap.rotation.y = Math.PI / 2;
  tap.position.set(xFrente + dir * 0.4, 0.01, zc);
  grupo.add(tap);

  // Estantes: cada franja de la estantería tiene una tabla en su borde inferior.
  const bandH = alto / n;
  filas.forEach((f, fi) => {
    const yTabla = BASE + bandH * (n - 1 - fi);
    grupo.add(caja(FONDO, 0.05, LARGO, M.estante, xMed, yTabla + 0.025, zc));
    // Cada hueco del estante reparte sus objetos a lo largo de la tabla.
    const subs = estantes.length ? dep.hijos(f.id) : [];
    const celdas = subs.length ? subs : [f];
    const cl = LARGO / celdas.length;
    // Espacio libre sobre la tabla hasta el estante de arriba: las cajas no pueden pasarlo.
    const cajaH = Math.max(0.08, Math.min(0.3, bandH - 0.12));
    // Número del estante: en el borde frontal de su tabla, en el extremo izquierdo (visto de frente).
    if (subs.length) {
      const rot = placa(f.codigo, 0.4, 0.09);
      // Del lado del extremo izquierdo visto desde el pasillo.
      const zNum = dir > 0 ? zFrente + 0.1 : zFrente - LARGO - 0.1;
      rot.position.set(xFrente + dir * 0.006, yTabla + 0.025, zNum);
      rot.rotation.y = dir * Math.PI / 2;
      grupo.add(rot);
    }
    celdas.forEach((c, ci) => {
      const objs = dep.objetosDe(c.id);
      const m = Math.min(objs.length, 4);
      const zCentro = zFrente - cl * (posicionEnEstante(ci, celdas.length, dir) + 0.5);
      // Hueco libre: una marca verde sobre la tabla. Los ocupados muestran sus cajas.
      if (objs.length === 0) grupo.add(caja(FONDO * 0.8, 0.01, cl * 0.8, M.libre, xMed, yTabla + 0.06, zCentro));
      for (let j = 0; j < m; j++) {
        const z = zCentro - (cl * 0.6) / 2 + (cl * 0.6) * (j + 0.5) / m;
        grupo.add(caja(0.4, cajaH, 0.35, M.obj, xMed, yTabla + 0.05 + cajaH / 2, z));
      }
      // Letra del hueco: sobre el borde frontal de la tabla de su división.
      const rot = placa(c.codigo, 0.32, 0.08);
      rot.position.set(xFrente + dir * 0.006, yTabla + 0.025, zCentro);
      rot.rotation.y = dir * Math.PI / 2;
      grupo.add(rot);
      // Zona invisible sobre el hueco: sirve para tocarlo y saber qué lugar es.
      const zona = new THREE.Mesh(new THREE.BoxGeometry(FONDO, bandH, cl), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      zona.position.set(xMed, yTabla + bandH / 2, zCentro);
      zona.userData.lugar = c.id;
      grupo.add(zona);
      hits.push(zona);
    });
  });
}

// Escena del pasillo: piso, luces y las estanterías de la fila a ambos lados.

// Coloca una estantería con su centro en (d.x, d.z) y girada d.giro cuartos de vuelta.
// La estantería se arma centrada en el origen y después se mueve y se gira el grupo entero.
export function colocar(l, lado, d, M, grupo, hits) {
  const xMed = lado === 'izq' ? -MITAD + FONDO / 2 : MITAD - FONDO / 2;
  const interior = new THREE.Group();
  interior.position.x = -xMed;
  estanteria(l, lado, LARGO / 2, M, interior, hits);
  const exterior = new THREE.Group();
  exterior.position.set(d.x, 0, d.z);
  exterior.rotation.y = d.giro * Math.PI / 2;
  exterior.add(interior);
  grupo.add(exterior);
}

// Escena del pasillo: piso, luces y las estanterías de la fila en sus posiciones.
// g = { A, L } con el galpón en metros (o null): con medidas, el depósito es el galpón; sin medidas, se ajusta a las estanterías.
export function construirEscena(fila, disp, g = null) {
  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x1e293b);
  const M = materiales();
  escena.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sol = new THREE.DirectionalLight(0xffffff, 0.8);
  sol.position.set(2, 6, 3);
  escena.add(sol);

  // Tamaño del depósito según dónde están las estanterías (no según cuántas hay): ninguna queda afuera del piso.
  let zMin = -2, xMax = MITAD + 4;
  if (!g) fila.forEach(l => {
    const d = disp.get(l.id), h = huella(d.giro);
    zMin = Math.min(zMin, d.z - h.ez - 2);
    xMax = Math.max(xMax, Math.abs(d.x) + h.ex + 2);
  });
  // Con medidas: el frente del galpón es z = 0 (entrada, con 1 m de margen) y el fondo z = −L; ancho A centrado.
  const zTope = g ? 1 : 4;
  const zFondo = g ? -g.L : zMin - 2;   // sin medidas: el piso llega 2 m detrás de la última estantería
  if (g) { zMin = -g.L; xMax = g.A / 2; }
  const largo = zTope - zFondo, zc = (zTope + zFondo) / 2;
  const ancho = 2 * xMax, alto = 5;
  const T = texturasDeposito();
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(ancho, largo), conTextura(M.piso, T.piso, ancho, largo, 2.5));
  piso.rotation.x = -Math.PI / 2;
  piso.position.set(0, 0, zc);
  escena.add(piso);
  // Líneas amarillas de seguridad a los costados del pasillo.
  for (const x of [-1, 1]) escena.add(caja(0.08, 0.004, largo, M.amarillo, x, 0.003, zc));
  // Paredes: dos laterales y el fondo del depósito.
  const muro = (w, rot, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, alto), conTextura(M.pared, T.pared, w, alto, 2));
    m.position.set(x, alto / 2, z); m.rotation.y = rot;
    escena.add(m);
  };
  muro(largo, Math.PI / 2, -ancho / 2, zc);
  muro(largo, -Math.PI / 2, ancho / 2, zc);
  muro(ancho, 0, 0, zFondo);

  // Las de índice par van a la izquierda y las impares a la derecha (como en el plano).
  const grupo = new THREE.Group();
  const hits = [];
  let xLim = MITAD - 0.5;
  fila.forEach(l => {
    const d = disp.get(l.id);
    colocar(l, d.lado, d, M, grupo, hits);
    if (!g) xLim = Math.max(xLim, Math.abs(d.x) + 1.3);
  });
  if (g) xLim = Math.max(0.2, g.A / 2 - RADIO_CUERPO);   // el paso llega hasta la pared, con el margen del cuerpo
  escena.add(grupo);
  escena.userData.hits = hits;
  // La niebla se aleja con el tamaño del depósito, para que una estantería lejos no se pinte del color del fondo.
  escena.fog = new THREE.Fog(0x1e293b, 5, Math.max(24, -zMin * 1.5));
  return { escena, zMin, xLim };
}

