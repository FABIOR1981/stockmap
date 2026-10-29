// Vista Recorrido (prototipo, solo PC): un pasillo en perspectiva con los módulos de un lugar a ambos lados.
// Los módulos se alternan: los de índice par van a la izquierda y los impares a la derecha.
// Cada tramo es un par de módulos; avanzar o retroceder mueve la vista un tramo.

import { ctx, S, esc, msgHTML, aviso } from './estado.js';
import { estadoDe, leyenda } from './componentes.js';
import { ic } from './iconos.js';
import { posEnPlano } from './plano.js';

const VP = { x: 500, y: 280 };   // punto de fuga
const WC = 400;                  // mitad del ancho del pasillo a la altura de la vista
const HT = 220, HB = 200;        // altura hasta el techo y hasta el piso (a la altura de la vista)
const G = 0.38;                  // cuánto se achica cada tramo al alejarse
const PROFUNDIDAD = 8;           // cuántos tramos se ven a la vez (hasta el fondo del pasillo)
const PASO = 0.5;                // cuánto avanza cada clic, en tramos (medio tramo = una estantería)
const LARGO = 0.28;               // largo de cada estantería dentro de su tramo (el resto es el espacio entre ellas)
const SALIDA = 0.5;              // hasta dónde salen los estantes hacia el pasillo (1 = hasta el centro del pasillo, 0 = pegados a la pared)

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const escala = d => 1 / (1 + G * d);
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

// Agrupa las estanterías del edificio por fila en el plano: cada fila es un pasillo longitudinal.
// El espacio entre filas es el pasillo transversal. Dentro de cada fila, de izquierda a derecha.
function pasillosDe(edificio) {
  const filas = new Map();
  ctx.dep.hijos(edificio.id).forEach(k => {
    const p = posEnPlano(k);
    const clave = Math.round(p.y / 100);
    if (!filas.has(clave)) filas.set(clave, []);
    filas.get(clave).push({ k, x: p.x });
  });
  return [...filas.keys()].sort((a, b) => a - b).map(c => filas.get(c).sort((a, b) => a.x - b.x).map(e => e.k));
}

// Estanterías del pasillo actual. En el edificio, es la fila de estanterías que indica S.rec.fila.
function hijosDelPasillo() {
  if (!S.nodo) return [];
  const l = ctx.dep.porId(S.nodo);
  if (l && ctx.dep.prof(l) === 0) {
    const filas = pasillosDe(l);
    return filas[Math.min(S.rec.fila || 0, filas.length - 1)] || [];
  }
  return ctx.dep.hijos(S.nodo);
}
function tramosDe(kids) {
  return Math.max(1, Math.ceil(kids.length / 2));
}

