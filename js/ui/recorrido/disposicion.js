// Disposición de las estanterías en el recorrido 3D: funciones puras (sin Three.js ni la base),
// para poder probarlas con node. Medidas en metros; la posición guardada viene en centímetros.

export const LARGO = 2.2;    // largo de cada estantería, a lo largo del pasillo
export const SEP = 3.4;      // distancia entre pares de estanterías (y entre estanterías del mismo lado)
export const FONDO = 0.9;    // cuánto sobresale cada estante hacia el pasillo
export const MITAD = 2.3;    // distancia desde el centro del pasillo hasta cada columna
export const ALTO = 2.6;     // altura de los estantes, desde la base hacia arriba
export const BASE = 0;      // altura de la tabla más baja (0 = desde el piso); los estantes se apilan hacia arriba

// Medias dimensiones de una estantería en el piso, según su giro (0-3 cuartos de vuelta).
export const huella = giro => (giro % 2 === 0 ? { ex: FONDO / 2, ez: LARGO / 2 } : { ex: LARGO / 2, ez: FONDO / 2 });

// Punto frente a la cara de una estantería (la de los estantes), a 1,2 m, mirándola.
export function frenteDe(d) {
  // Hacia dónde salen los estantes en el piso, según el lado y el giro.
  const sal = d.lado === 'izq' ? 1 : -1;
  const t = d.giro * Math.PI / 2;
  const n = { x: sal * Math.cos(t), z: -sal * Math.sin(t) };
  return { x: d.x + n.x * 1.2, z: d.z + n.z * 1.2, yaw: Math.atan2(n.x, n.z) };
}

// Agrupa los lugares en filas (pasillos) según su posición en el plano; cada fila va ordenada de izquierda a derecha.
// posicion(lugar) -> { x, y } en el plano.
export function agruparPasillos(lugares, posicion) {
  const filas = new Map();
  lugares.forEach(k => {
    const p = posicion(k);
    const clave = Math.round(p.y / 100);
    if (!filas.has(clave)) filas.set(clave, []);
    filas.get(clave).push({ k, x: p.x });
  });
  return [...filas.keys()].sort((a, b) => a - b).map(c => filas.get(c).sort((a, b) => a.x - b.x).map(e => e.k));
}

// Posición de cada estantería, en metros. Si tiene posición guardada se usa esa;
// si no, la que sale del plano (cada pasillo del plano es una fila, separada de la siguiente).
export function calcularDisposicion(filas) {
  const pares = Math.max(1, ...filas.map(f => Math.ceil(f.length / 2)));
  const salto = pares * SEP + 6;
  const disp = new Map();
  filas.forEach((fila, fi) => fila.forEach((l, idx) => {
    const p = Math.floor(idx / 2);
    const porDefecto = { x: idx % 2 === 0 ? -MITAD + FONDO / 2 : MITAD - FONDO / 2, z: -fi * salto - 1.2 - p * SEP - LARGO / 2, giro: 0 };
    const guardada = l.vista_x != null && l.vista_z != null;
    disp.set(l.id, guardada ? { x: l.vista_x / 100, z: l.vista_z / 100, giro: l.vista_giro || 0 } : porDefecto);
  }));
  return disp;
}

// Fila de estanterías del recorrido: sus posiciones, corridas para empezar al inicio del pasillo y centradas en x.
export function calcularFila(filas, fi) {
  const fila = filas[fi] || [];
  const todas = calcularDisposicion(filas);
  const disp = new Map(fila.map(l => [l.id, { ...todas.get(l.id) }]));
  const ds = [...disp.values()];
  if (ds.length) {
    const minX = Math.min(...ds.map(d => d.x - huella(d.giro).ex));
    const maxX = Math.max(...ds.map(d => d.x + huella(d.giro).ex));
    const maxZ = Math.max(...ds.map(d => d.z + huella(d.giro).ez));
    const dx = -(minX + maxX) / 2, dz = -1.2 - maxZ;
    ds.forEach(d => { d.x += dx; d.z += dz; });
  }
  // Los estantes miran hacia el centro del pasillo: si la estantería está a la izquierda, a la izquierda del pasillo.
  ds.forEach(d => { d.lado = d.x < 0 ? 'izq' : 'der'; });
  return { fila, disp };
}
