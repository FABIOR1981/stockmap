// Estado de la interfaz (no del depósito) y utilidades de presentación.

// `dep` y `render` se asignan al arrancar (js/app.js).
export const ctx = { dep: null, render: () => {} };

export const S = {
  vista: 'estructura',     // 'estructura' | 'plano' | 'stock' | 'movimientos' | 'accesos'
  nodo: null,              // lugar que se mira (null = raíz de la vista)
  q: '',                   // búsqueda de objetos
  msg: {},                 // mensajes por zona
  modal: null,             // 'crear' | 'editar' | 'clonar' | 'objetos' | 'mover' | 'nuevoObjeto' | null
  editar: null, clon: null, verObj: null,
  mover: null,             // { oid, lid } del objeto que se mueve
  f: {
    codigo: '', nombre: '', desde: '', hasta: '', cantClon: '1',
    codigoP: '', desc: '', tipoNuevo: 'unidad', minimoNuevo: '',
    edCodigo: '', edNombre: '', objAqui: '',
    lugarPara: {}, cantPara: {},          // por objeto (fila de la tabla de stock)
    cantMov: '1', mvHasta: '',            // ventana de mover
    nuevoCliente: '', nuevoUsuario: '', nuevoUsuarioAdmin: false,
    accUid: '', accRol: 'editor'
  },
  pruebas: null,           // resultado de la última corrida de pruebas
  posiciones: {}           // posición en pantalla de cada edificio en el plano (solo UI)
};

export const $ = s => document.querySelector(s);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const campo = (texto, control) => `<label class="campo"><span>${texto}</span>${control}</label>`;

export function aviso(clave, error, ok) {
  S.msg[clave] = { err: error || null, ok: error ? null : (ok || null) };
}

export function msgHTML(clave) {
  const m = S.msg[clave] || {};
  return `${m.err ? `<p class="msg err" role="alert">${esc(m.err)}</p>` : ''}${m.ok ? `<p class="msg ok" role="status">${esc(m.ok)}</p>` : ''}`;
}
