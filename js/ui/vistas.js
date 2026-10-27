// Vistas de la interfaz. Cada una devuelve HTML a partir del modelo y del estado.

import { ctx, S, esc, campo, msgHTML, plural } from './estado.js';
import { FORMATOS } from '../core/formatos.js';
import { ilustracion } from './iconos.js';
import { tarjetaLugar, bloquePlano, leyenda, estadoDe } from './componentes.js';
import { posDe, tamanoPlano, sonAledanos } from './plano.js';

const ROLES = { admin: 'Admin', editor: 'Editor', lector: 'Lector' };
const TIPOS = { unidad: 'Unidad', producto: 'Producto' };
const fecha = iso => new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' });

// Sin cliente elegido, el depósito no muestra nada: se lo indica.
function sinCliente() {
  return `<div class="vacio"><span class="ilu">${ilustracion()}</span>
    <p>Elegí un cliente para ver su depósito</p>
    <small>Si todavía no hay clientes, creá uno desde Accesos.</small>
    <button class="btn" data-act="vista" data-v="accesos">Ir a Accesos</button></div>`;
}

// ---------- Edificios ----------
export function vistaEdificios() {
  const edificios = ctx.dep.hijos(null);
  if (!ctx.dep.eid) return `<h1>Edificios</h1>${sinCliente()}`;
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
  // Ya armado, el edificio casi no cambia: se muestra un resumen y el editor se abre a pedido.
  if (!S.editarNiveles) {
    return `<section class="panel niveles-resumen">
      <div class="cab-niveles"><div><h2>Niveles del edificio</h2>
        <p class="ayuda">${esc(ed.niveles.map(n => n.nombre).join(' › '))}</p></div>
        <button class="btn sm sec" data-act="toggleNiveles">Cambiar niveles</button></div>
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
    <div class="acciones-fila"><button class="btn sm sec" data-act="agregarNivel">+ Agregar nivel</button>
      <button class="btn sm" data-act="toggleNiveles">Listo</button></div>
    ${msgHTML('niveles')}
  </section>`;
}

// ---------- Contenido de un lugar ----------
export function vistaEstructura() {
  const d = ctx.dep;
  const nodo = d.porId(S.nodo);
  if (!nodo) return vistaEdificios();
  const ed = d.edificioDe(nodo);
  const esEdificio = d.prof(nodo) === 0;
  const { def } = d.nivelParaHijo(nodo.id);
  const kids = d.hijos(nodo.id);

  const cabecera = `<h1>${esc(def ? plural(def.nombre) : 'Contenido')} de ${esc(d.dir(nodo))}</h1>
    <p class="sub">${esEdificio ? 'Definí los niveles y después cargá lo que hay adentro.'
      : `Niveles del edificio ${esc(ed.codigo)}: ${esc(ed.niveles.map(n => n.nombre).join(' › ') || '—')}.`}</p>`;

  const niveles = esEdificio ? editorNiveles(nodo) : '';
  const objs = d.objetosDe(nodo.id).length;
  const contenido = !def
    ? `<div class="aviso">Este es el último nivel del edificio: no tiene lugares adentro.</div>
      <section class="panel"><h2>Objetos</h2>
        <p class="ayuda">${objs ? `${objs} ${objs === 1 ? 'objeto' : 'objetos'} en este lugar.` : 'Todavía no hay objetos en este lugar.'}</p>
        <button class="btn sec" data-act="verObjetos" data-id="${nodo.id}">Ver objetos</button></section>`
    : kids.length
      ? `<section class="panel"><h2>Contenido</h2><p class="ayuda">${kids.length} ${kids.length === 1 ? 'elemento' : 'elementos'}. Tocá Abrir para entrar.</p><div class="grid">${kids.map(tarjetaLugar).join('')}</div></section>`
      : `<div class="vacio"><span class="ilu">${ilustracion()}</span><p>Todavía no hay ${esc(plural(def.nombre.toLowerCase()))} aquí</p>
          <small>Agregá el primero y empezá a armar el contenido.</small>
          <button class="btn" data-act="abrirCrear">+ Agregar ${esc(def.nombre.toLowerCase())}</button></div>`;

  return `${cabecera}${niveles}${contenido}${msgHTML('borrar')}`;
}

// ---------- Plano ----------
export function vistaPlano() {
  const d = ctx.dep;
  if (!d.eid) return `<h1>Plano</h1>${sinCliente()}`;
  const foco = S.nodo ? d.porId(S.nodo) : null;
  const { def } = d.nivelParaHijo(S.nodo);
  // Un lienzo con posición libre para cada bloque (edificios, o lo que hay dentro de un lugar).
  const lienzo = lugares => {
    const { ancho, alto } = tamanoPlano(lugares);
    return `<div class="plano-lienzo" style="width:${ancho}px;height:${alto}px">${lugares.map((l, i) => {
      const p = posDe(l, i);
      return bloquePlano(l, `left:${p.x}px;top:${p.y}px;`, `data-drag="${l.id}"`);
    }).join('')}</div>`;
  };
  if (!foco) {
    const eds = d.hijos(null);
    const { ancho, alto } = tamanoPlano([...eds, {}]);
    const bloques = eds.map((e, i) => {
      const p = posDe(e, i);
      return bloquePlano(e, `left:${p.x}px;top:${p.y}px;`, `data-drag="${e.id}"`);
    }).join('');
    return `<h1>Plano</h1>
      <p class="sub">Un nivel a la vez. Entrá a un edificio para ver lo que tiene adentro. Arrastrá los edificios para acomodarlos.</p>
      ${eds.length ? '' : '<p class="vacio" style="margin:0 0 16px;border:0">Todavía no hay edificios.</p>'}
      <div class="plano" data-raiz><div class="plano-lienzo" style="width:${ancho}px;height:${alto}px">${bloques}${bloqueSalida(posDe({}, eds.length), false)}</div></div>
      ${leyenda()}${msgHTML('borrar')}`;
  }
  const kids = d.hijos(foco.id);
  return `<h1>${esc(d.nivelDe(foco).nombre)} ${esc(foco.codigo)}</h1>
    <p class="sub">${def ? `Dentro de ${esc(d.dir(foco))}: ${esc(plural(def.nombre.toLowerCase()))}. Arrastrá para acomodarlos.` : 'No tiene niveles para contener lugares.'}</p>
    ${kids.length ? `<div class="plano">${lienzo(kids)}</div>` : '<p class="vacio" style="border:0">Este lugar está vacío.</p>'}
    ${leyenda()}${msgHTML('borrar')}`;
}

// ---------- Stock (unidades y productos) ----------
export function vistaStock() {
  const d = ctx.dep;
  if (!d.eid) return `<h1>Stock</h1>${sinCliente()}`;
  const q = S.q.trim().toLowerCase();

  const buscador = `<div class="panel">
    <input class="buscar" data-in="q" value="${esc(S.q)}" placeholder="Buscar por código, código propio o descripción" aria-label="Buscar objeto">
    ${q ? resultadosBusqueda(q) : ''}
  </div>`;

  if (!d.objetos.length) {
    return `<h1>Stock</h1><p class="sub">Unidades que se identifican una por una y productos de los que hay varias.</p>
      ${buscador}
      <div class="vacio" style="margin-top:16px"><p>Todavía no hay objetos en este cliente.</p>
        <button class="btn" data-act="abrirNuevoObjeto">+ Nuevo objeto</button></div>
      ${msgHTML('obj')}`;
  }

  const filas = d.objetos.map(o => {
    const ub = d.ubicacionesDe(o.id);
    const total = d.existenciaTotal(o.id);
    const alerta = d.bajoMinimo(o) ? `<span class="chip falta">Bajo mínimo (${o.minimo})</span>` : '';
    const existencias = o.tipo === 'producto'
      ? `<strong>${total}</strong> ${alerta}`
      : `<span class="dim">${total ? 'Sí' : 'No'}</span>`;
    const ubicaciones = ub.length
      ? ub.map(l => {
          const c = d.cantidadEn(o.id, l.id);
          return `<span class="ubic">${esc(d.dir(l))}${o.tipo === 'producto' ? ` · <strong>${c}</strong>` : ''}
            </span>`;
        }).join('')
      : `<span class="dim">Sin ubicación</span>`;
    const cantidad = o.tipo === 'producto'
      ? `<input type="number" min="1" value="${esc(S.f.cantPara[o.id] || '1')}" data-cantoid="${o.id}" aria-label="Cantidad" style="width:72px;min-width:0">`
      : '';
    return `<tr>
      <td><strong>${esc(o.codigo_interno)}</strong></td>
      <td><span class="chip ${o.tipo === 'producto' ? 'obj' : 'sub'}">${TIPOS[o.tipo] || 'Unidad'}</span></td>
      <td>${esc(o.codigo_propio) || '<span class="dim">—</span>'}</td>
      <td>${esc(o.descripcion) || '<span class="dim">—</span>'}</td>
      <td>${existencias}</td>
      <td>${ubicaciones}</td>
      <td><div class="acciones-fila">
        ${cantidad}
        ${ub.length
          ? `<button class="btn sm sec" data-act="moverEnPlano" data-oid="${o.id}">Mover</button>`
          : `<button class="btn sm sec" data-act="elegirEnPlano" data-oid="${o.id}">Asignar en el plano</button>`}
        <button class="btn sm peligro" data-act="borrarObjeto" data-oid="${o.id}">Borrar</button>
      </div></td>
    </tr>`;
  }).join('');

  return `<h1>Stock</h1>
    <p class="sub">${d.objetos.length} ${d.objetos.length === 1 ? 'objeto' : 'objetos'} en ${esc(d.establecimientoActual()?.nombre || '')}.</p>
    ${buscador}
    <section class="panel" style="margin-top:16px;padding:0;overflow:auto">
      <table>
        <thead><tr><th>Interno</th><th>Tipo</th><th>Propio</th><th>Descripción</th><th>Existencias</th><th>Ubicación</th><th>Acciones</th></tr></thead>
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

// ---------- Movimientos ----------
export function vistaMovimientos() {
  const d = ctx.dep;
  if (!d.eid) return `<h1>Movimientos</h1>${sinCliente()}`;
  const lista = d.movimientosRecientes(200);
  if (!lista.length) {
    return `<h1>Movimientos</h1><p class="sub">Historial de entradas, salidas y transferencias.</p>
      <div class="vacio"><p>Todavía no hay movimientos.</p><small>Cada vez que se agrega, saca o mueve stock, queda registrado acá.</small></div>`;
  }
  const nombreObj = id => { const o = d.objetoPorId(id); return o ? `${o.codigo_interno}${o.codigo_propio ? ' · ' + o.codigo_propio : ''}` : '(borrado)'; };
  const lugar = id => id ? esc(d.porId(id) ? d.dir(d.porId(id)) : '—') : '<span class="dim">—</span>';
  const filas = lista.map(m => `<tr>
    <td>${fecha(m.fecha)}</td>
    <td><span class="chip ${m.tipo === 'salida' ? 'falta' : m.tipo === 'entrada' ? 'libre' : 'obj'}">${m.tipo}</span></td>
    <td>${esc(nombreObj(m.oid))}</td>
    <td>${lugar(m.desde)}</td>
    <td>${lugar(m.hasta)}</td>
    <td><strong>${m.cantidad}</strong></td>
    <td>${esc(d.nombreUsuario(m.uid))}</td>
    <td class="dim">${esc(m.nota)}</td>
  </tr>`).join('');
  return `<h1>Movimientos</h1>
    <p class="sub">${lista.length} ${lista.length === 1 ? 'movimiento' : 'movimientos'}, del más reciente al más antiguo.</p>
    <section class="panel" style="padding:0;overflow:auto">
      <table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Objeto</th><th>Desde</th><th>Hasta</th><th>Cant.</th><th>Usuario</th><th>Nota</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </section>`;
}

// ---------- Accesos: clientes, usuarios y roles ----------
export function vistaAccesos() {
  const d = ctx.dep;
  const u = d.usuarioActual();
  const esGeneral = !!u?.es_admin;
  const visibles = d.establecimientosVisibles();

  const clientes = `<section class="panel">
    <h2>Clientes</h2>
    <p class="ayuda">Cada cliente tiene su propio depósito. Solo ves los que te corresponden.</p>
    ${visibles.length ? `<div class="dlg-lista">${visibles.map(e => `<div class="r">
        <span><strong>${esc(e.nombre)}</strong>${e.id === d.eid ? ' <span class="chip libre">Abierto</span>' : ''}</span>
        <button class="btn sm sec" data-act="cliente" data-value="${e.id}">${e.id === d.eid ? 'Seguir aquí' : 'Abrir'}</button>
      </div>`).join('')}</div>` : '<p class="dim">No tenés acceso a ningún cliente todavía.</p>'}
    ${esGeneral ? `<div class="form" style="margin-top:16px">
      ${campo('Nuevo cliente', `<input data-f="nuevoCliente" value="${esc(S.f.nuevoCliente)}" placeholder="Nombre">`)}
      <button class="btn sm" data-act="crearCliente">Crear cliente</button>
    </div>` : ''}
    ${msgHTML('cliente')}
  </section>`;

  let acceso = '';
  if (d.eid) {
    const miembros = d.accesosDelCliente();
    const yaEsta = new Set(miembros.map(m => m.uid));
    const candidatos = d.usuarios.filter(x => !yaEsta.has(x.id));
    const filas = miembros.length ? miembros.map(m => `<div class="r">
        <span><strong>${esc(m.nombre)}</strong></span>
        <span class="acciones-fila">
          <select data-act="cambiarRol" data-uid="${m.uid}" aria-label="Rol de ${esc(m.nombre)}">
            ${Object.keys(ROLES).map(k => `<option value="${k}" ${m.rol === k ? 'selected' : ''}>${ROLES[k]}</option>`).join('')}
          </select>
          <button class="btn sm peligro" data-act="quitarAcceso" data-uid="${m.uid}">Quitar</button>
        </span></div>`).join('')
      : '<p class="dim">Nadie tiene acceso a este cliente todavía.</p>';
    acceso = `<section class="panel">
      <h2>Accesos a ${esc(d.establecimientoActual()?.nombre || '')}</h2>
      <p class="ayuda">Admin: gestiona accesos y datos. Editor: carga y mueve stock. Lector: solo mira.</p>
      <div class="dlg-lista">${filas}</div>
      ${candidatos.length ? `<div class="form" style="margin-top:16px">
        ${campo('Dar acceso a', `<select data-f="accUid"><option value="">Elegir…</option>${candidatos.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select>`)}
        ${campo('Rol', `<select data-f="accRol">${Object.keys(ROLES).map(k => `<option value="${k}" ${S.f.accRol === k ? 'selected' : ''}>${ROLES[k]}</option>`).join('')}</select>`)}
        <button class="btn sm" data-act="darAcceso">Dar acceso</button>
      </div>` : ''}
      ${msgHTML('acceso')}
    </section>`;
  }

  const usuarios = esGeneral ? `<section class="panel">
    <h2>Usuarios</h2>
    <p class="ayuda">Un usuario puede tener acceso a varios clientes. El administrador general ve todo.</p>
    <div class="dlg-lista">${d.usuarios.map(x => `<div class="r"><span><strong>${esc(x.nombre)}</strong>${x.es_admin ? ' <span class="chip sub">General</span>' : ''}</span></div>`).join('')}</div>
    <div class="form" style="margin-top:16px">
      ${campo('Nombre', `<input data-f="nuevoUsuario" value="${esc(S.f.nuevoUsuario)}" placeholder="Nombre">`)}
      ${campo('Email', `<input data-f="nuevoUsuarioEmail" type="email" value="${esc(S.f.nuevoUsuarioEmail)}" placeholder="correo@ejemplo.com">`)}
      ${campo('Contraseña inicial', `<input data-f="nuevoUsuarioClave" type="password" value="${esc(S.f.nuevoUsuarioClave)}" placeholder="Mínimo 8 caracteres" autocomplete="new-password">`)}
      <label class="campo"><span>&nbsp;</span><span><input type="checkbox" data-f="nuevoUsuarioAdmin" ${S.f.nuevoUsuarioAdmin ? 'checked' : ''}> Administrador general</span></label>
      <button class="btn sm" data-act="crearUsuario">Crear usuario</button>
    </div>
    ${msgHTML('usuario')}
  </section>` : '';

  return `<h1>Accesos</h1>
    <p class="sub">${esGeneral ? 'Administrador general: controlás clientes, usuarios y accesos.' : 'Accesos a los clientes que te corresponden.'}</p>
    ${clientes}${acceso}${usuarios}`;
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

// ---------- Estructura opcional al crear un lugar ----------
// Si el edificio define niveles debajo de este lugar, se pueden crear también sus hijos y nietos.
function bloqueEstructura(padre, def) {
  const bajo = padre ? ctx.dep.nivelesBajo(padre.id) : [];
  if (!bajo.length) return '';
  const fila = (nivel, i) => {
    const de = i === 0 ? def.nombre : bajo[i - 1].nombre;
    return `<div class="form" style="margin-top:8px">${campo(`${/[aó]n?$|ión$/i.test(nivel.nombre) || /a$/i.test(nivel.nombre) || /ión$/i.test(nivel.nombre) ? 'Cuántas' : 'Cuántos'} ${esc(plural(nivel.nombre.toLowerCase()))} por ${esc(de.toLowerCase())}`,
      `<input data-f="cuenta${i}" type="number" min="1" value="${esc(S.f['cuenta' + i])}" style="width:110px;min-width:0">`)}</div>`;
  };
  return `<div class="panel" style="margin-top:12px">
    <label class="campo"><span>&nbsp;</span><span><input type="checkbox" data-f="usarEstructura" ${S.f.usarEstructura ? 'checked' : ''}> Usar la estructura del edificio (crea sus ${esc(bajo.map(n => plural(n.nombre.toLowerCase())).join(' y '))})</span></label>
    ${S.f.usarEstructura ? bajo.map(fila).join('') : ''}
  </div>`;
}

// ---------- Ventanas (modales) ----------
// SALIDA: lugar fijo para los objetos que salen del sistema. No se guarda en la base.
const bloqueSalida = (pos, interactivo) => {
  const cuerpo = '<span class="nivel">Salida</span><span class="codigo">SALIDA</span><span class="nombre">Los objetos que salen del sistema</span>';
  const estilo = `left:${pos.x}px;top:${pos.y}px`;
  return interactivo
    ? `<button class="bloque salida" style="${estilo}" data-act="elegir" data-id="SALIDA" aria-label="Sacar del sistema (salida)">${cuerpo}</button>`
    : `<div class="bloque salida" style="${estilo}" aria-label="Salida del sistema">${cuerpo}</div>`;
};

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
            ${campo('Código', `<input data-f="codigo" value="${esc(S.f.codigo)}" placeholder="Ej.: ${FORMATOS[def.formato].ej}">`)}
            ${def.nombreOpcional ? campo('Nombre (opcional)', `<input data-f="nombre" value="${esc(S.f.nombre)}">`) : ''}
          </div>
          <p class="dim" style="font-size:13px;margin:8px 0 0">Formato: ${FORMATOS[def.formato].txt}.</p>
          ${bloqueEstructura(nodo, def)}
          ${msgHTML('crear')}
          <button class="btn sec sm" data-act="verVarios" style="margin-top:14px">${S.f.verVarios ? 'Ocultar varios' : 'Crear varios de una vez'}</button>
          ${S.f.verVarios ? `<div class="panel" style="margin-top:12px">
            <div class="form">
              ${campo('Desde', `<input data-f="desde" value="${esc(S.f.desde)}" placeholder="Ej.: ${FORMATOS[def.formato].ej}">`)}
              ${campo('Hasta', `<input data-f="hasta" value="${esc(S.f.hasta)}" placeholder="Ej.: ${FORMATOS[def.formato].ej}">`)}
            </div>
            <p class="dim" style="font-size:13px;margin:8px 0 0">Crea solo los códigos del rango, sin nombre. El nombre se pone después editando cada uno.</p>
            ${msgHTML('lote')}
          </div>` : ''}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cerrar</button>
              ${S.f.verVarios ? '<button class="btn sec" data-act="lote">Crear varios</button>' : ''}
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
          <p class="dim" style="font-size:13px;margin:12px 0 0">El nivel no cambia. El stock que tiene el lugar se mantiene.</p>
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
        cuerpo: `<p class="dim" style="margin:0 0 14px">Se copian los niveles y los lugares de adentro. El stock no se copia. Los códigos nuevos se asignan solos.</p>
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
            <span class="acciones-fila"><span class="chip obj">${d.cantidadEn(o.id, l.id)} en este lugar</span>
            ${o.tipo === 'producto' ? `<input type="number" min="1" max="${d.cantidadEn(o.id, l.id)}" value="${esc(S.f.cantPara[o.id] || '1')}" data-cantoid="${o.id}" aria-label="Cantidad a sacar de ${esc(o.codigo_interno)}" style="width:72px;min-width:0">` : ''}
            <button class="btn sm sec" data-act="sacarDeLugar" data-oid="${o.id}" data-lid="${l.id}">Sacar</button></span>
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
    case 'elegirLugar': {
      const o = S.elegirPara ? d.objetoPorId(S.elegirPara) : null;
      if (!o) return null;
      const mover = S.elegirModo === 'mover';
      const producto = o.tipo === 'producto';
      const elegidos = S.elegirLugares;
      const primero = elegidos.length ? d.porId(elegidos[0]) : null;
      const padre = S.elegirNodo ? d.porId(S.elegirNodo) : null;
      const hijos = d.hijos(S.elegirNodo || null);
      const conSalida = mover && !S.elegirNodo;   // SALIDA se ofrece en el nivel de edificios
      const { ancho, alto } = tamanoPlano(conSalida ? [...hijos, {}] : hijos);
      const bloques = hijos.map((l, i) => {
        const p = posDe(l, i);
        const hoja = d.esHoja(l);
        const est = estadoDe(l);
        const marcado = elegidos.includes(l.id);
        const lejos = !mover && hoja && primero && !marcado && !sonAledanos(primero, l);
        const accion = !hoja ? 'Entrar →' : mover ? 'Mover aquí' : marcado ? 'Quitar' : 'Elegir aquí';
        return `<button class="bloque ${est.cls}${marcado ? ' elegido' : ''}${lejos ? ' lejos' : ''}" style="left:${p.x}px;top:${p.y}px"
            data-act="${hoja ? 'elegir' : 'elegirIr'}" data-id="${l.id}" ${hoja && !mover ? `aria-pressed="${marcado}"` : ''} aria-label="${esc(accion)} ${esc(d.dir(l))}">
          <span class="nivel">${esc(d.nivelDe(l).nombre)}</span>
          <span class="codigo">${esc(l.codigo)}</span>
          <span class="pie"><span class="chip ${est.cls}">${esc(est.chip)}</span></span>
          <span class="accion">${accion}</span>
        </button>`;
      }).join('') + (conSalida ? bloqueSalida(posDe({}, hijos.length), true) : '');
      const ubic = mover ? d.ubicacionesDe(o.id) : [];
      const origenes = ubic.length > 1
        ? `<div class="acciones-fila" style="margin-bottom:12px"><span class="dim">Sale de:</span>${ubic.map(l =>
            `<button class="btn sm ${S.elegirOrigen === l.id ? '' : 'sec'}" data-act="elegirOrigen" data-id="${l.id}">${esc(d.dir(l))}</button>`).join('')}</div>`
        : '';
      const ayuda = mover
        ? (ubic.length > 1 && !S.elegirOrigen ? 'Primero elegí de qué lugar sale. ' : '') +
          'Tocá el lugar donde va. Para sacarlo del sistema, tocá SALIDA.'
        : producto
          ? 'Podés elegir varios lugares. El primero que toques manda: los siguientes tienen que estar al lado, en el mismo plano. Tocá de nuevo para quitar uno.'
          : 'Elegí el lugar donde va. Los que tienen algo adentro se abren con "Entrar".';
      const n = elegidos.length;
      return {
        titulo: mover ? `Mover ${o.codigo_interno}` : `Elegir lugar para ${o.codigo_interno}`,
        cuerpo: `<div class="acciones-fila" style="margin-bottom:12px">
            ${padre ? `<button class="btn sm sec" data-act="elegirIr" data-id="${esc(padre.padre_id || '')}">← Volver</button>` : ''}
            <span class="dim">${padre ? esc(d.dir(padre)) : 'Edificios del cliente'}</span></div>
          ${origenes}
          <p class="ayuda" style="margin:0 0 12px">${ayuda}</p>
          ${hijos.length || conSalida
            ? `<div class="plano" style="height:min(50vh,420px)"><div class="plano-lienzo" style="width:${ancho}px;height:${alto}px">${bloques}</div></div>`
            : '<p class="vacio" style="border:0">No hay lugares aquí.</p>'}
          ${msgHTML('elegir')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cancelar</button>${!mover && producto
          ? `<button class="btn" data-act="elegirConfirmar" ${n ? '' : 'disabled'}>${n ? `Asignar a ${n} ${n > 1 ? 'lugares' : 'lugar'}` : 'Asignar'}</button>`
          : ''}`
      };
    }
    case 'nuevoObjeto':
      return {
        titulo: 'Nuevo objeto',
        cuerpo: `<div class="form">
            ${campo('Tipo', `<select data-f="tipoNuevo"><option value="unidad" ${S.f.tipoNuevo === 'unidad' ? 'selected' : ''}>Unidad (cada una tiene su código)</option><option value="producto" ${S.f.tipoNuevo === 'producto' ? 'selected' : ''}>Producto (hay varias iguales)</option></select>`)}
            ${campo('Código propio (opcional)', `<input data-f="codigoP" value="${esc(S.f.codigoP)}">`)}
            ${campo('Descripción', `<input data-f="desc" value="${esc(S.f.desc)}" size="30">`)}
            ${S.f.tipoNuevo === 'producto' ? campo('Mínimo (alerta)', `<input type="number" min="0" data-f="minimoNuevo" value="${esc(S.f.minimoNuevo)}" style="width:110px;min-width:0">`) : ''}
          </div>
          <p class="dim" style="font-size:13px;margin:12px 0 0">El código interno se asigna solo. Después lo podés ubicar en un lugar.</p>
          ${msgHTML('obj')}`,
        pie: `<button class="btn sec" data-act="modalCerrar">Cancelar</button>
              <button class="btn" data-act="crearObjeto">Crear objeto</button>`
      };
  }
  return null;
}
