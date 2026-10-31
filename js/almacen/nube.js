// Sincronización con el servidor (Pages Function /api/*).
//
// El modelo trabaja con sus propios nombres (eid, oid, lid, uid, niveles dentro del lugar).
// Acá se traduce a las tablas de Supabase (establecimiento_id, objeto_id, lugar_id,
// usuario_id, niveles_edificio) y se calcula qué cambió desde la última sincronización.
// La web nunca habla con Supabase: solo llama a /api/*.

// Orden de las tablas en Supabase. Al crear, va de arriba hacia abajo; al borrar, al revés.
const TABLAS = ['establecimientos', 'membresias', 'lugares', 'niveles_edificio', 'objetos', 'existencias', 'movimientos'];

const CLAVE = { membresias: ['usuario_id', 'establecimiento_id'], niveles_edificio: ['edificio_id', 'orden'] };
const clave = (tabla, fila) => (CLAVE[tabla] || ['id']).map(c => String(fila[c])).join('|');
const claveObj = (tabla, fila) => Object.fromEntries((CLAVE[tabla] || ['id']).map(c => [c, fila[c]]));

// Modelo -> filas de Supabase. Devuelve { tabla: Map(clave -> fila) }
export function aFilasDb(almacen) {
  const d = almacen.snapshot().datos;
  const mapas = Object.fromEntries(TABLAS.map(t => [t, new Map()]));
  const poner = (t, fila) => mapas[t].set(clave(t, fila), fila);

  d.establecimientos.forEach(e => poner('establecimientos', { id: e.id, nombre: e.nombre, vencimientos: !!e.vencimientos }));
  d.membresias.forEach(m => poner('membresias', { usuario_id: m.uid, establecimiento_id: m.eid, rol: m.rol }));
  d.lugares.forEach(l => {
    poner('lugares', { id: l.id, establecimiento_id: l.eid, padre_id: l.padre_id ?? null, codigo: l.codigo, nombre: l.nombre ?? '',
      pos_x: l.pos_x ?? null, pos_y: l.pos_y ?? null, vista_x: l.vista_x ?? null, vista_z: l.vista_z ?? null, vista_giro: l.vista_giro ?? null,
      dim_ancho: l.dim_ancho ?? null, dim_largo: l.dim_largo ?? null, dim_alto: l.dim_alto ?? null });
    if (!l.padre_id) {
      (l.niveles || []).forEach((n, i) => poner('niveles_edificio', {
        edificio_id: l.id, orden: i + 1, nombre: n.nombre, formato: n.formato, nombre_opcional: !!n.nombreOpcional
      }));
    }
  });
  d.objetos.forEach(o => poner('objetos', {
    id: o.id, establecimiento_id: o.eid, codigo_interno: o.codigo_interno, codigo_propio: o.codigo_propio ?? null,
    descripcion: o.descripcion ?? null, tipo: o.tipo, minimo: o.minimo ?? 0, vence_dias: o.vence_dias ?? null
  }));
  d.asignaciones.forEach(a => poner('existencias', { id: a.id, objeto_id: a.oid, lugar_id: a.lid, cantidad: a.cantidad }));
  d.movimientos.forEach(m => poner('movimientos', {
    id: m.id, establecimiento_id: m.eid, objeto_id: m.oid ?? null, tipo: m.tipo,
    desde_lugar_id: m.desde ?? null, hasta_lugar_id: m.hasta ?? null, cantidad: m.cantidad,
    usuario_id: m.uid ?? null, nota: m.nota ?? '', creado_en: m.fecha
  }));
  return mapas;
}

// Filas de Supabase (datos del servidor) -> estado del modelo, listo para almacen.restaurar().
export function aEstadoModelo(datos) {
  const niveles = {};
  (datos.niveles_edificio || []).forEach(n => {
    (niveles[n.edificio_id] ||= []).push({ orden: n.orden, nombre: n.nombre, formato: n.formato, nombreOpcional: n.nombre_opcional });
  });
  Object.values(niveles).forEach(arr => arr.sort((a, b) => a.orden - b.orden));

  return {
    datos: {
      establecimientos: (datos.establecimientos || []).map(e => ({ id: e.id, nombre: e.nombre, vencimientos: !!e.vencimientos })),
      usuarios: (datos.perfiles || []).map(p => ({ id: p.id, nombre: p.nombre, es_admin: p.es_admin })),
      membresias: (datos.membresias || []).map(m => ({ id: `${m.usuario_id}|${m.establecimiento_id}`, uid: m.usuario_id, eid: m.establecimiento_id, rol: m.rol })),
      lugares: (datos.lugares || []).map(l => ({
        id: l.id, eid: l.establecimiento_id, padre_id: l.padre_id, codigo: l.codigo, nombre: l.nombre ?? '',
        pos_x: l.pos_x ?? null, pos_y: l.pos_y ?? null, vista_x: l.vista_x ?? null, vista_z: l.vista_z ?? null, vista_giro: l.vista_giro ?? null,
        dim_ancho: l.dim_ancho ?? null, dim_largo: l.dim_largo ?? null, dim_alto: l.dim_alto ?? null,
        niveles: l.padre_id ? [] : (niveles[l.id] || []).map(({ nombre, formato, nombreOpcional }) => ({ nombre, formato, nombreOpcional }))
      })),
      objetos: (datos.objetos || []).map(o => ({
        id: o.id, eid: o.establecimiento_id, codigo_interno: o.codigo_interno, codigo_propio: o.codigo_propio,
        descripcion: o.descripcion, tipo: o.tipo, minimo: o.minimo, vence_dias: o.vence_dias ?? null
      })),
      asignaciones: (datos.existencias || []).map(a => ({ id: a.id, oid: a.objeto_id, lid: a.lugar_id, cantidad: a.cantidad })),
      movimientos: (datos.movimientos || []).map(m => ({
        id: m.id, eid: m.establecimiento_id, fecha: m.creado_en, tipo: m.tipo, oid: m.objeto_id,
        desde: m.desde_lugar_id, hasta: m.hasta_lugar_id, cantidad: m.cantidad, uid: m.usuario_id, nota: m.nota
      }))
    },
    secuencias: {}
  };
}

