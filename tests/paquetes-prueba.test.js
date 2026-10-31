// Paquetes de prueba: 12 objetos PEND-01 a PEND-12, pendientes de asignación, y vuelta a pendientes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';

function dep0() {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  almacen.insertar('usuarios', { id: 'u1', nombre: 'Fabio', es_admin: true });
  dep.uid = 'u1';
  dep.elegirEstablecimiento(dep.crearEstablecimiento('Cliente').establecimiento.id);
  return dep;
}
const pendientes = dep => dep.objetos.filter(o => dep.ubicacionesDe(o.id).length === 0);

test('se agregan 12 paquetes de prueba, todos pendientes de asignación, y no se repiten', () => {
  const dep = dep0();
  assert.equal(dep.cargarPaquetesPrueba().creados, 12);
  assert.equal(pendientes(dep).length, 12);
  assert.equal(dep.cargarPaquetesPrueba().creados, 0);
  assert.equal(dep.objetos.length, 12);
});

test('devolver a pendientes saca los paquetes de prueba de sus lugares y no toca otros objetos', () => {
  const dep = dep0();
  const ed = dep.crearLugar(null, '1', '').id;
  dep.ponerNivelesTipicos(ed);
  const est = dep.crearArbol(ed, 'A', '', [1, 1]).id;
  const hueco = dep.hijos(dep.hijos(est)[0].id)[0].id;   // estante > hueco
  dep.cargarPaquetesPrueba();
  const otro = dep.crearObjeto('REAL-1', 'Objeto real').objeto;
  dep.asignar(otro.id, hueco);
  const p1 = dep.objetos.find(o => o.codigo_propio === 'PEND-01');
  const p2 = dep.objetos.find(o => o.codigo_propio === 'PEND-02');
  dep.asignar(p1.id, hueco);
  dep.asignar(p2.id, hueco);
  assert.equal(pendientes(dep).length, 10);
  const r = dep.devolverPaquetesPrueba();
  assert.equal(r.error, undefined);
  assert.equal(pendientes(dep).length, 12);
  assert.equal(dep.ubicacionesDe(otro.id).length, 1, 'el objeto real sigue en su lugar');
});

test('ubicar en lugares al azar pone cada paquete sin lugar en un lugar válido, y no mueve los que ya tienen lugar', () => {
  const dep = dep0();
  const ed = dep.crearLugar(null, '1', '').id;
  dep.ponerNivelesTipicos(ed);
  dep.crearArbol(ed, 'A', '', [1, 1]);
  dep.cargarPaquetesPrueba();
  const ya = dep.objetos.find(o => o.codigo_propio === 'PEND-03');
  const hueco = dep.lugares.find(l => typeof dep.lugarDestino(l.id) !== 'string');
  dep.asignar(ya.id, hueco.id);
  const antes = dep.ubicacionesDe(ya.id).map(l => l.id);
  const r = dep.ubicarPaquetesPrueba();
  assert.equal(r.error, undefined);
  assert.equal(r.noPudieron, 0);
  assert.equal(pendientes(dep).length, 0);
  for (const o of dep.objetos.filter(o => o.codigo_propio.startsWith('PEND-'))) {
    assert.ok(dep.ubicacionesDe(o.id).length >= 1, `${o.codigo_propio} tiene lugar`);
  }
  assert.deepEqual(dep.ubicacionesDe(ya.id).map(l => l.id), antes);
});