// Una estantería: su cara sobre la pared, en el tramo d (0 = el más cercano).
// Estantes = hijos de la estantería; huecos = hijos de cada estante (si no tiene, el estante mismo es el hueco).
// Cada objeto puesto en un hueco se dibuja como una caja sobre el estante.
function modulo(l, lado, d) {
  const dep = ctx.dep;
  const st = estadoDe(l);
  const sgn = lado === 'izq' ? -1 : 1;
  const s0 = escala(d), s1 = escala(d + LARGO);   // el espacio libre entre estanterías queda después de LARGO
  // Punto de la estantería: t de 0 (cerca) a 1 (lejos) a lo largo del pasillo; h de 0 (arriba) a 1 (piso).
  // u = 0 es la columna contra la pared; u = 1 es el borde del estante hacia el pasillo.
  // Los estantes salen horizontales desde la columna, en el mismo lado de la pared.
  const Pt = (t, h, u) => {
    const s = s0 + (s1 - s0) * t;
    return [VP.x + sgn * WC * s * (1 - u * (1 - SALIDA)), VP.y - HT * s + h * (HT + HB) * s];
  };
  const poli = pts => pts.map(([a, b]) => pt(a, b)).join(' ');
  // Columna: la cara contra la pared.
  const columna = poli([Pt(0, 0, 0), Pt(1, 0, 0), Pt(1, 1, 0), Pt(0, 1, 0)]);

  const estantes = dep.hijos(l.id);
  const filas = estantes.length ? estantes : [l];
  const n = filas.length;
  let huecos = '', tablas = '';
  filas.forEach((f, fi) => {
    // El estante está en el borde inferior de su franja (h1). Sus huecos se reparten a lo largo del pasillo.
    const h0 = fi / n, h1 = (fi + 1) / n;
    const subs = estantes.length ? dep.hijos(f.id) : [];
    const celdas = subs.length ? subs : [f];
    const k = celdas.length;
    celdas.forEach((c, ci) => {
      const t0 = ci / k, t1 = (ci + 1) / k;
      const clases = ['rec-celda'];
      if (S.elegido === c.id) clases.push('elegido');
      if (S.rec.resaltado === c.id) clases.push('buscado');
      const objs = dep.objetosDe(c.id);
      const m = Math.min(objs.length, 4);
      const sw = (t1 - t0) / Math.max(m, 1);
      const alto = (h1 - h0) * 0.6;   // altura de la caja, en la misma escala que la franja
      let cajas = '';
      for (let j = 0; j < m; j++) {
        const ta = t0 + sw * j + sw * 0.15, tb = ta + sw * 0.7;
        // Caja apoyada sobre el estante: cara hacia el pasillo y tapa.
        const arriba = h1 - alto;
        cajas += `<polygon class="rec-caja" points="${poli([Pt(ta, h1, 0.2), Pt(tb, h1, 0.2), Pt(tb, arriba, 0.2), Pt(ta, arriba, 0.2)])}"/>`
          + `<polygon class="rec-caja-tapa" points="${poli([Pt(ta, arriba, 0.2), Pt(tb, arriba, 0.2), Pt(tb, arriba, 0.8), Pt(ta, arriba, 0.8)])}"/>`;
      }
      const cant = `${objs.length} ${objs.length === 1 ? 'objeto' : 'objetos'}`;
      // La superficie del estante para este hueco (horizontal, desde la columna hacia el pasillo).
      const tabla = poli([Pt(t0, h1, 0), Pt(t1, h1, 0), Pt(t1, h1, 1), Pt(t0, h1, 1)]);
      huecos += `<g class="${clases.join(' ')}" data-act="planoSeleccionar" data-id="${c.id}">
        <title>${esc(dep.dir(c))}: ${cant}</title>
        <polygon class="rec-zona" points="${tabla}"/>${cajas}</g>`;
    });
  });

  // Cada estante es una tabla sólida que sale de la columna (una sola pieza por estante, sin líneas por hueco).
  filas.forEach((f, fi) => {
    const h1 = (fi + 1) / n;
    tablas += `<polygon class="rec-tablon-p" points="${poli([Pt(0, h1, 0), Pt(1, h1, 0), Pt(1, h1 + 0.012, 1), Pt(0, h1 + 0.012, 1)])}"/>`;
  });

  const clases = ['rec-mod', st.cls];
  if (S.elegido === l.id) clases.push('elegido');
  if (S.rec.resaltado === l.id) clases.push('buscado');
  // Código de la estantería solo si es lo bastante grande para leerlo.
  const [cx, cy] = Pt(0.5, 0.1, 0);
  const texto = s0 >= 0.45
    ? `<text class="rec-cod" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${(22 * s0).toFixed(1)}">${esc(l.codigo)}</text>`
    : '';
  return `<g class="${clases.join(' ')}" data-act="planoSeleccionar" data-id="${l.id}">
    <title>${esc(dep.dir(l))} · ${esc(st.chip)}</title>
    <polygon class="rec-marco-mod" points="${columna}"/>${tablas}${huecos}${texto}</g>`;
}

