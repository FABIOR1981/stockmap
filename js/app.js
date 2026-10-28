// Arranque: pide ingreso, carga los datos del servidor, dibuja la interfaz y
// manda al servidor cada cambio. La web nunca habla con la base: solo con /api/*.

import { Deposito } from './core/deposito.js';
import { crearAlmacenMemoria } from './almacen/memoria.js';
import { api, cargarDesdeServidor, sincronizar, nuevoEstadoSincronizacion } from './almacen/nube.js';
import { ctx, S, $, esc, aviso, msgHTML } from './ui/estado.js';
import { ic } from './ui/iconos.js';
import { migasHTML, accionPrincipal } from './ui/componentes.js';
import { vistaStock, vistaCodigo, vistaPlano, vistaMovimientos, vistaAccesos, bloquePruebas, ventana } from './ui/vistas.js';
import { instalarArrastre } from './ui/plano.js';
import { ACCIONES } from './ui/acciones.js';

// El almacén en memoria es la copia de trabajo; la verdad está en el servidor.
const almacen = crearAlmacenMemoria();
ctx.dep = new Deposito(almacen);
let estadoSync = null;

// Nombres cortos para la barra inferior del celular (en pantalla chica no entran los largos).
const CORTO = { plano: 'Asignar', codigo: 'Código', movimientos: 'Movim.' };

const NAV = [
  ['plano', 'Asignación', 'plano'],
  ['codigo', 'Por código', 'buscar'],
  ['mover', 'Mover', 'mover'],
  ['stock', 'Stock', 'caja'],
  ['movimientos', 'Movimientos', 'estante'],
  ['accesos', 'Accesos', 'mas']
];

// Acciones que no cambian datos: no disparan sincronización.
const SIN_SYNC = new Set(['vista', 'planoIr', 'subirNivel', 'ponerEn', 'moverEn', 'enfocar', 'imprimirEtiquetas', 'etiquetaLugar', 'etiquetaObjeto', 'escanear', 'modalCerrar', 'cerrarPruebas', 'pruebas', 'salir', 'toggleNiveles',
  'elegirEnPlano', 'moverEnPlano', 'elegirIr', 'elegirOrigen']);

