// Ruta a pie por el piso del recorrido 3D (sin dependencias de la vista, para poder probarla).

// Ruta por el piso entre dos puntos sin atravesar estanterías (cuenta un margen para el cuerpo).
// A* sobre una grilla; después se acorta: se va en línea recta siempre que el tramo quede libre.
const CELDA = 0.2;          // tamaño de cada celda de la grilla, en metros
export const RADIO_CUERPO = 0.3;   // margen alrededor de cada estantería y de las paredes

// Regla de "se puede pisar" para la caminata: dentro del piso (si hay límites) y fuera de las estanterías con su margen.
// Es la misma para la ruta de Pasear y para caminar a mano, así no se cruza nada que la ruta esquive.
// cajasSueltas: cajas del piso ({ x, z, w, d }) que también se esquivan.
export function pisoLibre(disp, medidas, limites = null, cajasSueltas = []) {
  const cajas = [...disp.values()].map(d => {
    const h = medidas(d.giro);
    return { x: d.x, z: d.z, ex: h.ex + RADIO_CUERPO, ez: h.ez + RADIO_CUERPO };
  }).concat(cajasSueltas.map(c => ({ x: c.x, z: c.z, ex: c.w / 2 + RADIO_CUERPO, ez: c.d / 2 + RADIO_CUERPO })));
  return (x, z) => (!limites || (x >= limites.x0 && x <= limites.x1 && z >= limites.z0 && z <= limites.z1))
    && !cajas.some(c => Math.abs(x - c.x) < c.ex && Math.abs(z - c.z) < c.ez);
}

// limites (opcional): { x0, x1, z0, z1 } del piso del galpón; la ruta no sale de ahí.
export function calcularRuta(disp, desde, hasta, medidas, limites = null, cajasSueltas = []) {
  const cajas = [...disp.values()].map(d => {
    const h = medidas(d.giro);
    return { x: d.x, z: d.z, ex: h.ex + RADIO_CUERPO, ez: h.ez + RADIO_CUERPO };
  }).concat(cajasSueltas.map(c => ({ x: c.x, z: c.z, ex: c.w / 2 + RADIO_CUERPO, ez: c.d / 2 + RADIO_CUERPO })));
  const libre = pisoLibre(disp, medidas, limites, cajasSueltas);
  const x0 = Math.min(desde.x, hasta.x, ...cajas.map(c => c.x - c.ex)) - 1;
  const x1 = Math.max(desde.x, hasta.x, ...cajas.map(c => c.x + c.ex)) + 1;
  const z0 = Math.min(desde.z, hasta.z, ...cajas.map(c => c.z - c.ez)) - 1;
  const z1 = Math.max(desde.z, hasta.z, ...cajas.map(c => c.z + c.ez)) + 1;
  const nx = Math.ceil((x1 - x0) / CELDA) + 1, nz = Math.ceil((z1 - z0) / CELDA) + 1;
  const celdaX = x => Math.round((x - x0) / CELDA), celdaZ = z => Math.round((z - z0) / CELDA);
  const mundoX = i => x0 + i * CELDA, mundoZ = j => z0 + j * CELDA;
  const bloqueada = (i, j) => i < 0 || j < 0 || i >= nx || j >= nz || !libre(mundoX(i), mundoZ(j));

  // Celda libre más cercana (si el punto cae dentro de una estantería o pegado a ella).
  const cercanoLibre = (i, j) => {
    for (let r = 0; r <= 40; r++)
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++)
          if (Math.max(Math.abs(di), Math.abs(dj)) === r && !bloqueada(i + di, j + dj)) return [i + di, j + dj];
    return null;
  };
  const inicio = cercanoLibre(celdaX(desde.x), celdaZ(desde.z));
  const meta = cercanoLibre(celdaX(hasta.x), celdaZ(hasta.z));
  if (!inicio || !meta) return [hasta];

  // A* (movimiento en 8 direcciones) con cola de prioridad simple.
  const h = (i, j) => { const dx = Math.abs(i - meta[0]), dz = Math.abs(j - meta[1]); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); };
  const costo = new Map([[inicio[0] * nz + inicio[1], 0]]);
  const previo = new Map();
  const cola = [{ i: inicio[0], j: inicio[1], f: h(inicio[0], inicio[1]) }];
  const meta_k = meta[0] * nz + meta[1];
  while (cola.length) {
    let mejor = 0;
    for (let k = 1; k < cola.length; k++) if (cola[k].f < cola[mejor].f) mejor = k;
    const { i, j } = cola[mejor];
    cola[mejor] = cola[cola.length - 1]; cola.pop();
    const k0 = i * nz + j;
    if (k0 === meta_k) break;
    const g0 = costo.get(k0);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (bloqueada(ni, nj)) continue;
      // no cortar esquinas de estanterías en diagonal
      if (di && dj && (bloqueada(i + di, j) || bloqueada(i, j + dj))) continue;
      const g = g0 + (di && dj ? Math.SQRT2 : 1);
      const kn = ni * nz + nj;
      if (g < (costo.get(kn) ?? Infinity)) {
        costo.set(kn, g); previo.set(kn, k0);
        cola.push({ i: ni, j: nj, f: g + h(ni, nj) });
      }
    }
  }
  if (!previo.has(meta_k) && meta_k !== inicio[0] * nz + inicio[1]) return [hasta];

  // Reconstruye el camino (de la meta al inicio) y pasa a metros.
  const celdas = [];
  for (let k = meta_k; ; k = previo.get(k)) {
    celdas.push([Math.floor(k / nz), k % nz]);
    if (k === inicio[0] * nz + inicio[1]) break;
  }
  celdas.reverse();
  const pts = celdas.map(([i, j]) => ({ x: mundoX(i), z: mundoZ(j) }));
  pts[0] = { x: desde.x, z: desde.z };
  pts[pts.length - 1] = { x: hasta.x, z: hasta.z };

  // Acorta: desde cada punto va al más lejano que se vea sin tocar estanterías.
  const visible = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELDA / 4));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!libre(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  };
  const salida = [pts[0]];
  let k = 0;
  while (k < pts.length - 1) {
    let m = pts.length - 1;
    while (m > k + 1 && !visible(pts[k], pts[m])) m--;
    salida.push(pts[m]);
    k = m;
  }
  return salida.slice(1);
}


// Límites del centro de una estantería para que toda su huella quede dentro del galpón.
// Sistema: x centrado (−ancho/2 a ancho/2), z desde el frente (0) hacia el fondo (−largo). Medidas en metros.
// h = { ex, ez }: medias dimensiones de la estantería en el piso.
export function limitesDentroDelGalpon(ancho, largo, h) {
  return { x0: -ancho / 2 + h.ex, x1: ancho / 2 - h.ex, z0: -largo + h.ez, z1: -h.ez };
}

// Acomoda en su lugar las estanterías de una disposición que se salgan del galpón (las guardadas no se tocan aparte de esto).
export function acomodarEnGalpon(disp, g, huella) {
  for (const d of disp.values()) {
    const lim = limitesDentroDelGalpon(g.A, g.L, huella(d.giro));
    d.x = dentroDe(d.x, lim.x0, lim.x1); d.z = dentroDe(d.z, lim.z0, lim.z1);
  }
  return disp;
}

// Acerca v al intervalo [a, b]; si el intervalo no entra (estantería más grande que el galpón), queda al centro.
export function dentroDe(v, a, b) {
  return a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v));
}