// Profundidad de un lugar dentro de sus filas (0 = edificio).
function profundidad(fila, mapaLugares) {
  let n = 0, p = fila.padre_id;
  while (p && mapaLugares.has(p)) { n++; p = mapaLugares.get(p).padre_id; }
  return n;
}

// Compara el estado actual con la última sincronización y arma las operaciones.
// Borrar va primero (de abajo hacia arriba), crear después (de arriba hacia abajo).
export function calcularOperaciones(base, actual) {
  const lugaresActual = actual.lugares, lugaresBase = base.lugares;
  const prof = (fila, mapa) => profundidad(fila, mapa);

  const borrados = [];
  const altas = [];

  for (const t of TABLAS) {
    const b = base[t], a = actual[t];
    for (const [k, fila] of b) {
      if (!a.has(k)) borrados.push({ op: 'delete', tabla: t, clave: claveObj(t, fila), _k: k, _fila: fila });
    }
    for (const [k, fila] of a) {
      const previa = b.get(k);
      if (!previa || JSON.stringify(previa) !== JSON.stringify(fila)) {
        altas.push({ op: 'upsert', tabla: t, fila, _k: k });
      }
    }
  }

  // Borrados: de hojas a raíz (lugares por profundidad descendente, y el resto en orden inverso)
  const ordenBorrado = t => TABLAS.length - TABLAS.indexOf(t);
  borrados.sort((x, y) => {
    const dt = ordenBorrado(x.tabla) - ordenBorrado(y.tabla);
    if (dt) return dt;
    if (x.tabla === 'lugares') return prof(y._fila, lugaresBase) - prof(x._fila, lugaresBase);
    return 0;
  });

  // Altas por fase: primero lo que nada necesita, después edificios, niveles,
  // lugares hijos por profundidad, y al final objetos, existencias y movimientos.
  const fase = x => {
    if (x.tabla === 'establecimientos' || x.tabla === 'membresias') return 0;
    if (x.tabla === 'lugares') {
      const p = prof(x.fila, lugaresActual);
      return p === 0 ? 1 : 3 + p;
    }
    if (x.tabla === 'niveles_edificio') return 2;
    return 100 + TABLAS.indexOf(x.tabla);
  };
  altas.sort((x, y) => fase(x) - fase(y));

  return [...borrados, ...altas].map(({ _k, _fila, ...op }) => op);
}

// ----- Llamadas a la API -----
async function llamar(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(cuerpo.error || `Error ${res.status}`);
  return cuerpo;
}

export const api = {
  sesion:       () => llamar('/api/sesion'),
  login:        (email, password) => llamar('/api/login', { method: 'POST', body: { email, password } }),
  logout:       () => llamar('/api/logout', { method: 'POST' }),
  datos:        () => llamar('/api/datos'),
  crearUsuario: (datos) => llamar('/api/usuarios', { method: 'POST', body: datos }),
  sincronizar:  (ops) => llamar('/api/sincronizar', { method: 'POST', body: { ops } })
};

// Carga los datos del servidor en el almacén y devuelve la sesión.
export async function cargarDesdeServidor(almacen) {
  const { sesion, ...datos } = await api.datos();
  almacen.restaurar(aEstadoModelo(datos));
  return sesion;
}

// Manda los cambios pendientes del almacén al servidor.
// `estado.base` guarda la última sincronización. Devuelve el número de operaciones enviadas.
export async function sincronizar(almacen, estado) {
  const actual = aFilasDb(almacen);
  const ops = calcularOperaciones(estado.base, actual);
  if (!ops.length) return 0;
  await api.sincronizar(ops);
  estado.base = actual;
  return ops.length;
}

export function nuevoEstadoSincronizacion(almacen) {
  return { base: aFilasDb(almacen) };
}
