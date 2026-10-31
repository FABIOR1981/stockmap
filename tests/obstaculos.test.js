// Cajas del piso: al azar pero repetibles, dentro de la zona y sin tocar lo que hay que evitar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarCajas, semillaDe } from '../js/ui/recorrido/obstaculos.js';

const zona = { x0: -5, x1: 5, z0: -14, z1: -2 };
const evitar = [{ x: 0, z: -6, ex: 0.5, ez: 1.1 }, { x: -3, z: -10, ex: 0.5, ez: 1.1 }];

test('la misma semilla da la misma distribución', () => {
  const s = semillaDe('edificio-1');
  assert.deepEqual(generarCajas({ semilla: s, zona, evitar }), generarCajas({ semilla: s, zona, evitar }));
});

test('las cajas quedan dentro de la zona y no tocan lo que hay que evitar', () => {
  const cajas = generarCajas({ semilla: 7, zona, evitar, cantidad: 12 });
  assert.ok(cajas.length > 0);
  for (const c of cajas) {
    assert.ok(c.x - c.w / 2 >= zona.x0 - 1e-9 && c.x + c.w / 2 <= zona.x1 + 1e-9);
    assert.ok(c.z - c.d / 2 >= zona.z0 - 1e-9 && c.z + c.d / 2 <= zona.z1 + 1e-9);
    for (const e of evitar) {
      assert.ok(Math.abs(c.x - e.x) >= e.ex + c.w / 2 || Math.abs(c.z - e.z) >= e.ez + c.d / 2, 'una caja toca una estantería');
    }
  }
});

test('las cajas no se superponen entre sí', () => {
  const cajas = generarCajas({ semilla: 3, zona, evitar, cantidad: 12 });
  for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
    const a = cajas[i], b = cajas[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2, 'dos cajas se superponen');
  }
});