function sesionHTML() {
  const d = ctx.dep;
  const clientes = d.establecimientosVisibles().map(e => `<option value="${e.id}" ${e.id === d.eid ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('');
  return `<div class="etiqueta" style="margin:0 10px 6px">${esc(ctx.sesion?.nombre || '')}${ctx.sesion?.es_admin ? ' (general)' : ''}</div>
    <div class="etiqueta" style="margin:12px 10px 6px">Cliente</div>
    <div class="stack"><select data-act="cliente" aria-label="Cliente"><option value="">— ninguno —</option>${clientes}</select></div>`;
}

function render() {
  // La interfaz oculta lo que el usuario no puede hacer. El servidor es la barrera real.
  document.body.classList.toggle('solo-lectura', !ctx.dep.puedeEditar());
  document.body.classList.toggle('sin-gestion', !ctx.dep.puedeGestionar());
  $('#sesion').innerHTML = sesionHTML();
  $('#nav').innerHTML = NAV.map(([v, txt, icono]) =>
    `<button data-act="vista" data-v="${v}" title="${txt}" ${S.vista === v ? 'aria-current="page"' : ''}>${ic(icono, 18)}<span class="largo">${txt}</span><span class="corto">${CORTO[v] || txt}</span></button>`
  ).join('');
  $('#crumbs').innerHTML = migasHTML();
  $('#acciones').innerHTML = accionPrincipal();

  const vistas = { stock: vistaStock, plano: vistaPlano, mover: vistaPlano, codigo: vistaCodigo, movimientos: vistaMovimientos, accesos: vistaAccesos };
  const cuerpo = (vistas[S.vista] || vistaPlano)();
  $('#contenido').innerHTML = msgHTML('global') + bloquePruebas() + cuerpo;
  // En las vistas de elementos, el título ya lo dice la ruta de arriba: se oculta en escritorio (ver css).
  $('#contenido').classList.toggle('elementos', ['plano', 'mover'].includes(S.vista));

  if (S.enfocar) { document.querySelector(`[data-f="${S.enfocar}"]`)?.focus(); S.enfocar = null; }
  const dlg = $('#modal');
  const v = S.modal ? ventana() : null;
  if (v) {
    dlg.innerHTML = `<div class="dlg-cab"><h2>${esc(v.titulo)}</h2>
        <button class="btn x" data-act="modalCerrar" aria-label="Cerrar">×</button></div>
      <div class="dlg-cuerpo">${msgHTML('global')}${v.cuerpo}</div>
      <div class="dlg-pie">${v.pie}</div>`;
    if (!dlg.open) dlg.showModal();
  } else if (dlg.open) {
    dlg.close();
  }
}
ctx.render = render;

// ---------- Sincronización ----------
// Una sola cola: los envíos van en orden y no se pisan.
let cola = Promise.resolve();

function sincronizarAhora() {
  cola = cola.then(async () => {
    try {
      await sincronizar(almacen, estadoSync);
      if (S.msg.global) { delete S.msg.global; render(); }
    } catch (e) {
      // Si el servidor rechazó algo, se descarta lo local y se vuelve a lo guardado.
      aviso('global', `No se pudo guardar: ${e.message}. Se recargaron los datos guardados.`);
      await recargar();
    }
  });
  return cola;
}

// Vuelve a cargar todo desde el servidor (después de crear usuarios o si algo falló).
async function recargar() {
  await cargarDesdeServidor(almacen);
  ctx.dep.uid = ctx.sesion.uid;
  estadoSync = nuevoEstadoSincronizacion(almacen);
  render();
}
ctx.recargar = recargar;
ctx.sincronizar = () => sincronizarAhora();

// ---------- Ingreso ----------
const pantallaIngreso = $('#ingreso');
const partes = () => ({ side: document.querySelector('aside.side'), main: document.querySelector('main.main'), modal: $('#modal') });

function mostrarIngreso() {
  const p = partes();
  p.side.style.display = 'none';
  p.main.style.display = 'none';
  p.modal.style.display = 'none';
  pantallaIngreso.style.cssText = 'display:grid;place-items:center;min-height:100vh;padding:16px';
}

function mostrarApp() {
  const p = partes();
  p.side.style.display = '';
  p.main.style.display = '';
  p.modal.style.display = '';
  pantallaIngreso.style.display = 'none';
}

// Carga los datos del usuario que ingresó y muestra la aplicación.
async function entrar() {
  const sesion = await cargarDesdeServidor(almacen);
  ctx.sesion = sesion;
  ctx.dep.uid = sesion.uid;
  const visibles = ctx.dep.establecimientosVisibles();
  if (!ctx.dep.eid && visibles.length) ctx.dep.elegirEstablecimiento(visibles[0].id);
  estadoSync = nuevoEstadoSincronizacion(almacen);
  mostrarApp();
  render();
}

$('#formIngreso').addEventListener('submit', async e => {
  e.preventDefault();
  const error = $('#ingError');
  error.hidden = true;
  try {
    await api.login($('#ingEmail').value.trim(), $('#ingClave').value);
    $('#ingClave').value = '';
    await entrar();
  } catch (x) {
    error.textContent = x.message;
    error.hidden = false;
  }
});

// ---------- Eventos ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.matches('select, input')) return;
  const fn = ACCIONES[b.dataset.act];
  if (fn) await fn(b.dataset);
  render();
  if (!SIN_SYNC.has(b.dataset.act) && ctx.sesion) sincronizarAhora();
});

// Campos con data-enter: Enter llama a su acción (por ejemplo, el lector de códigos USB manda Enter al final).
document.addEventListener('keydown', async e => {
  if (e.key !== 'Enter' || !e.target.dataset?.enter) return;
  e.preventDefault();
  const act = e.target.dataset.enter;
  const fn = ACCIONES[act];
  if (fn) await fn({ ...e.target.dataset });
  render();
  if (!SIN_SYNC.has(act) && ctx.sesion) sincronizarAhora();
});

// Tarjetas que actúan como botón (role="button"): Enter o Espacio sobre la tarjeta misma equivalen a un clic.
document.addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || e.target.getAttribute?.('role') !== 'button') return;
  if (e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  e.target.click();
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.in === 'q') {
    S.q = t.value;
    render();
    const el = $('[data-in="q"]');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    return;
  }
  if (t.dataset.cantoid) { S.f.cantPara[t.dataset.cantoid] = t.value; return; }
  if (t.tagName === 'INPUT' && t.dataset.f) {
    S.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    // El aviso viejo se quita mientras se escribe (sin redibujar, para no perder el foco).
    const g = S.msg.global;
    S.msg = g ? { global: g } : {};
    document.querySelectorAll('#modal .msg').forEach(el => el.remove());
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  // Selects de sesión, roles y similares: llaman a su acción con el valor elegido.
  if (t.dataset.act && t.tagName === 'SELECT') {
    ACCIONES[t.dataset.act]({ ...t.dataset, value: t.value });
  // Campos de un nivel de edificio: se guardan al instante.
  } else if (t.dataset.nivel !== undefined) {
    if (S.nodo) {
      const valor = t.type === 'checkbox' ? t.checked : t.value;
      aviso('niveles', ctx.dep.editarNivel(S.nodo, +t.dataset.nivel, t.dataset.campo, valor));
    }
  } else if (t.dataset.f) {
    S.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
    // Los campos de texto ya se guardaron al escribir. Redibujar acá reemplazaría el campo
    // que el usuario acaba de tocar y se perdería lo que escribe en el siguiente.
    if (t.tagName === 'INPUT' && t.type !== 'checkbox') return;
    const g = S.msg.global;
    S.msg = g ? { global: g } : {};
  }
  render();
  if (ctx.sesion) sincronizarAhora();
});

// Esc o la X cierran la ventana.
$('#modal').addEventListener('close', () => {
  if (S.modal) { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.elegirPara = null; S.elegirNodo = null; S.elegirLugares = []; S.elegirOrigen = null; render(); }
});

instalarArrastre();

// Al abrir la página: si ya hay una sesión válida, entra directo; si no, pide ingreso.
(async () => {
  try {
    await api.sesion();
    await entrar();
  } catch {
    mostrarIngreso();
  }
})();
