// Traducción modelo <-> Supabase y cálculo de cambios. Ejecutar con npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb, aEstadoModelo, calcularOperaciones } from '../js/almacen/nube.js';

// Pasa los mapas a arreglos de filas, como las devuelve el servidor.
const aDatos = mapas => Object.fromEntries(Object.entries(mapas).map(([t, m]) => [t, [...m.values()]]));

function ejemplo() {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  dep.cargarEjemplo();
  return { almacen, dep };
}

test('ida y vuelta: cargar desde el servidor reproduce el mismo estado', () => {
  const { almacen } = ejemplo();
  const original = aFilasDb(almacen);
  const nuevo = crearAlmacenMemoria();
  nuevo.restaurar(aEstadoModelo(aDatos(original)));
  const ida = aFilasDb(nuevo);
  for (const t of Object.keys(original)) {
    assert.deepEqual([...ida[t].values()], [...original[t].values()], `tabla ${t}`);
  }
});

test('sin cambios no se envía nada', () => {
  const { almacen } = ejemplo();
  const base = aFilasDb(almacen);
  assert.deepEqual(calcularOperaciones(base, aFilasDb(almacen)), []);
});

test('un lugar nuevo se envía como alta; un borrado, como baja', () => {
  const { almacen, dep } = ejemplo();
  const base = aFilasDb(almacen);
  const edificio = dep.hijos(null)[0];
  dep.crearLugar(edificio.id, 'Z');
  const ops = calcularOperaciones(base, aFilasDb(almacen));
  assert.ok(ops.some(o => o.op === 'upsert' && o.tabla === 'lugares' && o.fila.codigo === 'Z'));
});

test('las altas van en orden: edificio, niveles, hijos, luego stock', () => {
  const { almacen, dep } = ejemplo();
  const base = aFilasDb(almacen);
  const ed = dep.crearLugar(null, '7').id;
  dep.ponerNivelesTipicos(ed);
  const est = dep.crearLugar(ed, 'A').id;
  dep.crearLugar(est, '1');
  const ops = calcularOperaciones(base, aFilasDb(almacen));
  const indice = (tabla, pred) => ops.findIndex(o => o.op === 'upsert' && o.tabla === tabla && pred(o.fila));
  const iEdificio = indice('lugares', f => f.id === ed);
  const iNivel = indice('niveles_edificio', f => f.edificio_id === ed);
  const iHijo = indice('lugares', f => f.padre_id === ed);
  assert.ok(iEdificio < iNivel && iNivel < iHijo, `orden ${iEdificio} ${iNivel} ${iHijo}`);
});

test('borrar un lugar envía primero sus hijos y después el lugar', () => {
  const { almacen, dep } = ejemplo();
  const ed = dep.crearLugar(null, '8').id;
  dep.ponerNivelesTipicos(ed);
  const est = dep.crearLugar(ed, 'A').id;
  dep.crearLugar(est, '1');
  const base = aFilasDb(almacen);
  assert.equal(dep.borrarLugar(ed), null);
  const ops = calcularOperaciones(base, aFilasDb(almacen));
  const bajas = ops.filter(o => o.op === 'delete' && o.tabla === 'lugares').map(o => o.clave.id);
  assert.equal(bajas.at(-1), ed, 'el edificio va al final');
  assert.ok(bajas.length > 1);
});