// Paredes laterales, piso, techo y fondo del pasillo, como capas debajo de los módulos.
function escenaPasillo(kids) {
  const fondo = escala(PROFUNDIDAD);
  const x = (s, sgn) => VP.x + sgn * WC * s;
  const yt = s => VP.y - HT * s, yb = s => VP.y + HB * s;
  const pared = sgn => `<polygon class="rec-pared" points="${[
    pt(x(1, sgn), yt(1)), pt(x(fondo, sgn), yt(fondo)), pt(x(fondo, sgn), yb(fondo)), pt(x(1, sgn), yb(1))
  ].join(' ')}"/>`;
  const piso = `<polygon class="rec-piso" points="${[
    pt(x(1, -1), yb(1)), pt(x(1, 1), yb(1)), pt(x(fondo, 1), yb(fondo)), pt(x(fondo, -1), yb(fondo))
  ].join(' ')}"/>`;
  const techo = `<polygon class="rec-techo" points="${[
    pt(x(1, -1), yt(1)), pt(x(1, 1), yt(1)), pt(x(fondo, 1), yt(fondo)), pt(x(fondo, -1), yt(fondo))
  ].join(' ')}"/>`;
  const fin = `<rect class="rec-fondo" x="${(VP.x - WC * fondo).toFixed(1)}" y="${yt(fondo).toFixed(1)}" width="${(2 * WC * fondo).toFixed(1)}" height="${((HT + HB) * fondo).toFixed(1)}"/>`;

  // Tramos alrededor de la posición actual (S.rec.i puede ser fraccionaria): cada tramo tiene un módulo a cada lado.
  // Los que quedan justo al costado del que camina se dibujan y el SVG los recorta.
  const modulos = [];
  const desde = Math.max(0, Math.floor(S.rec.i) - 1);
  for (let p = desde; p * 2 < kids.length && p < S.rec.i + PROFUNDIDAD; p++) {
    const d = p - S.rec.i;
    if (d < -0.9) continue;
    const izq = kids[2 * p], der = kids[2 * p + 1];
    if (izq) modulos.push(modulo(izq, 'izq', d));
    if (der) modulos.push(modulo(der, 'der', d));
  }
  return `<svg viewBox="0 0 1000 560" role="img" aria-label="Pasillo con ${kids.length} módulos">
    ${techo}${piso}${pared(-1)}${pared(1)}${fin}${modulos.join('')}
  </svg>`;
}

function detalle() {
  const dep = ctx.dep;
  const l = S.elegido ? dep.porId(S.elegido) : null;
  if (!l) {
    return `<h2>Módulo</h2>
      <p class="vacio" style="border:0;margin:0">Hacé clic en un módulo para ver lo que tiene. Doble clic para entrar.</p>`;
  }
  const objs = dep.objetosDe(l.id);
  return `<h2>${esc(dep.dir(l))}</h2>
    <p class="sub">${esc(dep.nivelDe(l).nombre)} · ${esc(estadoDe(l).chip)}</p>
    ${objs.length
      ? `<ul class="rec-lista">${objs.map(o => `<li><b>${esc(o.codigo_interno)}</b> ${esc(o.descripcion || '')}</li>`).join('')}</ul>`
      : '<p class="vacio" style="border:0;margin:0 0 12px">Libre. Podés asignar objetos desde Asignación.</p>'}
    <button class="btn sec sm" data-act="planoIr" data-id="${l.id}">Entrar a ${esc(l.codigo)}</button>`;
}

