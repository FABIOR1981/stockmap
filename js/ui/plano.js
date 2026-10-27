// Plano: cada lugar tiene una posición (pos_x, pos_y) dentro del plano de su padre.
// Si todavía no se movió, va a una posición por defecto según su orden. Al soltar, se guarda.

import { ctx } from './estado.js';

export const ANCHO = 124, ALTO = 150, GAP = 16, MARGEN = 20, COLUMNAS = 4;
const PASO = ANCHO + GAP;   // separación horizontal entre bloques
const PASO_V = ALTO + GAP;  // separación vertical entre bloques

// Posición de un lugar: la guardada, o la de la cuadrícula por defecto según su orden entre hermanos.
export function posDe(l, indice = 0) {
  if (l.pos_x != null && l.pos_y != null) return { x: l.pos_x, y: l.pos_y };
  return { x: MARGEN + (indice % COLUMNAS) * PASO, y: MARGEN + Math.floor(indice / COLUMNAS) * PASO_V };
}

// Tamaño del lienzo que necesitan todos los bloques de un plano.
export function tamanoPlano(lugares) {
  let ancho = 0, alto = 0;
  lugares.forEach((l, i) => {
    const p = posDe(l, i);
    ancho = Math.max(ancho, p.x + ANCHO);
    alto = Math.max(alto, p.y + ALTO);
  });
  return { ancho: ancho + MARGEN, alto: alto + MARGEN };
}

// Posición de un lugar dentro de su plano (según su lugar entre los hermanos).
export function posEnPlano(l) {
  const hermanos = ctx.dep.hijos(l.padre_id || null);
  return posDe(l, Math.max(0, hermanos.findIndex(h => h.id === l.id)));
}

// Aledaños: están en el mismo plano y a una distancia de un bloque o menos.
export function sonAledanos(a, b) {
  if ((a.padre_id || null) !== (b.padre_id || null)) return false;
  const pa = posEnPlano(a), pb = posEnPlano(b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= PASO * 1.5;
}

let arrastre = null;
// Después de arrastrar, el navegador dispara un clic al soltar: ese clic no debe entrar al lugar.
let ignorarClic = false;
document.addEventListener('click', e => {
  if (!ignorarClic) return;
  e.stopPropagation(); e.preventDefault();
}, true);

export function instalarArrastre() {
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-drag]');
    if (!el || e.target.closest('button, summary, details, input, select')) return;
    const r = el.getBoundingClientRect();
    arrastre = { el, id: el.dataset.drag, dx: e.clientX - r.left, dy: e.clientY - r.top, movido: false };
    el.setPointerCapture(e.pointerId);
    el.classList.add('arrastrando');
  });

  document.addEventListener('pointermove', e => {
    if (!arrastre) return;
    // El lienzo es el padre del bloque: se mide en cada movimiento, así sigue bien si la página se desplaza.
    const r = arrastre.el.parentElement.getBoundingClientRect();
    arrastre.movido = true;
    arrastre.el.style.left = Math.max(0, Math.round(e.clientX - r.left - arrastre.dx)) + 'px';
    arrastre.el.style.top  = Math.max(0, Math.round(e.clientY - r.top - arrastre.dy)) + 'px';
  });

  document.addEventListener('pointerup', () => {
    if (!arrastre) return;
    const { el, id, movido } = arrastre;
    el.classList.remove('arrastrando');
    arrastre = null;
    if (!movido) return;
    ignorarClic = true;
    setTimeout(() => { ignorarClic = false; }, 150);
    const err = ctx.dep.posicionar(id, parseInt(el.style.left, 10), parseInt(el.style.top, 10));
    ctx.render();   // si falló, el bloque vuelve a su lugar guardado
    if (!err) ctx.sincronizar();
  });
}
