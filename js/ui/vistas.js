// Vistas de la interfaz. Cada una devuelve HTML a partir del modelo y del estado.

import { ctx, S, esc, campo, msgHTML } from './estado.js';
import { FORMATOS } from '../core/formatos.js';
import { ilustracion } from './iconos.js';
import { tarjetaLugar, bloquePlano, leyenda } from './componentes.js';
import { posDe } from './plano.js';

// ---------- Edificios (raíz de la vista Edificios) ----------
export function vistaEdificios() {
  const edificios = ctx.dep.hijos(null);
  if (!edificios.length) {
    return `<h1>Edificios</h1>
      <p class="sub">Cada edificio define sus propios niveles.</p>
      <div class="vacio"><span class="ilu">${ilustracion()}</span>
        <p>Todavía no hay edificios</p>
        <small>Creá el primero para empezar a definir sus niveles y su contenido.</small>
        <button class="btn" data-act="abrirCrear">+ Nuevo edificio</button></div>
      ${msgHTML('borrar')}`;
  }
  return `<h1>Edificios</h1>
    <p class="sub">${edificios.length} ${edificios.length === 1 ? 'edificio' : 'edificios'} en el depósito.</p>
    <div class="grid">${edificios.map(tarjetaLugar).join('')}</div>
    ${msgHTML('borrar')}`;
}

// ---------- Niveles de un edificio ----------
function editorNiveles(ed) {
  if (!ed.niveles.length) {
    return `<section class="panel">
      <h2>Definí los niveles de este edificio</h2>
      <p class="ayuda">Cada nivel es un tipo de lugar que va dentro del edificio, en orden. Por ejemplo: estantería › estante › división.</p>
      <div class="acciones-fila">
        <button class="btn" data-act="nivelesTipicos">Usar niveles típicos</button>
        <button class="btn sec" data-act="agregarNivel">Definir desde cero</button>
      </div>
      ${msgHTML('niveles')}
    </section>`;
  }
  const filas = ed.niveles.map((n, i) => `
    <div class="nivel-fila">
      <span class="nivel-num">${i + 1}</span>
      ${campo('Nombre', `<input data-nivel="${i}" data-campo="nombre" value="${esc(n.nombre)}" size="14">`)}
      ${campo('Formato del código', `<select data-nivel="${i}" data-campo="formato">
        ${Object.keys(FORMATOS).map(k => `<option value="${k}" ${n.formato === k ? 'selected' : ''}>${FORMATOS[k].txt}</option>`).join('')}
      </select>`)}
      <label class="campo"><span>&nbsp;</span><span><input type="checkbox" data-nivel="${i}" data-campo="nombreOpcional" ${n.nombreOpcional ? 'checked' : ''}> Nombre opcional</span></label>
      ${i === ed.niveles.length - 1 ? `<button class="btn x" data-act="quitarNivel" aria-label="Quitar el último nivel">×</button>` : ''}
    </div>`).join('');
  return `<section class="panel">
    <h2>Niveles del edificio</h2>
    <p class="ayuda">Se editan acá. Un cambio de nombre se aplica de inmediato.</p>
    <div class="lista-niveles">${filas}</div>
    <div class="acciones-fila"><button class="btn sm sec" data-act="agregarNivel">+ Agregar nivel</button></div>
    ${msgHTML('niveles')}
  </section>`;
}

// ---------- Contenido de un lugar (vista Edificios, al entrar) ----------
export function vistaEstructura() {
  const d = ctx.dep;
  const nodo = d.porId(S.nodo);
  if (!nodo) return vistaEdificios();
  const ed = d.edificioDe(nodo);
  const esEdificio = d.prof(nodo) === 0;
  const { def } = d.nivelParaHijo(nodo.id);
  const kids = d.hijos(nodo.id);

  const cabecera = `<h1>${esc(def ? def.nombre + 's' : 'Contenido')} de ${esc(d.dir(nodo))}</h1>
    <p class="sub">${esEdificio ? 'Definí los niveles y después cargá lo que hay adentro.'
      : `Niveles del edificio ${esc(ed.codigo)}: ${esc(ed.niveles.map(n => n.nombre).join(' › ') || '—')}.`}</p>`;

  const niveles = esEdificio ? editorNiveles(nodo) : '';
  const contenido = !def
    ? `<div class="aviso">Primero definí los niveles de este edificio, más arriba.</div>`
    : kids.length
      ? `<section class="panel"><h2>Contenido</h2><p class="ayuda">${kids.length} ${kids.length === 1 ? 'elemento' : 'elementos'}. Tocá Abrir para entrar.</p><div class="grid">${kids.map(tarjetaLugar).join('')}</div></section>`
      : `<div class="vacio"><span class="ilu">${ilustracion()}</span><p>Todavía no hay ${esc(def.nombre.toLowerCase())}s aquí</p>
          <small>Agregá el primero y empezá a armar el contenido.</small>
          <button class="btn" data-act="abrirCrear">+ Agregar ${esc(def.nombre.toLowerCase())}</button></div>`;

  return `${cabecera}${niveles}${contenido}${msgHTML('borrar')}`;
}