// Vista de frente: dentro de una estantería, sus estantes van horizontales, uno encima del otro.
// Cada estante es una tabla; sus huecos van de izquierda a derecha y los objetos se apoyan sobre la tabla.
function frente(foco) {
  const dep = ctx.dep;
  const X0 = 110, X1 = 960, Y0 = 30, Y1 = 530;
  const estantes = dep.hijos(foco.id);
  const alto = (Y1 - Y0) / estantes.length;
  let svg = `<rect class="rec-marco-frente" x="${X0 - 14}" y="${Y0 - 14}" width="${X1 - X0 + 28}" height="${Y1 - Y0 + 28}"/>`;
  estantes.forEach((e, fi) => {
    const y = Y0 + fi * alto, h = alto;
    const huecos = dep.hijos(e.id);
    const celdas = huecos.length ? huecos : [e];
    const k = celdas.length, cw = (X1 - X0) / k;
    svg += `<text class="rec-etiqueta-fila" x="${X0 - 26}" y="${(y + h / 2 + 7).toFixed(1)}" text-anchor="end" font-size="20">${esc(e.codigo)}</text>`;
    celdas.forEach((c, ci) => {
      const x = X0 + ci * cw;
      const objs = dep.objetosDe(c.id);
      const m = Math.min(objs.length, 6);
      const clases = ['rec-celda'];
      if (S.elegido === c.id) clases.push('elegido');
      if (S.rec.resaltado === c.id) clases.push('buscado');
      let cajas = '';
      const bw = (cw * 0.8) / Math.max(m, 1);
      for (let j = 0; j < m; j++) {
        const bx = x + cw * 0.1 + j * bw + 3, ancho = bw - 6;
        const bh = (h - 22) * 0.55, by = y + h - 12 - bh;
        cajas += `<rect class="rec-caja" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${ancho.toFixed(1)}" height="${bh.toFixed(1)}"/>`
          + `<rect class="rec-caja-tapa" x="${bx.toFixed(1)}" y="${(by - 6).toFixed(1)}" width="${ancho.toFixed(1)}" height="6"/>`;
      }
      const cant = `${objs.length} ${objs.length === 1 ? 'objeto' : 'objetos'}`;
      svg += `<g class="${clases.join(' ')}" data-act="planoSeleccionar" data-id="${c.id}">
        <title>${esc(dep.dir(c))}: ${cant}</title>
        <rect class="rec-hueco" x="${(x + 4).toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${(cw - 8).toFixed(1)}" height="${(h - 16).toFixed(1)}"/>${cajas}</g>`;
    });
    svg += `<rect class="rec-tablon" x="${X0}" y="${(y + h - 12).toFixed(1)}" width="${X1 - X0}" height="12"/>`;
  });
  return `<svg viewBox="0 0 1000 560" role="img" aria-label="Frente de ${esc(dep.dir(foco))}">${svg}</svg>`;
}

function vistaFrente(foco) {
  const dep = ctx.dep;
  const estantes = dep.hijos(foco.id);
  const cab = `<div class="rec-cab">
      <button class="btn sec sm" data-act="recSubir">← Subir</button>
      <button class="btn sec sm" data-act="recIr">Edificios</button>
    </div>
    <h1>${esc(dep.dir(foco))}</h1>
    <p class="sub">Cada tabla es un estante. Clic para seleccionar un hueco, doble clic para entrar.</p>`;
  const buscar = `<div class="rec-barra">
      <input data-f="recBusca" data-enter="recBuscar" value="${esc(S.f.recBusca || '')}" placeholder="Código de lugar u objeto" aria-label="Código de lugar u objeto">
      <button class="btn sec" data-act="recBuscar">Ir</button>
    </div>`;
  if (!estantes.length) return `${cab}${buscar}${msgHTML('recorrido')}<p class="vacio">Esta estantería no tiene estantes cargados.</p>`;
  return `${cab}${buscar}${msgHTML('recorrido')}
    <div class="plano-y-panel">
      <div class="plano-marco rec-marco"><div class="rec-escena">${frente(foco)}</div>${leyenda()}</div>
      <section class="panel rec-panel">${detalle()}</section>
    </div>
    <div class="rec-controles">
      <span class="rec-tramo">${estantes.length} ${estantes.length === 1 ? 'estante' : 'estantes'}</span>
      <button class="btn sec sm" data-act="recAmpliar">Ampliar</button>
    </div>`;
}

