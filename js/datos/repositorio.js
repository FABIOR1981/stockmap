// Acceso a los datos de un depósito. Misma interfaz para la nube y para pruebas.
//   cargar(id)              -> { estado, version }
//   guardar(id, estado, v)  -> nueva versión. Lanza ConflictoVersion si cambió desde que se leyó.
//   Errores: SesionVencida (hay que volver a ingresar), ConflictoVersion.

export class ConflictoVersion extends Error {}
export class SesionVencida extends Error {}

// sesion: { token, nombre, rol } o null. Se pasa una función para leer la sesión actual.
export function crearRepositorioNube({ base = '/api/depositos', fetchFn = fetch, sesion = () => null } = {}) {
  const cabeceras = (extra = {}) => {
    const s = sesion();
    return { ...extra, ...(s?.token ? { authorization: `Bearer ${s.token}` } : {}) };
  };
  const revisar = (r) => {
    if (r.status === 401) throw new SesionVencida('Tu sesión venció. Volvé a ingresar.');
  };

  return {
    async ingresar(id, nombre, pin) {
      const r = await fetchFn(`${base}/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre, pin }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo.error || `No se pudo ingresar (${r.status})`);
      return { token: cuerpo.token, nombre: cuerpo.usuario.nombre, rol: cuerpo.usuario.rol };
    },
    async cargar(id) {
      const r = await fetchFn(`${base}/${id}`, { headers: cabeceras() });
      revisar(r);
      if (!r.ok) throw new Error(`No se pudo cargar el depósito (${r.status})`);
      const fila = await r.json();
      return { estado: fila.estado, version: fila.version };
    },
    async guardar(id, estado, version) {
      const r = await fetchFn(`${base}/${id}`, {
        method: 'PUT',
        headers: cabeceras({ 'content-type': 'application/json' }),
        body: JSON.stringify({ estado, version }),
      });
      revisar(r);
      if (r.status === 409) {
        const cuerpo = await r.json().catch(() => ({}));
        throw new ConflictoVersion(cuerpo.error || 'El depósito cambió');
      }
      if (!r.ok) throw new Error(`No se pudo guardar (${r.status})`);
      const cuerpo = await r.json();
      return cuerpo.version;
    },
  };
}

// Para pruebas y para trabajar sin conexión en una sola sesión.
export function crearRepositorioMemoria(iniciales = {}) {
  const datos = new Map(Object.entries(iniciales).map(([id, v]) => [id, structuredClone(v)]));
  return {
    async cargar(id) {
      const d = datos.get(id);
      if (!d) throw new Error('Depósito inexistente');
      return structuredClone(d);
    },
    async guardar(id, estado, version) {
      const d = datos.get(id);
      if (!d) throw new Error('Depósito inexistente');
      if (d.version !== version) throw new ConflictoVersion('El depósito cambió');
      datos.set(id, { estado: structuredClone(estado), version: version + 1 });
      return version + 1;
    },
  };
}
