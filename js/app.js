// Arranque: crea el depósito, dibuja la interfaz y conecta los eventos.

import { Deposito } from './core/deposito.js';
import { crearAlmacenMemoria } from './almacen/memoria.js';
import { ctx, S, $, esc, aviso } from './ui/estado.js';
import { ic } from './ui/iconos.js';
import { migasHTML, accionPrincipal } from './ui/componentes.js';
import { vistaStock, vistaPlano, vistaEstructura, vistaMovimientos, vistaAccesos, bloquePruebas, ventana } from './ui/vistas.js';
import { centrarPlano, instalarArrastre } from './ui/plano.js';
import { ACCIONES } from './ui/acciones.js';

// Almacenamiento en memoria por ahora. Para Supabase se cambia esta línea
// (ver js/almacen/supabase.js).
const almacen = crearAlmacenMemoria();
ctx.dep = new Deposito(almacen);

// Arranque vacío: un administrador general para poder crear clientes y usuarios.
{
  const admin = almacen.insertar('usuarios', { id: 'U' + almacen.siguiente('usuarios'), nombre: 'Administrador', es_admin: true });
  ctx.dep.uid = admin.id;
}

const NAV = [
  ['estructura', 'Edificios', 'edificio'],
  ['plano', 'Plano', 'plano'],
  ['stock', 'Stock', 'caja'],
  ['movimientos', 'Movimientos', 'estante'],
  ['accesos', 'Accesos', 'mas']
];

// Selectores de sesión: usuario y cliente.
function sesionHTML() {
  const d = ctx.dep;
  const usuarios = d.usuarios.map(u => `<option value="${u.id}" ${u.id === d.uid ? 'selected' : ''}>${esc(u.nombre)}${u.es_admin ? ' (general)' : ''}</option>`).join('');
  const clientes = d.establecimientosVisibles().map(e => `<option value="${e.id}" ${e.id === d.eid ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('');
  return `<div class="etiqueta" style="margin:0 10px 6px">Usuario</div>
    <div class="stack"><select data-act="usuario" aria-label="Usuario">${usuarios}</select></div>
    <div class="etiqueta" style="margin:12px 10px 6px">Cliente</div>
    <div class="stack"><select data-act="cliente" aria-label="Cliente"><option value="">— ninguno —</option>${clientes}</select></div>`;
}

function render() {
  // La interfaz oculta lo que el usuario no puede hacer. El modelo sigue siendo la barrera real.
  document.body.classList.toggle('solo-lectura', !ctx.dep.puedeEditar());
  document.body.classList.toggle('sin-gestion', !ctx.dep.puedeGestionar());
  $('#sesion').innerHTML = sesionHTML();
  $('#nav').innerHTML = NAV.map(([v, txt, icono]) =>
    `<button data-act="vista" data-v="${v}" ${S.vista === v ? 'aria-current="page"' : ''}>${ic(icono, 18)}<span>${txt}</span></button>`
  ).join('');
  $('#crumbs').innerHTML = migasHTML();
  $('#acciones').innerHTML = accionPrincipal();

  const vistas = { stock: vistaStock, plano: vistaPlano, movimientos: vistaMovimientos, accesos: vistaAccesos, estructura: vistaEstructura };
  const cuerpo = (vistas[S.vista] || vistaEstructura)();
  $('#contenido').innerHTML = bloquePruebas() + cuerpo;
  if (S.vista === 'plano' && !S.nodo) centrarPlano();

  const dlg = $('#modal');
  const v = S.modal ? ventana() : null;
  if (v) {
    dlg.innerHTML = `<div class="dlg-cab"><h2>${esc(v.titulo)}</h2>
        <button class="btn x" data-act="modalCerrar" aria-label="Cerrar">×</button></div>
      <div class="dlg-cuerpo">${v.cuerpo}</div>
      <div class="dlg-pie">${v.pie}</div>`;
    if (!dlg.open) dlg.showModal();
  } else if (dlg.open) {
    dlg.close();
  }
}
ctx.render = render;

// ---------- Eventos ----------
// Clics en botones y vínculos. Los selects e inputs se manejan en 'change'.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.matches('select, input')) return;
  const fn = ACCIONES[b.dataset.act];
  if (fn) fn(b.dataset);
  render();
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
  if (t.tagName === 'INPUT' && t.dataset.f) S.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
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
  } else if (t.dataset.oid) {
    S.f.lugarPara[t.dataset.oid] = t.value;
  } else if (t.dataset.f) {
    S.f[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value;
  }
  render();
});

// Esc o la X cierran la ventana.
$('#modal').addEventListener('close', () => {
  if (S.modal) { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.mover = null; render(); }
});

instalarArrastre();
render();