export function vistaRecorrido() {
  const dep = ctx.dep;
  if (!dep.eid) return `<h1>Recorrido</h1><p class="vacio">Elegí un cliente en el menú de cuenta para ver su depósito.</p>`;

  const foco = S.nodo ? dep.porId(S.nodo) : null;
  if (!foco) {
    const edificios = dep.hijos(null);
    return `<h1>Recorrido</h1>
      <p class="sub">Elegí un edificio para caminar por sus pasillos.</p>
      ${edificios.length
        ? `<div class="rec-edificios">${edificios.map(e => `<button class="btn sec" data-act="recIr" data-id="${e.id}">${ic('edificio', 18)} ${esc(e.codigo)}${e.nombre ? ` ${esc(e.nombre)}` : ''}</button>`).join('')}</div>`
        : '<p class="vacio">Todavía no hay edificios.</p>'}`;
  }

  // Dentro de una estantería, sus estantes se ven de frente (horizontales); en el edificio, las estanterías se recorren.
  if (dep.prof(foco) >= 1) return vistaFrente(foco);
  const kids = hijosDelPasillo();
  const tramos = tramosDe(kids);
  const i = Math.min(S.rec.i, tramos - 1);
  const cab = `<div class="rec-cab">
      <button class="btn sec sm" data-act="recSubir">← Subir</button>
      <button class="btn sec sm" data-act="recIr">Edificios</button>
    </div>
    <h1>${esc(dep.dir(foco))}</h1>
    <p class="sub">Izquierda y derecha caminan por el pasillo. Arriba y abajo cruzan al pasillo transversal. Clic para seleccionar, doble clic para entrar.</p>`;

  const buscar = `<div class="rec-barra">
      <input data-f="recBusca" data-enter="recBuscar" value="${esc(S.f.recBusca || '')}" placeholder="Código de lugar u objeto" aria-label="Código de lugar u objeto">
      <button class="btn sec" data-act="recBuscar">Ir</button>
    </div>`;

  if (!kids.length) {
    return `${cab}${buscar}${msgHTML('recorrido')}
      <p class="vacio">Este lugar no tiene módulos adentro. Entrá a otro lugar o subí un nivel.</p>`;
  }

  // Cruce entre pasillos (filas de estanterías del plano). Solo si hay más de uno.
  const filas = pasillosDe(foco);
  const f = Math.min(S.rec.fila || 0, filas.length - 1);
  const cruce = filas.length > 1 ? `<div class="rec-controles">
      <button class="btn sec sm" data-act="recCruzar" data-dir="-1" ${f <= 0 ? 'disabled' : ''}>↑ Pasillo anterior</button>
      <span class="rec-tramo">Pasillo ${f + 1} de ${filas.length}</span>
      <button class="btn sec sm" data-act="recCruzar" data-dir="1" ${f >= filas.length - 1 ? 'disabled' : ''}>Pasillo siguiente ↓</button>
    </div>` : '';
  const controles = `<div class="rec-controles">
      <button class="btn sec sm" data-act="recPaso" data-dir="-1" ${i <= 0 ? 'disabled' : ''}>← Atrás</button>
      <span class="rec-tramo">Tramo ${Math.floor(i) + 1} de ${tramos}</span>
      <button class="btn sec sm" data-act="recAmpliar">${document.fullscreenElement ? 'Salir de pantalla completa' : 'Ampliar'}</button>
      <button class="btn sec sm" data-act="recPaso" data-dir="1" ${i >= tramos - 1 ? 'disabled' : ''}>Adelante →</button>
    </div>`;

  return `${cab}${buscar}${msgHTML('recorrido')}
    <div class="plano-y-panel">
      <div class="plano-marco rec-marco"><div class="rec-escena">${escenaPasillo(kids)}</div>${leyenda()}</div>
      <section class="panel rec-panel">${detalle()}</section>
    </div>
    ${cruce}${controles}`;
}

// Acciones de la vista. Se suman a ACCIONES en acciones.js.
export const accionesRecorrido = {
  // Elige el edificio cuyo pasillo se recorre (sin id: vuelve a la lista de edificios).
  recIr: el => { S.nodo = el.id || null; S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {}; },
  // Sube un nivel dentro del recorrido.
  recSubir: () => {
    const l = ctx.dep.porId(S.nodo);
    S.nodo = l?.padre_id || null;
    S.rec = { i: 0, resaltado: null }; S.elegido = null; S.msg = {};
  },
  // Avanza (1) o retrocede (-1) medio tramo, sin salirse del pasillo.
  recPaso: el => {
    const tramos = tramosDe(hijosDelPasillo());
    const nuevo = S.rec.i + Number(el.dir) * PASO;
    S.rec.i = Math.round(Math.min(Math.max(nuevo, 0), tramos - 1) * 2) / 2;
    S.rec.resaltado = null;
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
  // Busca un código de lugar u objeto y lleva la vista a su módulo.
  recBuscar: () => {
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
    aviso('recorrido', null, obj ? `${obj.codigo_interno} está en ${dep.dir(lugar)}.` : `Lugar encontrado: ${dep.dir(lugar)}.`);
  },
};
