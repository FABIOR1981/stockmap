// Iconos SVG en línea, de trazo fino.

const TRAZOS = {
  edificio: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  plano:    '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  caja:     '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
  estante:  '<path d="M4 5h16M4 12h16M4 19h16M6 3v18M18 3v18"/>',
  pasillo:  '<path d="M3 4h18v16H3zM8 8l4 2.5v5L8 16M16 8l-4 2.5v5l4 2.5"/>',
  mas:      '<path d="M12 5v14M5 12h14"/>',
  buscar:   '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  lapiz:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  papelera: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5"/><path d="M10 11v5M14 11v5"/>',
  mover:    '<path d="M4 12h14M13 6l6 6-6 6"/>',
  qr:       '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>'
};

export const ic = (nombre, tam = 16) =>
  `<svg class="svg-ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre]}</svg>`;

// Ilustración de los estados vacíos: un estante con dos niveles.
export const ilustracion = () => `<svg class="ilu" width="120" height="96" viewBox="0 0 120 96" fill="none" aria-hidden="true">
  <rect x="14" y="10" width="92" height="76" rx="8" style="fill:var(--sur)" stroke="currentColor" stroke-width="1.5"/>
  <path d="M14 42h92M14 70h92" stroke="currentColor" stroke-width="1.5"/>
  <rect x="26" y="20" width="18" height="14" rx="3" style="fill:var(--acc-s);stroke:var(--acc)" stroke-width="1.2"/>
  <rect x="50" y="20" width="24" height="14" rx="3" style="fill:var(--sur)" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/>
  <rect x="32" y="50" width="26" height="14" rx="3" style="fill:var(--sur)" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 3"/>
  <rect x="66" y="50" width="22" height="14" rx="3" style="fill:var(--acc-s);stroke:var(--acc)" stroke-width="1.2"/>
</svg>`;
