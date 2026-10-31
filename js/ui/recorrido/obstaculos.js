// Cajas sueltas en el piso del recorrido: sobras de la operativa (sin lugar asignado).
// Funciones puras: la misma semilla da siempre la misma distribución.

// Generador de números al azar con semilla (mulberry32): reproducible.
export function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Número con semilla a partir de un texto (por ejemplo, el id del edificio).
export function semillaDe(texto, extra = 0) {
  let h = 2166136261 ^ extra;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Coloca cajas de tamaños distintos dentro de la zona indicada, sin tocar lo que hay que evitar.
// zona: { x0, x1, z0, z1 } en metros. evitar: [{ x, z, ex, ez }] (medias dimensiones; ex/ez = radio alrededor).
// Devuelve [{ x, z, w, d, h }] con w, d (en el piso) y h (alto).
export function generarCajas({ semilla, zona, evitar = [], cantidad = 10, intentos = 400 }) {
  const rnd = aleatorio(semilla);
  const cajas = [];
  const libre = (x, z, w, d) => {
    const margen = 0.25;   // separación mínima entre cajas y con lo que se evita
    const choca = (c) => Math.abs(x - c.x) < c.ex + w / 2 + margen && Math.abs(z - c.z) < c.ez + d / 2 + margen;
    return !evitar.some(choca) && !cajas.some(c => Math.abs(x - c.x) < (c.w + w) / 2 + margen && Math.abs(z - c.z) < (c.d + d) / 2 + margen);
  };
  for (let n = 0, k = 0; n < cantidad && k < intentos; k++) {
    const w = 0.35 + rnd() * 0.65, d = 0.35 + rnd() * 0.65, h = 0.3 + rnd() * 0.9;
    const x = zona.x0 + w / 2 + rnd() * Math.max(0, zona.x1 - zona.x0 - w);
    const z = zona.z0 + d / 2 + rnd() * Math.max(0, zona.z1 - zona.z0 - d);
    if (libre(x, z, w, d)) { cajas.push({ x, z, w, d, h, ex: w / 2, ez: d / 2 }); n++; }
  }
  return cajas.map(({ x, z, w, d, h }) => ({ x, z, w, d, h }));
}
