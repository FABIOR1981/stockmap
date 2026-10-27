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
// La tarjeta entera abre el lugar. Borrar solo aparece si el lugar y todo lo que tiene adentro están vacíos.
export function tarjetaLugar(l) {
  const d = ctx.dep;
  const st = estadoDe(l), nv = d.nivelDe(l);
  const vacioAdentro = [l, ...d.descendientes(l)].every(x => d.objetosDe(x.id).length === 0);
  return `<article class="tarjeta ${st.cls}" data-act="nodo" data-id="${l.id}" role="button" tabindex="0">
    <span class="nivel">${esc(nv.nombre)}</span>
    <div class="cab">
      <span class="codigo">${esc(l.codigo)}</span>
      <span class="acc">
        <button class="btn sm txt lapiz" data-act="editarAbrir" data-id="${l.id}" aria-label="Editar ${esc(l.codigo)}" title="Editar">${ic('lapiz', 14)}</button>
        ${vacioAdentro ? `<button class="btn sm txt papelera" data-act="borrarLugar" data-id="${l.id}" aria-label="Borrar ${esc(l.codigo)}" title="Borrar">${ic('papelera', 14)}</button>` : ''}
      </span>
    </div>
    ${l.nombre ? `<span class="nombre">${esc(l.nombre)}</span>` : ''}
    <span class="chip ${st.cls}">${esc(st.chip)}</span>
  </article>`;
}

// Bloque del plano: cuadrado, siempre del mismo tamaño.
export function bloquePlano(l, estilo = '', atributos = '') {
  const d = ctx.dep;
  const st = estadoDe(l), nv = d.nivelDe(l);
  const objs = d.objetosDe(l.id).length;
  const hijos = d.hijos(l.id).length;
  const vacioAdentro = [l, ...d.descendientes(l)].every(x => d.objetosDe(x.id).length === 0);
  const entrar = hijos || d.nivelParaHijo(l.id).def;
  // Clic en el bloque entra al lugar (el arrastre no entra: lo filtra plano.js).
  const clic = entrar ? `data-act="planoIr" data-id="${l.id}" role="button" tabindex="0"` : '';
  return `<div class="bloque ${st.cls}" ${atributos} ${clic} style="${estilo}">
    <span class="nivel">${esc(nv.nombre)}</span>
    <div class="cab">
      <span class="codigo">${esc(l.codigo)}</span>
      <span class="acc">
        <button class="btn sm txt lapiz" data-act="editarAbrir" data-id="${l.id}" aria-label="Editar ${esc(l.codigo)}" title="Editar">${ic('lapiz', 14)}</button>
        ${vacioAdentro ? `<button class="btn sm txt papelera" data-act="borrarLugar" data-id="${l.id}" aria-label="Borrar ${esc(l.codigo)}" title="Borrar">${ic('papelera', 14)}</button>` : ''}
      </span>
    </div>
    ${l.nombre ? `<span class="nombre">${esc(l.nombre)}</span>` : ''}
    <div class="pie">
      <span class="chip ${st.cls}">${esc(st.chip)}</span>
      ${objs ? `<button class="btn sm sec" data-act="verObjetos" data-id="${l.id}">Objetos (${objs})</button>` : ''}
    </div>
    <div class="acciones-fila">
      ${entrar ? `<button class="btn sm sec" data-act="planoIr" data-id="${l.id}">Entrar</button>` : ''}
    </div>
  </div>`;
}

const NOMBRES_VISTA = { estructura: 'Edificios', plano: 'Plano', stock: 'Stock', movimientos: 'Movimientos', accesos: 'Accesos' };

export function migasHTML() {
  const d = ctx.dep;
  if (!['estructura', 'plano'].includes(S.vista)) return `<b>${NOMBRES_VISTA[S.vista] || ''}</b>`;
  const raiz = NOMBRES_VISTA[S.vista];
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
  if (!ctx.dep.eid) return '';
  if (S.vista === 'stock') return `<button class="btn" data-act="abrirNuevoObjeto">${ic('mas', 14)} Nuevo objeto</button>`;
  if (!['estructura', 'plano'].includes(S.vista)) return '';
  const { def } = ctx.dep.nivelParaHijo(S.nodo);
  if (!def) return '';
  const texto = S.nodo ? `Agregar ${def.nombre.toLowerCase()}` : 'Agregar edificio';
  const hijos = ctx.dep.hijos(S.nodo || null).length;
  const clonar = hijos ? `<button class="btn sec" data-act="clonarNivelAbrir">Clonar existente</button>` : '';
  return `<button class="btn" data-act="abrirCrear">${ic('mas', 14)} ${texto}</button>${clonar}`;
}

export function leyenda() {
  return `<div class="leyenda">
    <span class="muestra libre">Libre</span>
    <span class="muestra obj">Con objetos</span>
  </div>`;
}
