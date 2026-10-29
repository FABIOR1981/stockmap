// Vista Recorrido (prototipo, solo PC): un pasillo en perspectiva con los módulos de un lugar a ambos lados.
// Los módulos se alternan: los de índice par van a la izquierda y los impares a la derecha.
// Cada tramo es un par de módulos; avanzar o retroceder mueve la vista un tramo.

import { ctx, S, esc, msgHTML, aviso } from './estado.js';
import { estadoDe, leyenda } from './componentes.js';
import { ic } from './iconos.js';

const VP = { x: 500, y: 280 };   // punto de fuga
const WC = 400;                  // mitad del ancho del pasillo a la altura de la vista
const HT = 220, HB = 200;        // altura hasta el techo y hasta el piso (a la altura de la vista)
const G = 0.38;                  // cuánto se achica cada tramo al alejarse
const PROFUNDIDAD = 5;           // cuántos tramos se ven a la vez

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const escala = d => 1 / (1 + G * d);
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

// Hijos del pasillo actual (S.nodo) y cantidad de tramos.
function hijosDelPasillo() {
  return S.nodo ? ctx.dep.hijos(S.nodo) : [];
}
function tramosDe(kids) {
  return Math.max(1, Math.ceil(kids.length / 2));
}

// Un módulo: cuadrilátero sobre la pared, en el tramo d (0 = el más cercano).
function modulo(l, lado, d) {
  const st = estadoDe(l);
  const sgn = lado === 'izq' ? -1 : 1;
  const s0 = escala(d), s1 = escala(d + 0.9);   // 0.9: deja una franja libre entre módulos
  const x = s => VP.x + sgn * WC * s;
  const yt = s => VP.y - HT * s, yb = s => VP.y + HB * s;
  const puntos = [[x(s0), yt(s0)], [x(s1), yt(s1)], [x(s1), yb(s1)], [x(s0), yb(s0)]]
    .map(([a, b]) => pt(a, b)).join(' ');
  const cx = (x(s0) + x(s1)) / 2;
  const clases = ['rec-mod', st.cls];
  if (S.elegido === l.id) clases.push('elegido');
  if (S.rec.resaltado === l.id) clases.push('buscado');
  // Texto solo si el módulo es lo bastante grande para leerlo.
  const texto = s0 >= 0.45
    ? `<text class="rec-cod" x="${cx.toFixed(1)}" y="${(VP.y - 6 * s0).toFixed(1)}" font-size="${(26 * s0).toFixed(1)}">${esc(l.codigo)}</text>
       <text class="rec-chip" x="${cx.toFixed(1)}" y="${(VP.y + 22 * s0).toFixed(1)}" font-size="${(14 * s0).toFixed(1)}">${esc(st.chip)}</text>`
    : '';
  return `<g class="${clases.join(' ')}" data-act="planoSeleccionar" data-id="${l.id}">
    <polygon points="${puntos}"/>${texto}</g>`;
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

  // Tramos visibles desde S.rec.i: cada tramo tiene un módulo a cada lado.
  const modulos = [];
  for (let d = 0; d < PROFUNDIDAD; d++) {
    const p = S.rec.i + d;
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

  const kids = hijosDelPasillo();
  const tramos = tramosDe(kids);
  const i = Math.min(S.rec.i, tramos - 1);
  const cab = `<div class="rec-cab">
      <button class="btn sec sm" data-act="recSubir">← Subir</button>
      <button class="btn sec sm" data-act="recIr">Edificios</button>
    </div>
    <h1>${esc(dep.dir(foco))}</h1>
    <p class="sub">Caminá con las flechas del teclado o con los botones. Los módulos se alternan a izquierda y derecha. Clic para seleccionar, doble clic para entrar.</p>`;

  const buscar = `<div class="rec-barra">
      <input data-f="recBusca" data-enter="recBuscar" value="${esc(S.f.recBusca || '')}" placeholder="Código de lugar u objeto" aria-label="Código de lugar u objeto">
      <button class="btn sec" data-act="recBuscar">Ir</button>
    </div>`;

  if (!kids.length) {
    return `${cab}${buscar}${msgHTML('recorrido')}
      <p class="vacio">Este lugar no tiene módulos adentro. Entrá a otro lugar o subí un nivel.</p>`;
  }

  const controles = `<div class="rec-controles">
      <button class="btn sec sm" data-act="recPaso" data-dir="-1" ${i <= 0 ? 'disabled' : ''}>← Atrás</button>
      <span class="rec-tramo">Tramo ${i + 1} de ${tramos}</span>
      <button class="btn sec sm" data-act="recPaso" data-dir="1" ${i >= tramos - 1 ? 'disabled' : ''}>Adelante →</button>
    </div>`;

  return `${cab}${buscar}${msgHTML('recorrido')}
    <div class="plano-y-panel">
      <div class="plano-marco rec-marco"><div class="rec-escena">${escenaPasillo(kids)}</div>${leyenda()}</div>
      <section class="panel">${detalle()}</section>
    </div>
    ${controles}`;
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
  // Avanza (1) o retrocede (-1) un tramo, sin salirse del pasillo.
  recPaso: el => {
    const tramos = tramosDe(hijosDelPasillo());
    S.rec.i = Math.min(Math.max(S.rec.i + Number(el.dir), 0), tramos - 1);
    S.rec.resaltado = null;
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

    // Va al pasillo que contiene el lugar (su padre) y lo resalta. Si es un edificio, se recorre él mismo.
    const padre = lugar.padre_id || null;
    S.nodo = padre ?? lugar.id;
    S.rec = { i: 0, resaltado: null };
    if (padre) {
      const idx = Math.max(0, dep.hijos(padre).findIndex(k => k.id === lugar.id));
      S.rec.i = Math.floor(idx / 2);
      S.rec.resaltado = lugar.id;
      S.elegido = lugar.id;
    } else {
      S.elegido = null;
    }
    S.f.recBusca = raw;
    aviso('recorrido', null, obj ? `${obj.codigo_interno} está en ${dep.dir(lugar)}.` : `Lugar encontrado: ${dep.dir(lugar)}.`);
  },
};
