// Estado de la interfaz (no del depósito) y utilidades de presentación.

// `dep` y `render` se asignan al arrancar (js/app.js).
export const ctx = { dep: null, render: () => {} };

export const S = {
  vista: 'plano',          // 'plano' (Asignación) | 'codigo' (Por código) | 'mover' | 'stock' | 'movimientos' | 'accesos'
  nodo: null,              // lugar que se mira (null = raíz de la vista)
  elegido: null,           // lugar seleccionado con un clic (doble clic = entrar). Es el destino de 'Por asignar'.
  rec: { i: 0, resaltado: null, fila: 0 },  // Recorrido: tramo del pasillo que se ve y el módulo que resalta la búsqueda
  q: '',                   // búsqueda de objetos
  msg: {},                 // mensajes por zona
  modal: null,             // 'crear' | 'editar' | 'clonarNivel' | 'niveles' | 'objetos' | 'nuevoObjeto' | 'elegirLugar' | null
  elegirPara: null,        // objeto al que se le elige lugar en el plano
  elegirModo: 'asignar',   // 'asignar' (lugar nuevo) | 'mover' (desde un lugar actual, o a SALIDA)
  elegirOrigen: null,      // en mover: lugar de donde sale el objeto
  elegirNodo: null,        // lugar que se muestra dentro de esa ventana (null = edificios)
  elegirLugares: [],       // lugares elegidos para el objeto (productos pueden tener varios, aledaños)
  editar: null, clon: null, verObj: null,
  f: {
    codigo: '', nombre: '', desde: '', hasta: '', cantClon: '1',
    ancho: '', largo: '', alto: '',       // medidas del edificio nuevo, en metros
    codigoP: '', desc: '', tipoNuevo: 'producto', minimoNuevo: '',
    edCodigo: '', edNombre: '', objAqui: '',
    cantPara: {},                         // por objeto (cantidad a asignar desde la fila de stock)
    codLugar: '', codObjeto: '', codCant: '1',   // asignación por código
    moverA: {},                           // por 'objeto|lugar': lugar al que se mueve ese objeto desde ese lugar
    nuevoCliente: '', nuevoUsuario: '', nuevoUsuarioEmail: '', nuevoUsuarioClave: '', nuevoUsuarioAdmin: false,
    accUid: '', accRol: 'editor'
  },
  pruebas: null,           // resultado de la última corrida de pruebas
  enfocar: null,           // data-f del campo que vuelve a tener el foco tras dibujar
  editarNiveles: false,    // true = se ve el editor de niveles del edificio (si no, solo el resumen)
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

// Plural de un nombre de nivel: estante → estantes, división → divisiones, estantería → estanterías.
export const plural = s => (/[aeiouáéíóú]$/i.test(s) ? s + 's' : s.replace(/ón$/, 'on') + 'es');
