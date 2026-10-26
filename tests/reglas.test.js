// Ejecutar con: npm test  (requiere Node 18 o superior)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { correrPruebas } from '../js/core/pruebas.js';

const resultados = correrPruebas(new Deposito(crearAlmacenMemoria()));

for (const p of resultados) {
  test(p.nombre, () => assert.ok(p.ok, `falla: ${p.nombre}`));
}
