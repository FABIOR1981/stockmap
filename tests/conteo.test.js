// Conteo de un lugar: iguala lo registrado con lo contado y deja un movimiento por cada diferencia.

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
  const ed = dep.crearLugar(null, '1', '').id;
  dep.ponerNivelesTipicos(ed);
  const est = dep.crearArbol(ed, 'A', '', [1, 1]).id;
  const hueco = dep.hijos(dep.hijos(est)[0].id)[0].id;
  return { dep, hueco };
}

test('contar un producto: sube o baja hasta lo contado y deja un movimiento por la diferencia', () => {
  const { dep, hueco } = dep0();
  const caja = dep.crearObjeto('CAJA-1', 'Caja', 'producto').objeto;
  dep.asignar(caja.id, hueco, 5);
  assert.equal(dep.contar(hueco, { [caja.id]: '3' }), null);
  assert.equal(dep.cantidadEn(caja.id, hueco), 3);
  assert.equal(dep.contar(hueco, { [caja.id]: '7' }), null);
  assert.equal(dep.cantidadEn(caja.id, hueco), 7);
  const movs = dep.movimientos.filter(m => m.nota === 'Conteo').map(m => [m.tipo, m.cantidad]);
  assert.deepEqual(movs, [['salida', 2], ['entrada', 4]]);
});

test('lo que hay en el lugar y no se contó queda en 0', () => {
  const { dep, hueco } = dep0();
  const caja = dep.crearObjeto('CAJA-2', 'Caja', 'producto').objeto;
  dep.asignar(caja.id, hueco, 4);
  assert.equal(dep.contar(hueco, {}), null);
  assert.equal(dep.cantidadEn(caja.id, hueco), 0);
});

test('rechaza cantidades vacías, negativas o no enteras, sin cambiar nada', () => {
  const { dep, hueco } = dep0();
  const caja = dep.crearObjeto('CAJA-3', 'Caja', 'producto').objeto;
  dep.asignar(caja.id, hueco, 4);
  assert.match(dep.contar(hueco, { [caja.id]: '' }), /Falta la cantidad/);
  assert.match(dep.contar(hueco, { [caja.id]: '-1' }), /entero, 0 o más/);
  assert.match(dep.contar(hueco, { [caja.id]: '2.5' }), /entero, 0 o más/);
  assert.equal(dep.cantidadEn(caja.id, hueco), 4);
});

test('una unidad se cuenta como está (1) o no está (0), y no puede estar en dos lugares', () => {
  const { dep, hueco } = dep0();
  const ed = dep.lugares.find(l => dep.prof(l) === 0);
  const est2 = dep.crearArbol(ed.id, 'B', '', [1, 1]).id;
  const otro = dep.hijos(dep.hijos(est2)[0].id)[0];
  const unidad = dep.crearObjeto('MAQ-1', 'Máquina', 'unidad').objeto;
  dep.asignar(unidad.id, otro.id);
  assert.match(dep.contar(hueco, { [unidad.id]: '1' }), /otro lugar/);
  assert.equal(dep.contar(otro.id, { [unidad.id]: '0' }), null);
  assert.equal(dep.contar(hueco, { [unidad.id]: '1' }), null);
  assert.equal(dep.cantidadEn(unidad.id, hueco), 1);
});
