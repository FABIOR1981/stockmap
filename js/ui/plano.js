// Plano: posición de los edificios y arrastre con el puntero.
// La posición es solo de pantalla: no pasa por el modelo.

import { ctx, S } from './estado.js';

const ANCHO = 184, GAP = 16, MARGEN = 20;

export const posDe = e => S.posiciones[e.id] || { x: MARGEN, y: MARGEN };

// Acomoda en filas los edificios que todavía no fueron movidos a mano.
export function centrarPlano() {
  const plano = document.querySelector('.plano[data-raiz]');
  if (!plano) return;
  const sinMover = ctx.dep.hijos(null).filter(e => !S.posiciones[e.id]);
  const W = plano.clientWidth;
  const cols = Math.max(1, Math.floor((W - 2 * MARGEN + GAP) / (ANCHO + GAP)));
  let y = MARGEN;
  for (let i = 0; i < sinMover.length; i += cols) {
    const fila = sinMover.slice(i, i + cols);
    const anchoFila = fila.length * ANCHO + (fila.length - 1) * GAP;
    let x = Math.max(MARGEN, (W - anchoFila) / 2);
    fila.forEach(e => {
      const el = plano.querySelector(`[data-drag="${e.id}"]`);
      if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
      x += ANCHO + GAP;
    });
    y += ANCHO + GAP;
  }
}

let arrastre = null;

export function instalarArrastre() {
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('button, summary, details, input, select')) return;
    const r = el.getBoundingClientRect(), c = el.parentElement.getBoundingClientRect();
    arrastre = { el, id: el.dataset.drag, dx: e.clientX - r.left, dy: e.clientY - r.top, cx: c.left, cy: c.top, movido: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('arrastrando');
  });

  document.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const padre = arrastre.el.parentElement;
    arrastre.movido = true;
    arrastre.el.style.left = Math.max(0, e.clientX - arrastre.cx - arrastre.dx + padre.scrollLeft) + 'px';
    arrastre.el.style.top  = Math.max(0, e.clientY - arrastre.cy - arrastre.dy + padre.scrollTop) + 'px';
  });

  document.addEventListener('pointerup', () => {
    if (!arrastre) return;
    const { el, id, movido } = arrastre;
    el.classList.remove('arrastrando');
    if (movido) S.posiciones[id] = { x: parseInt(el.style.left, 10), y: parseInt(el.style.top, 10) };
    arrastre = null;
  });
}