// ---------- Plano ----------
export function vistaPlano() {
  const d = ctx.dep;
  const foco = S.nodo ? d.porId(S.nodo) : null;
  const { def } = d.nivelParaHijo(S.nodo);
  if (!foco) {
    const eds = d.hijos(null);
    const bloques = eds.map(e => {
      const p = posDe(e);
      return bloquePlano(e, `left:${p.x}px;top:${p.y}px;`, `data-drag="${e.id}"`);
    }).join('');
    return `<h1>Plano</h1>
      <p class="sub">Un nivel a la vez. Entrá a un edificio para ver lo que tiene adentro. Arrastrá los edificios para acomodarlos.</p>
      <div class="plano" data-raiz>${eds.length ? bloques : '<p class="vacio" style="margin:20px;border:0">Todavía no hay edificios.</p>'}</div>
      ${leyenda()}${msgHTML('borrar')}`;
  }
  const kids = d.hijos(foco.id);
  return `<h1>${esc(d.nivelDe(foco).nombre)} ${esc(foco.codigo)}</h1>
    <p class="sub">${def ? `Dentro de ${esc(d.dir(foco))}: ${esc(def.nombre.toLowerCase())}s.` : 'No tiene niveles para contener lugares.'}</p>
    <div class="plano">
      <div class="plano-flow">${kids.length
        ? kids.map(l => bloquePlano(l)).join('')
        : '<p class="vacio" style="grid-column:1/-1;border:0">Este lugar está vacío.</p>'}</div>
    </div>
    ${leyenda()}${msgHTML('borrar')}`;
}

// ---------- Objetos ----------
export function vistaObjetos() {
  const d = ctx.dep;
  const q = S.q.trim().toLowerCase();
  const lugaresOpciones = d.lugares.filter(l => d.esHoja(l))
    .map(l => `<option value="${l.id}">${esc(d.dir(l))}</option>`).join('');

  const buscador = `<div class="panel">
    <input class="buscar" data-in="q" value="${esc(S.q)}" placeholder="Buscar por código, código propio o descripción" aria-label="Buscar objeto">
    ${q ? resultadosBusqueda(q) : ''}
  </div>`;

  if (!d.objetos.length) {
    return `<h1>Objetos</h1><p class="sub">Todo lo que se guarda en el depósito.</p>
      ${buscador}
      <div class="vacio" style="margin-top:16px"><p>Todavía no hay objetos.</p>
        <button class="btn" data-act="abrirNuevoObjeto">+ Nuevo objeto</button></div>
      ${msgHTML('obj')}`;
  }

  const filas = d.objetos.map(o => {
    const ub = d.ubicacionesDe(o.id);
    const ubicaciones = ub.length
      ? ub.map(l => `<span class="ubic">${esc(d.dir(l))}<button class="btn x" data-act="liberarPar" data-oid="${o.id}" data-lid="${l.id}" aria-label="Sacar de ${esc(d.dir(l))}">×</button></span>`).join('')
      : `<span class="dim">Sin ubicación</span>`;
    return `<tr>
      <td><strong>${esc(o.codigo_interno)}</strong></td>
      <td>${esc(o.codigo_propio) || '<span class="dim">—</span>'}</td>
      <td>${esc(o.descripcion) || '<span class="dim">—</span>'}</td>
      <td>${ubicaciones}</td>
      <td><div class="acciones-fila">
        <select data-f="lugarPara" data-oid="${o.id}" aria-label="Lugar para ${esc(o.codigo_interno)}">
          <option value="">Elegir lugar…</option>${lugaresOpciones}
        </select>
        <button class="btn sm sec" data-act="asignarObj" data-oid="${o.id}">Agregar</button>
        <button class="btn sm peligro" data-act="borrarObjeto" data-oid="${o.id}">Borrar</button>
      </div></td>
    </tr>`;
  }).join('');

  return `<h1>Objetos</h1>
    <p class="sub">${d.objetos.length} ${d.objetos.length === 1 ? 'objeto' : 'objetos'} registrados.</p>
    ${buscador}
    <section class="panel" style="margin-top:16px;padding:0;overflow:auto">
      <table>
        <thead><tr><th>Interno</th><th>Propio</th><th>Descripción</th><th>Ubicación</th><th>Acciones</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </section>
    ${msgHTML('obj')}`;
}

