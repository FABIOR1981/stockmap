// Posición libre de los lugares en el plano: se guarda en el modelo y viaja a la base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb } from '../js/almacen/nube.js';

function depConEdificio() {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  almacen.insertar('usuarios', { id: 'u1', nombre: 'Fabio', es_admin: true });
  dep.uid = 'u1';
  const cliente = dep.crearEstablecimiento('Cliente');
  dep.elegirEstablecimiento(cliente.establecimiento.id);
  const ed = dep.crearLugar(null, '1', '');
  dep.ponerNivelesTipicos(ed.id);
  return { dep, almacen, ed: ed.id };
}

test('un lugar de cualquier nivel se puede posicionar y la posición se guarda', () => {
  const { dep, almacen, ed } = depConEdificio();
  const est = dep.crearArbol(ed, 'A', '', [2]).id;
  assert.equal(dep.posicionar(est, 300, 120), null);
  assert.equal(dep.porId(est).pos_x, 300);
  assert.equal(dep.porId(est).pos_y, 120);
  // La fila que se envía al servidor lleva la posición.
  const fila = aFilasDb(almacen).lugares.get(est);
  assert.equal(fila.pos_x, 300);
  assert.equal(fila.pos_y, 120);
});

test('una posición inválida no se guarda', () => {
  const { dep, ed } = depConEdificio();
  assert.ok(dep.posicionar(ed, -5, 10));
  assert.ok(dep.posicionar(ed, 1.5, 10));
  assert.equal(dep.porId(ed).pos_x, undefined);
});
