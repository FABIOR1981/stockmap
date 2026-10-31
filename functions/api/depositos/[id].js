// API de un depósito. Solo el servidor habla con Supabase (clave de servicio en el entorno).
// GET  /api/depositos/:id           -> { id, nombre, estado, version }
// PUT  /api/depositos/:id           -> body { estado, version } guarda si la versión coincide.
//                                      409 si alguien guardó antes.

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

// Validación mínima de forma. La validación de reglas está en js/dominio.
const formaValida = (estado) =>
  estado &&
  typeof estado === 'object' &&
  estado.cliente && Array.isArray(estado.cliente.niveles) &&
  estado.lugares && estado.objetos && estado.codigos &&
  estado.ubicaciones && Array.isArray(estado.auditoria);

export async function onRequestGet({ params, env }) {
  if (!UUID.test(params.id)) return json({ error: 'Id inválido' }, 400);
  const r = await supabase(env, `depositos?id=eq.${params.id}&select=id,nombre,estado,version`);
  if (!r.ok) return json({ error: 'No se pudo leer el depósito' }, 502);
  const [fila] = await r.json();
  if (!fila) return json({ error: 'Depósito inexistente' }, 404);
  return json(fila);
}

export async function onRequestPut({ params, env, request }) {
  if (!UUID.test(params.id)) return json({ error: 'Id inválido' }, 400);
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
  // La actualización solo aplica si la versión de la base sigue siendo la que se leyó.
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

  // Nada cambió: o no existe, o alguien guardó antes.
  const actual = await supabase(env, `depositos?id=eq.${params.id}&select=version`);
  const [existe] = await actual.json();
  if (!existe) return json({ error: 'Depósito inexistente' }, 404);
  return json({ error: 'Conflicto: el depósito cambió. Recargá y volvé a intentar.', version: existe.version }, 409);
}