export function resultadosBusqueda(q) {
  const d = ctx.dep;
  const res = d.objetos.filter(o => [o.codigo_interno, o.codigo_propio, o.descripcion].some(x => x && x.toLowerCase().includes(q)));
  if (!res.length) return `<p class="vacio" style="margin-top:12px;border:0;padding:12px">No hay objetos que coincidan.</p>`;
  return `<div class="dlg-lista" style="margin-top:12px">${res.map(o => {
    const ub = d.ubicacionesDe(o.id);
    return `<div class="r"><span><strong>${esc(o.codigo_interno)}</strong>${o.codigo_propio ? ' · ' + esc(o.codigo_propio) : ''}${o.descripcion ? ' — ' + esc(o.descripcion) : ''}</span>
      <span class="dim" style="font-size:13px">${ub.length ? ub.map(l => esc(d.dir(l))).join(', ') : 'Sin ubicación'}</span></div>`;
  }).join('')}</div>`;
}

// ---------- Resultado de las pruebas de reglas ----------
export function bloquePruebas() {
  if (!S.pruebas) return '';
  const pasan = S.pruebas.filter(p => p.ok).length;
  const lista = S.pruebas.map(p => `<li class="${p.ok ? 'pasa' : 'falla'}">${p.ok ? '✔' : '✘'} ${esc(p.nombre)}</li>`).join('');
  return `<section class="panel" style="margin-bottom:20px">
    <h2>Pruebas de reglas: ${pasan} de ${S.pruebas.length} pasan</h2>
    <ul class="pruebas">${lista}</ul>
    <div class="acciones-fila" style="margin-top:12px"><button class="btn sm sec" data-act="cerrarPruebas">Cerrar</button></div>
  </section>`;
}

