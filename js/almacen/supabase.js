// Almacenamiento con Supabase: PENDIENTE.
//
// Debe cumplir el mismo contrato que js/almacen/memoria.js. La diferencia
// es que cada método será asíncrono (async/await) y las reglas del modelo
// (js/core/deposito.js) pasarán a esperar esas llamadas.
//
// Mapeo previsto a supabase/esquema.sql:
//   'lugares'       -> tabla lugares (+ niveles_edificio, hoy guardados dentro de cada edificio)
//   'objetos'       -> tabla objetos (el código interno lo genera la secuencia objetos_seq)
//   'asignaciones'  -> tabla asignaciones (unique por lugar; los triggers validan las reglas)
//
// Las reglas de negocio ya están duplicadas en la base (triggers validar_lugar y
// validar_asignacion), así que la interfaz puede mostrar el error que devuelva Supabase.

export function crearAlmacenSupabase(/* { url, clave, establecimientoId } */) {
  throw new Error('El almacenamiento con Supabase todavía no está implementado. Usá crearAlmacenMemoria().');
}
