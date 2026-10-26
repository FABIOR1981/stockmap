// Arranque: crea el depósito, dibuja la interfaz y conecta los eventos.

import { Deposito } from './core/deposito.js';
import { crearAlmacenMemoria } from './almacen/memoria.js';
import { ctx, S, $, esc, aviso } from './ui/estado.js';
import { ic } from './ui/iconos.js';
import { migasHTML, accionPrincipal } from './ui/componentes.js';
import { vistaObjetos, vistaPlano, vistaEstructura, bloquePruebas, ventana } from './ui/vistas.js';
import { centrarPlano, instalarArrastre } from './ui/plano.js';
import { ACCIONES } from './ui/acciones.js';

// Almacenamiento en memoria por ahora. Para Supabase se cambia esta línea
// (ver js/almacen/supabase.js).
ctx.dep = new Deposito(crearAlmacenMemoria());

function render() {
  const navItems = [['estructura', 'Edificios', 'edificio'], ['plano', 'Plano', 'plano'], ['objetos', 'Objetos', 'caja']];
  $('#nav').innerHTML = navItems.map(([v, txt, icono]) =>
    `<button data-act="vista" data-v="${v}" ${S.vista === v ? 'aria-current="page"' : ''}>${ic(icono, 18)}<span>${txt}</span></button>`
  ).join('');
  $('#crumbs').innerHTML = migasHTML();
  $('#acciones').innerHTML = accionPrincipal();

  const cuerpo = S.vista === 'objetos' ? vistaObjetos()
               : S.vista === 'plano' ? vistaPlano()
               : vistaEstructura();
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
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
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
  if (t.tagName === 'INPUT' && t.dataset.f) S.f[t.dataset.f] = t.value;
});

document.addEventListener('change', e => {
  const t = e.target;
  // Campos de un nivel de edificio: se guardan al instante.
  if (t.dataset.nivel !== undefined) {
    if (S.nodo) {
      const valor = t.type === 'checkbox' ? t.checked : t.value;
      aviso('niveles', ctx.dep.editarNivel(S.nodo, +t.dataset.nivel, t.dataset.campo, valor));
    }
  } else if (t.dataset.oid) {
    S.f.lugarPara[t.dataset.oid] = t.value;
  } else if (t.dataset.f) {
    S.f[t.dataset.f] = t.value;
  }
  render();
});

// Esc o la X cierran la ventana.
$('#modal').addEventListener('close', () => {
  if (S.modal) { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; render(); }
});

instalarArrastre();
render();
