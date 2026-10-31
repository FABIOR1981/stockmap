// Vencimientos por producto (módulo opcional por cliente): fecha = último ingreso al lugar + días de vida útil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';

const DIA = 86400000;

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
  return { dep, almacen, hueco };
}

test('sin el módulo activado, nada vence aunque el producto tenga días', () => {
  const { dep, hueco } = dep0();
  const caja = dep.crearObjeto('CAJA-V1', 'Caja', 'producto').objeto;
  assert.equal(dep.fijarVencimiento(caja.id, 30), null);
  dep.asignar(caja.id, hueco, 4);
  assert.equal(dep.fechaVence(caja.id, hueco), null);
  assert.deepEqual(dep.porVencer(1000), []);
});

test('con el módulo activado, vence a los días desde el último ingreso', () => {
  const { dep, hueco } = dep0();
  assert.equal(dep.fijarVencimientos(true), null);
  const caja = dep.crearObjeto('CAJA-V2', 'Caja', 'producto').objeto;
  dep.fijarVencimiento(caja.id, 30);
  dep.asignar(caja.id, hueco, 4);
  const f = dep.fechaVence(caja.id, hueco);
  assert.ok(Math.abs(f - (Date.now() + 30 * DIA)) < 60000);
  assert.equal(dep.proximoVencimiento(caja.id).vencido, false);
  assert.equal(dep.porVencer(7).length, 0);
  assert.equal(dep.porVencer(40).length, 1);
});

test('lo ya vencido aparece como vencido y en la lista por vencer', () => {
  const { dep, almacen, hueco } = dep0();
  dep.fijarVencimientos(true);
  const caja = dep.crearObjeto('CAJA-V3', 'Caja', 'producto').objeto;
  dep.fijarVencimiento(caja.id, 5);
  dep.asignar(caja.id, hueco, 4);
  const entrada = dep.movimientos.find(m => m.oid === caja.id && m.tipo === 'entrada');
  almacen.actualizar('movimientos', entrada.id, { fecha: '2020-01-01T00:00:00.000Z' });
  assert.equal(dep.proximoVencimiento(caja.id).vencido, true);
  const lista = dep.porVencer(7);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].vencido, true);
});

test('quitar stock del lugar deja de contar su vencimiento', () => {
  const { dep, hueco } = dep0();
  dep.fijarVencimientos(true);
  const caja = dep.crearObjeto('CAJA-V4', 'Caja', 'producto').objeto;
  dep.fijarVencimiento(caja.id, 10);
  dep.asignar(caja.id, hueco, 2);
  dep.liberar(caja.id, hueco);
  assert.equal(dep.proximoVencimiento(caja.id), null);
});

test('solo productos pueden vencer, con días enteros positivos', () => {
  const { dep } = dep0();
  dep.fijarVencimientos(true);
  const unidad = dep.crearObjeto('MAQ-V1', 'Máquina', 'unidad').objeto;
  assert.match(dep.fijarVencimiento(unidad.id, 10), /Solo los productos/);
  const caja = dep.crearObjeto('CAJA-V5', 'Caja', 'producto').objeto;
  assert.match(dep.fijarVencimiento(caja.id, '0'), /entero mayor que 0/);
  assert.match(dep.fijarVencimiento(caja.id, '2,5'), /entero mayor que 0/);
});

test('solo el administrador general puede activar vencimientos', () => {
  const { dep, almacen } = dep0();
  almacen.insertar('usuarios', { id: 'u2', nombre: 'Otro', es_admin: false });
  dep.uid = 'u2';
  assert.match(dep.fijarVencimientos(true), /Solo el administrador general/);
});
