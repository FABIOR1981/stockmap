// Piezas que se repiten: tarjetas, bloques del plano, migas y acción principal.

import { ctx, S, esc, plural } from './estado.js';
import { ic } from './iconos.js';

// Estado visible de un lugar: edificio, subdividido, con objetos o libre.
// Hay algo en el lugar o en cualquier nivel de adentro.
const tieneAlgo = (d, l) => d.objetosDe(l.id).length > 0 || d.descendientes(l).some(x => d.objetosDe(x.id).length > 0);

export function estadoDe(l) {
  const d = ctx.dep;
  const hijos = d.hijos(l.id);
  // Lleno: todos sus lugares del último nivel tienen objetos. Un solo hueco libre ya no es lleno.
  const huecos = d.descendientes(l).filter(x => d.hijos(x.id).length === 0);
  const lleno = huecos.length > 0 && huecos.every(h => d.objetosDe(h.id).length > 0);
  const ocupado = tieneAlgo(d, l);
  if (d.prof(l) === 0) return { cls: lleno ? 'lleno' : ocupado ? 'obj' : 'libre', chip: 'Edificio' };
  if (hijos.length) {
    // Cuenta con el nombre del nivel de adentro: "10 estanterías", "1 estante".
    const def = d.nivelParaHijo(l.id).def;
    const nombre = def ? def.nombre.toLowerCase() : 'dentro';
    const n = hijos.length;
    const chip = def ? `${n} ${n === 1 ? nombre : plural(nombre)}` : `${n} dentro`;
    return { cls: lleno ? 'lleno' : ocupado ? 'obj' : 'libre', chip };
  }
  const n = d.objetosDe(l.id).length;
  if (n) return { cls: 'obj', chip: n === 1 ? '1 objeto' : `${n} objetos` };
  return { cls: 'libre', chip: 'Libre' };
}

// Bloque del plano: cuadrado, siempre del mismo tamaño.
export function bloquePlano(l, estilo = '', atributos = '') {
  const d = ctx.dep;
  const st = estadoDe(l), nv = d.nivelDe(l);
  // El chip de un edificio va en gris: el azul ya significa 'con objetos'.
  const claseChip = d.prof(l) === 0 ? 'sub' : st.cls;
  const objs = d.objetosDe(l.id).length;
  const hijos = d.hijos(l.id).length;
  const vacioAdentro = [l, ...d.descendientes(l)].every(x => d.objetosDe(x.id).length === 0);
  // Un clic selecciona el lugar; dos clics seguidos lo abren (lo decide app.js). El arrastre no selecciona: lo filtra plano.js.
  const clic = `data-act="planoSeleccionar" data-id="${l.id}" role="button" tabindex="0"`;
  return `<div class="bloque ${st.cls}${S.elegido === l.id ? ' elegido' : ''}" ${atributos} ${clic} style="${estilo}">
    <span class="nivel">${esc(nv.nombre)}</span>
    <div class="cab">
      <span class="codigo">${esc(l.codigo)}</span>
      <span class="acc">
        <button class="btn sm txt lapiz" data-act="editarAbrir" data-id="${l.id}" aria-label="Editar ${esc(l.codigo)}" title="Editar">${ic('lapiz', 14)}</button>
        <button class="btn sm txt" data-act="etiquetaLugar" data-id="${l.id}" aria-label="Imprimir etiqueta de ${esc(l.codigo)}" title="Imprimir etiqueta">${ic('qr', 14)}</button>
        ${vacioAdentro ? `<button class="btn sm txt papelera" data-act="borrarLugar" data-id="${l.id}" aria-label="Borrar ${esc(l.codigo)}" title="Borrar">${ic('papelera', 14)}</button>` : ''}
      </span>
    </div>
    ${l.nombre ? `<span class="nombre">${esc(l.nombre)}</span>` : ''}
    <div class="pie">
      ${objs && !hijos
        ? `<button class="chip ${claseChip} chip-btn" data-act="verObjetos" data-id="${l.id}" title="Ver objetos">${esc(st.chip)}</button>`
        : `<span class="chip ${claseChip}">${esc(st.chip)}</span>`}
    </div>
  </div>`;
}

const NOMBRES_VISTA = { plano: 'Asignación', codigo: 'Por código', mover: 'Mover', recorrido3d: 'Recorrido', stock: 'Stock', movimientos: 'Movimientos', accesos: 'Accesos' };

export function migasHTML() {
  const d = ctx.dep;
  // Las vistas de primer nivel ya se nombran en el título de la página: no se repite en la barra.
  if (!['plano', 'mover'].includes(S.vista)) return '';
  const raiz = NOMBRES_VISTA[S.vista];
  const nodo = S.nodo ? d.porId(S.nodo) : null;
  const ruta = nodo ? d.ruta(nodo) : [];
  const accion = 'planoIr';
  const partes = [`<a data-act="${accion}" data-id="">${raiz}</a>`,
    ...ruta.map((l, i) => i === ruta.length - 1
      ? `<b>${esc(l.codigo)}</b>`
      : `<a data-act="${accion}" data-id="${l.id}">${esc(l.codigo)}</a>`)];
  return partes.join('<span class="sep">›</span>');
}

// Dentro de un edificio o un lugar, un botón lleva de vuelta al nivel de arriba (sin tener que recargar la página).
export function accionPrincipal() {
  const base = accionPrincipalBase();
  if (!ctx.dep.eid || !['plano', 'mover'].includes(S.vista) || !S.nodo) return base;
  return `<button class="btn sec" data-act="planoIr" data-id="">Volver al inicio</button>${base}`;
}

function accionPrincipalBase() {
  if (!ctx.dep.eid) return '';
  if (S.vista === 'stock') return `<button class="btn" data-act="abrirNuevoObjeto">${ic('mas', 14)} Nuevo objeto</button>`;
  if (!['plano', 'mover'].includes(S.vista)) return '';
  const nodo = S.nodo ? ctx.dep.porId(S.nodo) : null;
  // Los niveles de un edificio se editan en una ventana.
  const niveles = nodo && ctx.dep.prof(nodo) === 0 ? `<button class="btn sec" data-act="abrirNiveles">Niveles</button>` : '';
  const { def } = ctx.dep.nivelParaHijo(S.nodo);
  if (!def) return niveles;
  const texto = S.nodo ? `Agregar ${def.nombre.toLowerCase()}` : 'Agregar edificio';
  const hijos = ctx.dep.hijos(S.nodo || null).length;
  const clonar = hijos ? `<button class="btn sec" data-act="clonarNivelAbrir">Clonar existente</button>` : '';
  return `${niveles}<button class="btn" data-act="abrirCrear">${ic('mas', 14)} ${texto}</button>${clonar}`;
}

export function leyenda() {
  return `<div class="leyenda">
    <span class="muestra libre">Libre</span>
    <span class="muestra obj">Con objetos</span>
    <span class="muestra lleno">Lleno</span>
  </div>`;
}
