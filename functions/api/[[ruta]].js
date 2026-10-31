// API de stockmap (Cloudflare Pages Function).
// Es la única parte que habla con Supabase, con la clave service_role (secreto del proyecto).
//
// Variables del proyecto en Cloudflare:
//   SUPABASE_URL          (texto)   https://<proyecto>.supabase.co
//   SUPABASE_SERVICE_KEY  (secreto) clave service_role
//   SESSION_SECRET        (secreto) texto aleatorio de 32 caracteres o más
//
// Rutas:
//   POST /api/login         { email, password }
//   POST /api/logout
//   GET  /api/sesion
//   GET  /api/datos         datos de los clientes del usuario
//   POST /api/usuarios      { email, password, nombre, es_admin }   (solo administrador general)
//   POST /api/sincronizar   { ops: [ { op: 'upsert', tabla, fila } | { op: 'delete', tabla, clave } ] }

const TABLAS = {
  establecimientos: { columnas: ['id', 'nombre', 'vencimientos'], clave: ['id'] },
  membresias:       { columnas: ['usuario_id', 'establecimiento_id', 'rol'], clave: ['usuario_id', 'establecimiento_id'] },
  lugares:          { columnas: ['id', 'establecimiento_id', 'padre_id', 'codigo', 'nombre', 'pos_x', 'pos_y', 'vista_x', 'vista_z', 'vista_giro', 'dim_ancho', 'dim_largo', 'dim_alto'], clave: ['id'] },
  niveles_edificio: { columnas: ['edificio_id', 'orden', 'nombre', 'formato', 'nombre_opcional'], clave: ['edificio_id', 'orden'] },
  objetos:          { columnas: ['id', 'establecimiento_id', 'codigo_interno', 'codigo_propio', 'descripcion', 'tipo', 'minimo', 'vence_dias'], clave: ['id'] },
  existencias:      { columnas: ['id', 'objeto_id', 'lugar_id', 'cantidad'], clave: ['id'] },
  movimientos:      { columnas: ['id', 'establecimiento_id', 'objeto_id', 'tipo', 'desde_lugar_id', 'hasta_lugar_id', 'cantidad', 'usuario_id', 'nota', 'creado_en'], clave: ['id'] }
};
const ROLES = ['admin', 'editor', 'lector'];
const PUEDEN_ESCRIBIR = ['admin', 'editor'];
const MAX_OPS = 2000;
const DURACION = 8 * 60 * 60;   // segundos
const COOKIE = 'sm_sesion';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ErrorApi extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

const json = (datos, status = 200, cabeceras = {}) =>
  new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cabeceras }
  });

const validarUUID = v => { if (!UUID.test(String(v ?? ''))) throw new ErrorApi('Identificador inválido.'); return v; };
const validarEntero = v => { const n = Number(v); if (!Number.isInteger(n)) throw new ErrorApi('Número inválido.'); return n; };

async function leerJson(request) {
  try { return await request.json(); } catch { throw new ErrorApi('Datos inválidos.'); }
}

// ---------- Sesión firmada (HMAC-SHA256) ----------
const enc = new TextEncoder();
const aB64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => { let t = s.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return Uint8Array.from(atob(t), c => c.charCodeAt(0)); };

async function claveFirma(env) {
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function firmar(env, uid) {
  const exp = Math.floor(Date.now() / 1000) + DURACION;
  const datos = `${uid}.${exp}`;
  const firma = await crypto.subtle.sign('HMAC', await claveFirma(env), enc.encode(datos));
  return `${datos}.${aB64u(firma)}`;
}

async function verificar(env, token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [uid, exp, firma] = partes;
  if (!UUID.test(uid) || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  const ok = await crypto.subtle.verify('HMAC', await claveFirma(env), deB64u(firma), enc.encode(`${uid}.${exp}`));
  return ok ? uid : null;
}

const cookieSesion = (valor, segundos) =>
  `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${segundos}`;

function leerCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)sm_sesion=([^;]+)/);
  return m ? m[1] : null;
}

