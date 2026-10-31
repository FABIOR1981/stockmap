// Qué puede cambiar cada rol. El servidor compara el estado guardado con el que llega.
//   administrador: todo.
//   supervisor:    estructura (lugares), objetos y ubicaciones.
//   operario:      solo ubicaciones (ubicar, mover, sacar, conteo) y auditoría.
// En todos los roles la auditoría solo puede crecer: no se borra ni se modifica.

const iguales = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));

function ordenar(v) {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => ({ ...o, [k]: ordenar(v[k]) }), {});
  }
  return v;
}

const PUEDE = {
  administrador: { cliente: true, lugares: true, objetos: true, ubicaciones: true },
  supervisor: { cliente: false, lugares: true, objetos: true, ubicaciones: true },
  operario: { cliente: false, lugares: false, objetos: false, ubicaciones: true },
};

// Devuelve { ok: true } o { ok: false, motivo }.
export function cambiosPermitidos(anterior, nuevo, rol) {
  const permisos = PUEDE[rol];
  if (!permisos) return { ok: false, motivo: 'Rol inexistente' };

  // Auditoría: solo se agregan entradas al final.
  const audAnterior = anterior.auditoria || [];
  const audNueva = nuevo.auditoria || [];
  if (audNueva.length < audAnterior.length) return { ok: false, motivo: 'La auditoría no puede borrarse' };
  for (let i = 0; i < audAnterior.length; i++) {
    if (!iguales(audAnterior[i], audNueva[i])) return { ok: false, motivo: 'La auditoría no puede modificarse' };
  }

  const bloques = [
    ['cliente', 'cambiar el nombre o los niveles del depósito'],
    ['lugares', 'cambiar la estructura'],
    ['objetos', 'crear o cambiar objetos'],
    ['ubicaciones', 'ubicar o mover objetos'],
  ];
  for (const [clave, accion] of bloques) {
    if (!iguales(anterior[clave], nuevo[clave]) && !permisos[clave]) {
      return { ok: false, motivo: `Tu rol no puede ${accion}` };
    }
  }
  // codigos cambian junto con objetos: mismo permiso.
  if (!iguales(anterior.codigos, nuevo.codigos) && !permisos.objetos) {
    return { ok: false, motivo: 'Tu rol no puede crear o cambiar objetos' };
  }
  return { ok: true };
}
