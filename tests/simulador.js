// Simula la función aplicar_cambios de supabase/funciones.sql sobre un mapa de tablas en memoria.
// Misma regla que en Postgres: upsert por la clave primaria de cada tabla; delete por la clave dada.
const CLAVE = { membresias: ['usuario_id', 'establecimiento_id'], niveles_edificio: ['edificio_id', 'orden'] };

export function aplicarOpsSimuladas(tablas, ops) {
  for (const op of ops) {
    const filas = tablas[op.tabla];
    if (!filas) throw new Error(`Tabla no permitida: ${op.tabla}`);
    const claves = CLAVE[op.tabla] || ['id'];
    if (op.op === 'upsert') {
      const i = filas.findIndex(r => claves.every(c => String(r[c]) === String(op.fila[c])));
      if (i >= 0) filas[i] = { ...filas[i], ...op.fila }; else filas.push({ ...op.fila });
    } else if (op.op === 'delete') {
      const k = filas.filter(r => !claves.every(c => String(r[c]) === String(op.clave[c])));
      filas.splice(0, filas.length, ...k);
    } else {
      throw new Error('Operación inválida');
    }
  }
  return ops.length;
}
