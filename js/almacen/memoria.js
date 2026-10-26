// Almacenamiento en memoria.
//
// Contrato que cumple cualquier almacenamiento (memoria, Supabase...):
//   filas(tabla)                  -> array de filas de la tabla
//   insertar(tabla, fila)         -> guarda y devuelve la fila
//   actualizar(tabla, id, cambios)
//   borrarDonde(tabla, predicado)
//   siguiente(secuencia)          -> 1, 2, 3… por secuencia (para ids y códigos)
//   vaciar()                      -> deja todas las tablas y secuencias en cero
//   snapshot() / restaurar(s)     -> copia y vuelta atrás (lo usan las pruebas)
//
// Tablas: 'lugares', 'objetos', 'asignaciones'.
// Hoy las filas son objetos planos en memoria. Con Supabase, cada método
// pasa a ser una consulta asíncrona a la tabla equivalente de supabase/esquema.sql.

export function crearAlmacenMemoria() {
  const vacio = () => ({
    datos: { lugares: [], objetos: [], asignaciones: [] },
    secuencias: {}
  });
  let estado = vacio();
  const copia = v => structuredClone(v);

  return {
    filas: tabla => estado.datos[tabla],

    insertar(tabla, fila) {
      const nueva = { ...fila };
      estado.datos[tabla].push(nueva);
      return nueva;
    },

    actualizar(tabla, id, cambios) {
      const fila = estado.datos[tabla].find(f => f.id === id);
      if (fila) Object.assign(fila, cambios);
      return fila;
    },

    borrarDonde(tabla, predicado) {
      estado.datos[tabla] = estado.datos[tabla].filter(f => !predicado(f));
    },

    siguiente(secuencia) {
      estado.secuencias[secuencia] = (estado.secuencias[secuencia] || 0) + 1;
      return estado.secuencias[secuencia];
    },

    vaciar() { estado = vacio(); },
    snapshot() { return copia(estado); },
    restaurar(s) { estado = copia(s); }
  };
}
