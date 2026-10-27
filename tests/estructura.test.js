// Estructura del edificio: al crear un lugar se pueden crear también sus hijos y nietos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';

function depConEdificio() {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  almacen.insertar('usuarios', { id: 'u1', nombre: 'Fabio', es_admin: true });
  dep.uid = 'u1';
  const cliente = dep.crearEstablecimiento('Cliente');
  dep.elegirEstablecimiento(cliente.establecimiento.id);
  const ed = dep.crearLugar(null, '1', '');
  dep.ponerNivelesTipicos(ed.id);   // Estantería (A…) › Estante (1…) › División (a…)
  return { dep, ed: ed.id };
}

test('una estantería con estructura crea estantes y divisiones', () => {
  const { dep, ed } = depConEdificio();
  const r = dep.crearArbol(ed, 'A', '', [2, 3]);
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.creados, 1 + 2 + 2 * 3);   // la estantería, 2 estantes, 3 divisiones por estante
  const estantes = dep.hijos(r.id).map(l => l.codigo);
  assert.deepEqual(estantes, ['1', '2']);
  const divisiones = dep.hijos(dep.hijos(r.id)[0].id).map(l => l.codigo);
  assert.deepEqual(divisiones, ['a', 'b', 'c']);
});

test('sin estructura crea solo la estantería', () => {
  const { dep, ed } = depConEdificio();
  const r = dep.crearArbol(ed, 'A', '', []);
  assert.equal(r.creados, 1);
  assert.equal(dep.hijos(r.id).length, 0);
});

test('no se puede dar más niveles de los que define el edificio', () => {
  const { dep, ed } = depConEdificio();
  const r = dep.crearArbol(ed, 'A', '', [2, 3, 4]);
  assert.ok(r.error, 'tiene que rechazar una estructura más profunda que el edificio');
  assert.equal(dep.lugares.length, 1, "no se tiene que crear nada");
});

test('cantidades vacías o cero se rechazan', () => {
  const { dep, ed } = depConEdificio();
  assert.ok(dep.crearArbol(ed, 'A', '', [0, 3]).error);
  assert.ok(dep.crearArbol(ed, 'A', '', [NaN, 3]).error);
});

test('crear varios con estructura hace clones de la misma estructura', () => {
  const { dep, ed } = depConEdificio();
  const r = dep.crearLote(ed, 'A', 'C', [2, 2]);
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.creados, 3 * (1 + 2 + 4));
  const estanterias = dep.hijos(ed).map(l => l.codigo);
  assert.deepEqual(estanterias, ['A', 'B', 'C']);
  for (const e of dep.hijos(ed)) assert.equal(dep.hijos(e.id).length, 2);
});
