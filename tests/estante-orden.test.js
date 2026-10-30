// Los huecos de un estante se leen de izquierda a derecha desde el pasillo, en ambos lados del depósito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posicionEnEstante } from '../js/ui/recorrido/escena.js';

test('lado izquierdo: el hueco 1 queda a la izquierda', () => {
  assert.equal(posicionEnEstante(0, 3, 1), 0);
  assert.equal(posicionEnEstante(2, 3, 1), 2);
});

test('lado derecho: el hueco 1 también queda a la izquierda (visto desde el pasillo)', () => {
  assert.equal(posicionEnEstante(0, 3, -1), 2);   // el primero va en el extremo de la derecha de la posición de z
  assert.equal(posicionEnEstante(2, 3, -1), 0);
});