// ---------- Acceso a Supabase ----------
async function db(env, ruta, { metodo = 'GET', cuerpo, cabeceras = {} } = {}) {
  const clave = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', ...cabeceras },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if (!res.ok) {
    const texto = await res.text();
    let mensaje = texto;
    try { mensaje = JSON.parse(texto).message || texto; } catch { /* texto plano */ }
    throw new ErrorApi(mensaje, 400);
  }
  // Las escrituras con return=minimal responden sin cuerpo: no se puede leer como JSON.
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

async function auth(env, ruta, cuerpo) {
  const clave = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/${ruta}`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new ErrorApi(datos.msg || datos.error_description || datos.message || 'Error de autenticación.', res.status);
  return datos;
}

const enLista = ids => `in.(${[...new Set(ids)].map(validarUUID).join(',')})`;

// ---------- Sesión y permisos ----------
async function sesionActual(env, request) {
  const uid = await verificar(env, leerCookie(request));
  if (!uid) return null;
  const [perfil] = await db(env, `perfiles?id=eq.${uid}&select=id,nombre,es_admin`);
  return perfil ? { uid, nombre: perfil.nombre, es_admin: perfil.es_admin } : null;
}

async function requerirSesion(env, request) {
  const s = await sesionActual(env, request);
  if (!s) throw new ErrorApi('Tenés que iniciar sesión.', 401);
  return s;
}

// Datos que necesita un envío, traídos con pocas llamadas (Cloudflare limita las llamadas por petición).
// Un envío grande no puede hacer una llamada por registro.
async function precargar(env, ops, sesion) {
  const todas = new Set();
  for (const op of ops) {
    const f = op?.op === 'upsert' ? op.fila : op?.clave;
    if (f && typeof f === 'object') for (const v of Object.values(f)) if (typeof v === 'string' && UUID.test(v)) todas.add(v);
  }
  const lista = [...todas];
  const traer = async (tabla, campos) => {
    const mapa = new Map();
    for (let i = 0; i < lista.length; i += 150) {
      const filas = await db(env, `${tabla}?id=${enLista(lista.slice(i, i + 150))}&select=${campos}`);
      for (const f of filas) mapa.set(f.id, f);
    }
    return mapa;
  };
  const [lugares, objetos, existencias, movimientos] = lista.length
    ? await Promise.all([traer('lugares', 'id,establecimiento_id'), traer('objetos', 'id,establecimiento_id'),
        traer('existencias', 'id,lugar_id'), traer('movimientos', 'id,establecimiento_id')])
    : [new Map(), new Map(), new Map(), new Map()];
  const roles = new Map();
  if (!sesion.es_admin) {
    const ms = await db(env, `membresias?usuario_id=eq.${sesion.uid}&select=establecimiento_id,rol`);
    for (const m of ms) roles.set(m.establecimiento_id, m.rol);
  }
  return { lugares, objetos, existencias, movimientos, roles };
}

// Rol del usuario en un cliente (admin general = admin en todos).
function rolEn(c, sesion, eid) {
  if (sesion.es_admin) return 'admin';
  return c.roles.get(eid) ?? null;
}

// Cliente al que pertenece un lugar: primero lo que ya está en la base; si no, lo que llega en este envío.
function eidDeLugar(c, id, pend) {
  const l = c.lugares.get(id);
  if (l) return l.establecimiento_id;
  return pend.lugares.get(id) ?? null;
}
function eidDeObjeto(c, id, pend) {
  const o = c.objetos.get(id);
  if (o) return o.establecimiento_id;
  return pend.objetos.get(id) ?? null;
}

// Cliente de una fila que ya existe en la base (null si no existe).
function eidExistente(c, tabla, id) {
  validarUUID(id);
  if (tabla === 'lugares') return c.lugares.get(id)?.establecimiento_id ?? null;
  if (tabla === 'objetos') return c.objetos.get(id)?.establecimiento_id ?? null;
  if (tabla === 'movimientos') return c.movimientos.get(id)?.establecimiento_id ?? null;
  if (tabla === 'existencias') {
    const e = c.existencias.get(id);
    return e ? (c.lugares.get(e.lugar_id)?.establecimiento_id ?? null) : null;
  }
  return null;
}

// ---------- Validación de cada operación ----------
// Devuelve el cliente de la operación, o null si no hay nada que hacer (borrar algo que no existe).
function autorizar(c, sesion, op, pend) {
  if (op.op !== 'upsert' && op.op !== 'delete') throw new ErrorApi('Operación inválida.');
  const info = TABLAS[op.tabla];
  if (!info) throw new ErrorApi(`Tabla no permitida: ${op.tabla}.`, 403);
  const datos = op.op === 'upsert' ? op.fila : op.clave;
  if (!datos || typeof datos !== 'object') throw new ErrorApi('Operación inválida.');

  if (op.tabla === 'establecimientos') {
    if (!sesion.es_admin) throw new ErrorApi('Solo el administrador general puede crear clientes.', 403);
    // Devuelve el id (no null): null significa "no hay nada que hacer" y salteaba el guardado.
    return validarUUID(datos.id);
  }

  let eid;
  switch (op.tabla) {
    case 'membresias':
      validarUUID(datos.usuario_id);
      eid = validarUUID(datos.establecimiento_id);
      if (!sesion.es_admin && rolEn(c, sesion, eid) !== 'admin')
        throw new ErrorApi('Solo un admin del cliente puede gestionar accesos.', 403);
      return eid;

    case 'niveles_edificio': {
      const edificio = validarUUID(datos.edificio_id);
      eid = eidDeLugar(c, edificio, pend);
      if (!eid) throw new ErrorApi('El edificio no existe.', 400);
      break;
    }

    case 'existencias': {
      if (op.op === 'upsert') {
        const eLugar = eidDeLugar(c, validarUUID(datos.lugar_id), pend);
        const eObj = eidDeObjeto(c, validarUUID(datos.objeto_id), pend);
        if (!eLugar || eLugar !== eObj) throw new ErrorApi('El objeto y el lugar no son del mismo cliente.', 403);
        eid = eLugar;
        validarUUID(datos.id);
      } else {
        eid = eidExistente(c, 'existencias', validarUUID(datos.id));
        if (!eid) return null;
      }
      break;
    }

    case 'movimientos': {
      if (op.op === 'upsert') {
        eid = validarUUID(datos.establecimiento_id);
        if (datos.usuario_id !== sesion.uid) throw new ErrorApi('El movimiento tiene que quedar a nombre de quien lo registra.', 403);
        if (datos.objeto_id && eidDeObjeto(c, datos.objeto_id, pend) !== eid) throw new ErrorApi('Un dato del movimiento es de otro cliente.', 403);
        if (datos.desde_lugar_id && eidDeLugar(c, datos.desde_lugar_id, pend) !== eid) throw new ErrorApi('Un dato del movimiento es de otro cliente.', 403);
        if (datos.hasta_lugar_id && eidDeLugar(c, datos.hasta_lugar_id, pend) !== eid) throw new ErrorApi('Un dato del movimiento es de otro cliente.', 403);
        validarUUID(datos.id);
      } else {
        eid = eidExistente(c, 'movimientos', validarUUID(datos.id));
        if (!eid) return null;
      }
      break;
    }

    default:   // lugares, objetos
      if (op.op === 'upsert') {
        eid = validarUUID(datos.establecimiento_id);
        validarUUID(datos.id);
      } else {
        eid = eidExistente(c, op.tabla, validarUUID(datos.id));
        if (!eid) return null;
      }
  }

  // Si la fila ya existe, tiene que ser del mismo cliente (no se puede pisar la de otro).
  if (op.op === 'upsert' && info.clave.length === 1 && op.tabla !== 'membresias') {
    const actual = eidExistente(c, op.tabla, datos.id);
    if (actual && actual !== eid) throw new ErrorApi('Ese registro es de otro cliente.', 403);
  }

  if (!sesion.es_admin) {
    const rol = rolEn(c, sesion, eid);
    if (!rol) throw new ErrorApi('No tenés acceso a este cliente.', 403);
    if (!PUEDEN_ESCRIBIR.includes(rol)) throw new ErrorApi('Tu rol es de solo lectura en este cliente.', 403);
  }
  return eid;
}

// Solo las columnas permitidas, con tipos verificados.
function filaLimpia(tabla, fila) {
  const salida = {};
  for (const col of TABLAS[tabla].columnas) {
    if (!(col in fila)) continue;
    const v = fila[col];
    if (v === null) { salida[col] = null; continue; }
    if (col === 'id' || col.endsWith('_id')) salida[col] = validarUUID(v);
    else if (col === 'orden' || col === 'cantidad' || col === 'minimo' || col === 'vence_dias' || col.startsWith('vista_') || col.startsWith('dim_')) salida[col] = validarEntero(v);
    else if (col === 'nombre_opcional' || col === 'vencimientos') salida[col] = v === true || v === 'true';
    else if (col === 'rol') {
      if (!ROLES.includes(v)) throw new ErrorApi('Rol inválido.');
      salida[col] = v;
    }
    else salida[col] = String(v);
  }
  return salida;
}

// Una operación de sincronización con solo las columnas permitidas y tipos verificados.
// Las claves de borrado se validan igual que las filas.
function operacionLimpia(op) {
  if (op.op === 'delete') {
    const clave = {};
    for (const c of TABLAS[op.tabla].clave) {
      clave[c] = c.endsWith('_id') || c === 'id' ? validarUUID(op.clave?.[c]) : validarEntero(op.clave?.[c]);
    }
    return { op: 'delete', tabla: op.tabla, clave };
  }
  return { op: 'upsert', tabla: op.tabla, fila: filaLimpia(op.tabla, op.fila || {}) };
}

// ---------- Rutas ----------
async function login(env, request) {
  const { email, password } = await leerJson(request);
  if (!email || !password) throw new ErrorApi('Ingresá email y contraseña.');
  let datos;
  try {
    datos = await auth(env, 'token?grant_type=password', { email, password });
  } catch {
    throw new ErrorApi('Email o contraseña incorrectos.', 401);
  }
  const uid = datos.user.id;
  const [perfil] = await db(env, `perfiles?id=eq.${uid}&select=id,nombre,es_admin`);
  if (!perfil) throw new ErrorApi('Tu usuario todavía no está habilitado en stockmap.', 403);
  const token = await firmar(env, uid);
  return json({ ok: true, nombre: perfil.nombre }, 200, { 'Set-Cookie': cookieSesion(token, DURACION) });
}

async function datos(env, request) {
  const s = await requerirSesion(env, request);

  const misMembresias = s.es_admin ? null
    : await db(env, `membresias?usuario_id=eq.${s.uid}&select=establecimiento_id`);
  const establecimientos = s.es_admin
    ? await db(env, 'establecimientos?select=*')
    : misMembresias.length ? await db(env, `establecimientos?id=${enLista(misMembresias.map(m => m.establecimiento_id))}&select=*`) : [];
  const eids = establecimientos.map(e => e.id);

  const vacio = [];
  const lista = (ruta, ids) => ids.length ? db(env, ruta(ids)) : Promise.resolve(vacio);

  const [membresias, lugares, objetos, movimientos] = await Promise.all([
    lista(ids => `membresias?establecimiento_id=${enLista(ids)}&select=*`, eids),
    lista(ids => `lugares?establecimiento_id=${enLista(ids)}&select=*`, eids),
    lista(ids => `objetos?establecimiento_id=${enLista(ids)}&select=*`, eids),
    lista(ids => `movimientos?establecimiento_id=${enLista(ids)}&select=*&order=creado_en.desc&limit=2000`, eids)
  ]);

  const edificios = lugares.filter(l => !l.padre_id).map(l => l.id);
  const lugaresIds = lugares.map(l => l.id);
  const [niveles, existencias] = await Promise.all([
    lista(ids => `niveles_edificio?edificio_id=${enLista(ids)}&select=*`, edificios),
    lista(ids => `existencias?lugar_id=${enLista(ids)}&select=*`, lugaresIds)
  ]);

  let perfiles;
  if (s.es_admin) {
    perfiles = await db(env, 'perfiles?select=id,nombre,es_admin');
  } else {
    const ids = [s.uid, ...membresias.map(m => m.usuario_id)];
    perfiles = await db(env, `perfiles?id=${enLista(ids)}&select=id,nombre,es_admin`);
  }

  return json({
    sesion: { uid: s.uid, nombre: s.nombre, es_admin: s.es_admin },
    establecimientos, perfiles, membresias, lugares, niveles_edificio: niveles,
    objetos, existencias, movimientos
  });
}

async function crearUsuario(env, request) {
  const s = await requerirSesion(env, request);
  if (!s.es_admin) throw new ErrorApi('Solo el administrador general puede crear usuarios.', 403);
  const { email, password, nombre, es_admin } = await leerJson(request);
  if (!email || !password || password.length < 8) throw new ErrorApi('Email y una contraseña de al menos 8 caracteres.');
  const nuevo = await auth(env, 'admin/users', {
    email, password, email_confirm: true, user_metadata: { nombre: (nombre || '').trim() || email }
  });
  if (es_admin) {
    await db(env, `perfiles?id=eq.${validarUUID(nuevo.id)}`, { metodo: 'PATCH', cuerpo: { es_admin: true }, cabeceras: { Prefer: 'return=minimal' } });
  }
  return json({ ok: true, id: nuevo.id });
}

async function sincronizar(env, request) {
  const s = await requerirSesion(env, request);
  const { ops } = await leerJson(request);
  if (!Array.isArray(ops) || ops.length > MAX_OPS) throw new ErrorApi('Demasiados cambios de una vez.');

  // Primero se valida todo; si algo no está permitido, no se escribe nada.
  const c = await precargar(env, ops, s);
  const pend = { lugares: new Map(), objetos: new Map() };   // lo que se crea en este mismo envío
  for (const op of ops) {
    if (op?.op === 'upsert' && (op.tabla === 'lugares' || op.tabla === 'objetos') && op.fila?.id && op.fila?.establecimiento_id)
      pend[op.tabla].set(op.fila.id, op.fila.establecimiento_id);
  }
  const validas = [];
  for (const op of ops) if (autorizar(c, s, op, pend) !== null) validas.push(op);

  // Todo el envío va en una sola llamada a la función de la base (supabase/funciones.sql).
  // Corre en una transacción: si una operación falla, no queda nada a medias.
  const aplicadas = await db(env, 'rpc/aplicar_cambios', {
    metodo: 'POST',
    cuerpo: { ops: validas.map(operacionLimpia) }
  });
  return json({ ok: true, aplicadas: Number(aplicadas) || 0 });
}

export async function onRequest({ request, env, params }) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SESSION_SECRET)
      throw new ErrorApi('El servidor no está configurado.', 500);

    const ruta = '/' + (params.ruta || []).join('/');
    const m = request.method;

    // Los "return await" son necesarios: sin await, el error de estas rutas no pasa por el catch.
    if (ruta === '/login'      && m === 'POST') return await login(env, request);
    if (ruta === '/logout'     && m === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookieSesion('', 0) });
    if (ruta === '/sesion'     && m === 'GET') {
      const s = await sesionActual(env, request);
      return s ? json({ uid: s.uid, nombre: s.nombre, es_admin: s.es_admin }) : json({ error: 'Sin sesión.' }, 401);
    }
    if (ruta === '/datos'      && m === 'GET')  return await datos(env, request);
    if (ruta === '/usuarios'   && m === 'POST') return await crearUsuario(env, request);
    if (ruta === '/sincronizar' && m === 'POST') return await sincronizar(env, request);

    return json({ error: 'Ruta no encontrada.' }, 404);
  } catch (e) {
    if (e instanceof ErrorApi) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Error interno del servidor.' }, 500);
  }
}

// Tablas que el servidor acepta (para que las pruebas comparen con el esquema SQL).
export { TABLAS };
