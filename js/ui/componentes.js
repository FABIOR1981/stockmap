// Piezas que se repiten: tarjetas, bloques del plano, migas y acción principal.

import { ctx, S, esc } from './estado.js';
import { ic } from './iconos.js';

// Estado visible de un lugar: edificio, subdividido, con objetos o libre.
export function estadoDe(l) {
  const d = ctx.dep;
  if (d.prof(l) === 0) return { cls: 'sub', chip: 'Edificio' };
  const hijos = d.hijos(l.id).length;
  if (hijos) return { cls: 'sub', chip: `${hijos} dentro` };
  const n = d.objetosDe(l.id).length;
  if (n) return { cls: 'obj', chip: n === 1 ? '1 objeto' : `${n} objetos` };
  return { cls: 'libre', chip: 'Libre' };
}

// Tarjeta cuadrada: vista de configuración.
export function tarjetaLugar(l) {
  const d = ctx.dep;
  const st = estadoDe(l), nv = d.nivelDe(l);
  const n = d.hijos(l.id).length;
  const objs = d.objetosDe(l.id).length;
  return `<article class="tarjeta ${st.cls}">
    <span class="nivel">${esc(nv.nombre)}</span>
    <span class="codigo">${esc(l.codigo)}</span>
    ${l.nombre ? `<span class="nombre">${esc(l.nombre)}</span>` : ''}
    <span class="chip ${st.cls}">${esc(st.chip)}</span>
    <div class="pie">
      <button class="btn sm sec" data-act="nodo" data-id="${l.id}">Abrir</button>
      <button class="btn sm txt" data-act="editarAbrir" data-id="${l.id}">Editar</button>
      <button class="btn sm txt" data-act="clonarAbrir" data-id="${l.id}">Clonar</button>
      <button class="btn sm peligro" data-act="borrarLugar" data-id="${l.id}">Borrar</button>
    </div>
  </article>`;
}

// Bloque del plano: cuadrado, siempre del mismo tamaño.
export function bloquePlano(l, estilo = '', atributos = '') {
  const d = ctx.dep;
  const st = estadoDe(l), nv = d.nivelDe(l);
  const objs = d.objetosDe(l.id).length;
  const hijos = d.hijos(l.id).length;
  return `<div class="bloque ${st.cls}" ${atributos} style="${estilo}">
    <span class="nivel">${esc(nv.nombre)}</span>
    <span class="codigo">${esc(l.codigo)}</span>
    ${l.nombre ? `<span class="nombre">${esc(l.nombre)}</span>` : ''}
    <div class="pie">
      <span class="chip ${st.cls}">${esc(st.chip)}</span>
      ${objs ? `<button class="btn sm sec" data-act="verObjetos" data-id="${l.id}">Objetos (${objs})</button>` : ''}
    </div>
    <div class="acciones-fila">
      ${(hijos || d.nivelParaHijo(l.id).def) ? `<button class="btn sm sec" data-act="planoIr" data-id="${l.id}">Entrar</button>` : ''}
      <button class="btn sm txt" data-act="editarAbrir" data-id="${l.id}">Editar</button>
      <button class="btn sm peligro" data-act="borrarLugar" data-id="${l.id}">Borrar</button>
    </div>
  </div>`;
}

export function migasHTML() {
  const d = ctx.dep;
  const raiz = { estructura: 'Edificios', plano: 'Plano', objetos: 'Objetos' }[S.vista];
  if (S.vista === 'objetos') return `<b>${raiz}</b>`;
  const nodo = S.nodo ? d.porId(S.nodo) : null;
  const ruta = nodo ? d.ruta(nodo) : [];
  const accion = S.vista === 'plano' ? 'planoIr' : 'nodo';
  const partes = [`<a data-act="${accion}" data-id="">${raiz}</a>`,
    ...ruta.map((l, i) => i === ruta.length - 1
      ? `<b>${esc(l.codigo)}</b>`
      : `<a data-act="${accion}" data-id="${l.id}">${esc(l.codigo)}</a>`)];
  return partes.join('<span class="sep">›</span>');
}

export function accionPrincipal() {
  if (S.vista === 'objetos') return `<button class="btn" data-act="abrirNuevoObjeto">${ic('mas', 14)} Nuevo objeto</button>`;
  const { def } = ctx.dep.nivelParaHijo(S.nodo);
  if (!def) return '';
  const texto = S.nodo ? `Agregar ${def.nombre.toLowerCase()}` : 'Nuevo edificio';
  return `<button class="btn" data-act="abrirCrear">${ic('mas', 14)} ${texto}</button>`;
}

export function leyenda() {
  return `<div class="leyenda">
    <span class="chip libre">Libre</span>
    <span class="chip obj">Con objetos</span>
    <span class="chip sub">Con subdivisiones</span>
  </div>`;
}
