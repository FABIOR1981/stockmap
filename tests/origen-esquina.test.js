// Conversión entre la posición guardada (desde la esquina del galpón) y la posición centrada que usa el recorrido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aEsquinaCm, desdeEsquinaCm } from '../js/core/medidas.js';

test('una estantería centrada en un galpón de 12 m queda a 6 m desde la esquina', () => {
  assert.equal(aEsquinaCm(0, 1200), 600);       // justo en el medio
  assert.equal(aEsquinaCm(-600, 1200), 0);      // pegada a la pared izquierda
  assert.equal(aEsquinaCm(550, 1200), 1150);    // pegada a la pared derecha (menos su margen)
});

test('la conversión es ida y vuelta', () => {
  for (const x of [-500, -120, 0, 75, 540]) {
    assert.equal(desdeEsquinaCm(aEsquinaCm(x, 1100), 1100), x);
  }
});

test('sin medidas la posición no cambia', () => {
  assert.equal(aEsquinaCm(-230, 0), -230);
  assert.equal(desdeEsquinaCm(-230, 0), -230);
});
