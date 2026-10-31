// Las estanterías no pueden salir del galpón: límites según sus medidas y giro.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limitesDentroDelGalpon, dentroDe } from '../js/ui/recorrido/ruta.js';

const h0 = { ex: 0.45, ez: 1.1 };   // estantería mirando al frente
test('el centro de la estantería queda a media huella de cada pared', () => {
  const l = limitesDentroDelGalpon(20, 40, h0);
  assert.deepEqual([l.x0, l.x1], [-9.55, 9.55]);
  assert.deepEqual([l.z0, l.z1], [-38.9, -1.1]);
});
test('dentroDe acerca el valor al intervalo, y si no entra lo deja al centro', () => {
  assert.equal(dentroDe(15, -9, 9), 9);
  assert.equal(dentroDe(-3, -9, 9), -3);
  assert.equal(dentroDe(2, 4, 0), 2);
});
