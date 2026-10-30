// Medidas del edificio (ancho, largo, alto en cm): solo edificios, todas o ninguna, y viajan a la base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb } from '../js/almacen/nube.js';

function dep0() {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  almacen.insertar('usuarios', { id: 'u1', nombre: 'Fabio', es_admin: true });
  dep.uid = 'u1';
  const cliente = dep.crearEstablecimiento('Cliente');
  dep.elegirEstablecimiento(cliente.establecimiento.id);
  return { dep, almacen };
}

test('un edificio se puede crear con ancho, largo y alto', () => {
  const { dep } = dep0();
  const r = dep.crearLugar(null, '1', '', { ancho: 2000, largo: 4000, alto: 800 });
  assert.equal(r.error, undefined);
  const ed = dep.porId(r.id);
  assert.deepEqual([ed.dim_ancho, ed.dim_largo, ed.dim_alto], [2000, 4000, 800]);
});

test('sin medidas el edificio se crea igual, sin campos de medida', () => {
  const { dep } = dep0();
  const ed = dep.porId(dep.crearLugar(null, '1', '').id);
  assert.equal(ed.dim_ancho, undefined);
});

test('las medidas se rechazan en lugares que no son edificios, y si son incompletas o no válidas', () => {
  const { dep } = dep0();
  const ed = dep.crearLugar(null, '1', '').id;
  assert.ok(dep.crearLugar(ed, 'A', '', { ancho: 100, largo: 100, alto: 100 }).error);
  assert.ok(dep.crearLugar(null, '2', '', { ancho: 100, largo: null, alto: 100 }).error);
  assert.ok(dep.crearLugar(null, '3', '', { ancho: 0, largo: 100, alto: 100 }).error);
});

test('las medidas viajan a la base al sincronizar', () => {
  const { dep, almacen } = dep0();
  const id = dep.crearLugar(null, '1', '', { ancho: 2000, largo: 4000, alto: 800 }).id;
  const filas = aFilasDb(almacen).lugares.get(id);
  assert.deepEqual([filas.dim_ancho, filas.dim_largo, filas.dim_alto], [2000, 4000, 800]);
});
