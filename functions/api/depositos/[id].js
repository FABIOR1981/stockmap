// API de un depósito. Solo el servidor habla con Supabase (claves en el entorno).
// POST /api/depositos/:id           body { nombre, pin }        -> { token, usuario }   (ingreso)
// GET  /api/depositos/:id           header Authorization        -> { id, nombre, estado, version }
// PUT  /api/depositos/:id           header Authorization, body { estado, version }
//                                   409 si alguien guardó antes; 403 si el rol no puede ese cambio.

import { verificarPin, firmarToken, verificarToken } from '../../../lib/seguridad.js';
import { cambiosPermitidos } from '../../../lib/permisos.js';

const MAX_FALLOS = 5;
const BLOQUEO_SEG = 15 * 60;

const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = (env, ruta, init = {}) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });

// Validación mínima de forma. Las reglas del depósito están en js/dominio.
const formaValida = (estado) =>
  estado &&
  typeof estado === 'object' &&
  estado.cliente && Array.isArray(estado.cliente.niveles) &&
  estado.lugares && estado.objetos && estado.codigos &&
  estado.ubicaciones && Array.isArray(estado.auditoria);

// Devuelve el payload de la sesión si el token es de este depósito; si no, null.
async function sesionDe(request, env, depositoId) {
  const cabecera = request.headers.get('authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
  const payload = await verificarToken(token, env.SESION_SECRET);
  return payload && payload.d === depositoId ? payload : null;
}

const sinSesion = () => json({ error: 'Sesión inexistente o vencida' }, 401);

// Intentos fallidos por depósito y nombre. Tras MAX_FALLOS, bloqueo por BLOQUEO_SEG.
async function intentosDe(env, clave) {
  const r = await supabase(env, `intentos_ingreso?clave=eq.${encodeURIComponent(clave)}&select=fallos,hasta`);
  if (!r.ok) return null;
  const [fila] = await r.json();
  return fila || { fallos: 0, hasta: null };
}

async function registrarFallo(env, clave, fila) {
  const fallos = (fila?.fallos || 0) + 1;
  const bloqueado = fallos >= MAX_FALLOS;
  await supabase(env, 'intentos_ingreso?on_conflict=clave', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      clave,
      fallos: bloqueado ? 0 : fallos,
      hasta: bloqueado ? new Date(Date.now() + BLOQUEO_SEG * 1000).toISOString() : null,
    }),
  });
}

async function limpiarIntentos(env, clave) {
  await supabase(env, `intentos_ingreso?clave=eq.${encodeURIComponent(clave)}`, {
    method: 'DELETE',
    headers: { prefer: 'return=minimal' },
  });
}

export async function onRequestPost({ params, env, request }) {
  if (!UUID.test(params.id)) return json({ error: 'Id inválido' }, 400);
  if (!env.SESION_SECRET) return json({ error: 'Configuración incompleta' }, 500);
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }
  const nombre = String(cuerpo?.nombre || '').trim();
  const pin = String(cuerpo?.pin || '');
  const fallo = () => json({ error: 'Nombre o PIN incorrectos' }, 401);
  if (!nombre || !pin) return fallo();

  const clave = `${params.id}:${nombre.toLowerCase()}`;
  const intentos = await intentosDe(env, clave);
  if (intentos === null) return json({ error: 'No se pudo ingresar' }, 502);
  if (intentos.hasta && new Date(intentos.hasta) > new Date()) {
    return json({ error: 'Demasiados intentos. Esperá 15 minutos y volvé a probar.' }, 429);
  }

  const r = await supabase(
    env,
    `usuarios?deposito_id=eq.${params.id}&nombre=eq.${encodeURIComponent(nombre)}&select=id,nombre,rol,pin_hash`,
  );
  if (!r.ok) return json({ error: 'No se pudo ingresar' }, 502);
  const [usuario] = await r.json();
  if (!usuario || !(await verificarPin(pin, usuario.pin_hash))) {
    await registrarFallo(env, clave, intentos);
    return fallo();
  }

  await limpiarIntentos(env, clave);
  const token = await firmarToken(
    { d: params.id, u: usuario.id, n: usuario.nombre, r: usuario.rol },
    env.SESION_SECRET,
  );
  return json({ token, usuario: { nombre: usuario.nombre, rol: usuario.rol } });
}

export async function onRequestGet({ params, env, request }) {
  if (!UUID.test(params.id)) return json({ error: 'Id inválido' }, 400);
  if (!(await sesionDe(request, env, params.id))) return sinSesion();
  const r = await supabase(env, `depositos?id=eq.${params.id}&select=id,nombre,estado,version`);
  if (!r.ok) return json({ error: 'No se pudo leer el depósito' }, 502);
  const [fila] = await r.json();
  if (!fila) return json({ error: 'Depósito inexistente' }, 404);
  return json(fila);
}

export async function onRequestPut({ params, env, request }) {
  if (!UUID.test(params.id)) return json({ error: 'Id inválido' }, 400);
  const sesion = await sesionDe(request, env, params.id);
  if (!sesion) return sinSesion();

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }
  const { estado, version } = cuerpo || {};
  if (!formaValida(estado) || !Number.isInteger(version)) {
    return json({ error: 'Faltan estado o versión' }, 400);
  }

  // Estado guardado: para comparar qué cambia y verificar la versión.
  const actual = await supabase(env, `depositos?id=eq.${params.id}&select=estado,version`);
  if (!actual.ok) return json({ error: 'No se pudo leer el depósito' }, 502);
  const [guardado] = await actual.json();
  if (!guardado) return json({ error: 'Depósito inexistente' }, 404);
  if (guardado.version !== version) {
    return json({ error: 'Conflicto: el depósito cambió. Recargá y volvé a intentar.', version: guardado.version }, 409);
  }

  const permiso = cambiosPermitidos(guardado.estado, estado, sesion.r);
  if (!permiso.ok) return json({ error: permiso.motivo }, 403);

  // La actualización solo aplica si la versión sigue siendo la leída.
  const r = await supabase(env, `depositos?id=eq.${params.id}&version=eq.${version}`, {
    method: 'PATCH',
    body: JSON.stringify({
      estado,
      version: version + 1,
      actualizado: new Date().toISOString(),
    }),
  });
  if (!r.ok) return json({ error: 'No se pudo guardar' }, 502);
  const [fila] = await r.json();
  if (fila) return json({ id: fila.id, version: fila.version });
  return json({ error: 'Conflicto: el depósito cambió. Recargá y volvé a intentar.' }, 409);
}
