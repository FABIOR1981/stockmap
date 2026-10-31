// Medidas del galpón: lectura del formulario (metros) y validación (centímetros).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metrosACm, validarMedidas } from '../js/core/medidas.js';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';

test('metros con coma o punto pasan a centímetros enteros', () => {
  assert.deepEqual(metrosACm('20', '40,5', '8.25'), { ancho: 2000, largo: 4050, alto: 825 });
});
test('vacío es "sin medidas"; incompleto o no numérico es error', () => {
  assert.equal(metrosACm('', ' ', null), null);
  assert.ok(metrosACm('20', '', '8').error);
  assert.ok(metrosACm('veinte', '40', '8').error);
});
test('validarMedidas: todas o ninguna, enteros de 1 cm o más', () => {
  assert.deepEqual(validarMedidas({ ancho: 1, largo: 2, alto: 3 }).valores, { dim_ancho: 1, dim_largo: 2, dim_alto: 3 });
  assert.equal(validarMedidas(null).valores, null);
  assert.ok(validarMedidas({ ancho: 1, largo: null, alto: 3 }).error);
  assert.ok(validarMedidas({ ancho: 0, largo: 2, alto: 3 }).error);
});

test('medirEdificio guarda las medidas de un edificio ya creado y no acepta lugares que no son edificios', () => {
  const almacen = crearAlmacenMemoria();
  const dep = new Deposito(almacen);
  almacen.insertar('usuarios', { id: 'u1', nombre: 'Fabio', es_admin: true });
  dep.uid = 'u1';
  dep.elegirEstablecimiento(dep.crearEstablecimiento('Cliente').establecimiento.id);
  const ed = dep.crearLugar(null, '1', '').id;
  const est = dep.crearArbol(ed, 'A', '', []).id;
  assert.equal(dep.medirEdificio(ed, { ancho: 1200, largo: 1600, alto: 800 }), null);
  assert.deepEqual([dep.porId(ed).dim_ancho, dep.porId(ed).dim_largo, dep.porId(ed).dim_alto], [1200, 1600, 800]);
  assert.ok(dep.medirEdificio(est, { ancho: 1, largo: 1, alto: 1 }));
});