// ---------- Ventanas (modales) ----------
// Devuelve { titulo, cuerpo, pie } o null si no hay ventana que mostrar.
export function ventana() {
  const d = ctx.dep;
  const nodo = S.nodo ? d.porId(S.nodo) : null;
  switch (S.modal) {
    case 'crear': {
      const { def } = d.nivelParaHijo(S.nodo);
      if (!def) return { titulo: 'Crear lugar', cuerpo: `<p class="aviso">Este edificio no tiene niveles. Definilos primero.</p>`, pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>` };
      const titulo = nodo ? `Nuevo ${def.nombre.toLowerCase()} en ${d.dir(nodo)}` : 'Nuevo edificio';
      return {
        titulo,
        cuerpo: `<div class="form">
            ${campo('Código', `<input data-f="codigo" value="${esc(S.f.codigo)}" placeholder="${FORMATOS[def.formato].ej}">`)}
            ${def.nombreOpcional ? campo('Nombre (opcional)', `<input data-f="nombre" value="${esc(S.f.nombre)}">`) : ''}
          </div>
          <p class="dim" style="font-size:13px;margin:8px 0 0">Formato: ${FORMATOS[def.formato].txt}.</p>
          ${msgHTML('crear')}
          <hr class="sep-linea">
          <div class="etiqueta" style="margin-bottom:10px">Varios a la vez</div>
          <div class="form">
            ${campo('Desde', `<input data-f="desde" value="${esc(S.f.desde)}" placeholder="${FORMATOS[def.formato].ej}">`)}
            ${campo('Hasta', `<input data-f="hasta" value="${esc(S.f.hasta)}" placeholder="${FORMATOS[def.formato].ej}">`)}
          </div>
          ${msgHTML('lote')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>
              <button class="btn sec" data-act="lote">Crear varios</button>
              <button class="btn" data-act="crear">Crear</button>`
      };
    }
    case 'editar': {
      const l = S.editar ? d.porId(S.editar) : null;
      if (!l) return null;
      const def = d.nivelDe(l);
      return {
        titulo: `Editar ${d.dir(l)}`,
        cuerpo: `<div class="form">
            ${campo('Código', `<input data-f="edCodigo" value="${esc(S.f.edCodigo)}">`)}
            ${def.nombreOpcional ? campo('Nombre (opcional)', `<input data-f="edNombre" value="${esc(S.f.edNombre)}">`) : ''}
          </div>
          <p class="dim" style="font-size:13px;margin:12px 0 0">El nivel no cambia. Los objetos que tiene el lugar se mantienen.</p>
          ${msgHTML('editar')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>
              <button class="btn" data-act="editarGuardar">Guardar</button>`
      };
    }
    case 'clonar': {
      const src = S.clon ? d.porId(S.clon) : null;
      if (!src) return null;
      return {
        titulo: `Clonar ${d.dir(src)}`,
        cuerpo: `<p class="dim" style="margin:0 0 14px">Se copian los niveles y los lugares de adentro. Los objetos no se copian. Los códigos nuevos se asignan solos.</p>
          <div class="form">${campo('Cantidad de copias', `<input data-f="cantClon" value="${esc(S.f.cantClon)}" size="5">`)}</div>
          ${msgHTML('clon')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>
              <button class="btn" data-act="clonarEjecutar">Clonar</button>`
      };
    }
    case 'objetos': {
      const l = S.verObj ? d.porId(S.verObj) : null;
      if (!l) return null;
      const objs = d.objetosDe(l.id);
      const fuera = d.objetos.filter(o => !objs.some(x => x.id === o.id));
      const filas = objs.length
        ? `<div class="dlg-lista">${objs.map(o => `<div class="r">
            <span><strong>${esc(o.codigo_interno)}</strong>${o.codigo_propio ? ' · ' + esc(o.codigo_propio) : ''}${o.descripcion ? '<br><span class="dim" style="font-size:13px">' + esc(o.descripcion) + '</span>' : ''}</span>
            <button class="btn sm sec" data-act="liberarPar" data-oid="${o.id}" data-lid="${l.id}">Sacar</button>
          </div>`).join('')}</div>`
        : `<p class="vacio" style="border:0;padding:12px">Este lugar no tiene objetos.</p>`;
      const agregar = fuera.length
        ? `<div class="form" style="margin-top:16px">
            ${campo('Agregar un objeto', `<select data-f="objAqui" aria-label="Objeto a agregar"><option value="">Elegir…</option>${fuera.map(o => `<option value="${o.id}">${esc(o.codigo_interno)}${o.codigo_propio ? ' · ' + esc(o.codigo_propio) : ''}</option>`).join('')}</select>`)}
            <button class="btn sm" data-act="asignarAqui" data-lid="${l.id}">Agregar</button>
          </div>`
        : `<p class="dim" style="font-size:13px;margin:16px 0 0">Todos los objetos ya están en este lugar.</p>`;
      return {
        titulo: `Objetos en ${d.dir(l)} (${objs.length})`,
        cuerpo: `${filas}${agregar}${msgHTML('objetos')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>`
      };
    }
    case 'nuevoObjeto':
      return {
        titulo: 'Nuevo objeto',
        cuerpo: `<div class="form">
            ${campo('Código propio (opcional)', `<input data-f="codigoP" value="${esc(S.f.codigoP)}">`)}
            ${campo('Descripción', `<input data-f="desc" value="${esc(S.f.desc)}" size="30">`)}
          </div>
          <p class="dim" style="font-size:13px;margin:12px 0 0">El código interno se asigna solo. Después lo podés ubicar en un lugar.</p>
          ${msgHTML('obj')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cancelar</button>
              <button class="btn" data-act="crearObjeto">Crear objeto</button>`
      };
  }
  return null;
}
