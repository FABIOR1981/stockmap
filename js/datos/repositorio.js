// Acceso a los datos de un depósito. Misma interfaz para la nube y para pruebas.
//   cargar(id)              -> { estado, version }
//   guardar(id, estado, v)  -> nueva versión. Lanza ConflictoVersion si cambió desde que se leyó.

export class ConflictoVersion extends Error {}

export function crearRepositorioNube({ base = '/api/depositos', fetchFn = fetch } = {}) {
  return {
    async cargar(id) {
      const r = await fetchFn(`${base}/${id}`);
      if (!r.ok) throw new Error(`No se pudo cargar el depósito (${r.status})`);
      const fila = await r.json();
      return { estado: fila.estado, version: fila.version };
    },
    async guardar(id, estado, version) {
      const r = await fetchFn(`${base}/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estado, version }),
      });
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
