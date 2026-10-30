// Ruta del Pasear: por el piso, sin atravesar estanterías.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRuta } from '../js/ui/ruta.js';

const medidas = giro => (giro % 2 === 0 ? { ex: 0.45, ez: 1.1 } : { ex: 1.1, ez: 0.45 });

// Dos estanterías de 2.2 m (largo) x 0.9 m (fondo), enfrentadas y con el pasillo en x = 0.
// Giro 0: el largo va en z. Estante de la izquierda en x = -1.85, la de la derecha en x = +1.85.
const disp = new Map([
  ['izq', { x: -1.85, z: -3, giro: 0 }],
  ['der', { x: 1.85, z: -3, giro: 0 }],
  ['izq2', { x: -1.85, z: -9, giro: 0 }],
  ['der2', { x: 1.85, z: -9, giro: 0 }],
]);
const dentroDeAlguna = (p) => [...disp.values()].some(d => Math.abs(p.x - d.x) < 0.45 + 0.3 && Math.abs(p.z - d.z) < 1.1 + 0.3);

function caminoValido(desde, pts) {
  let a = desde;
  for (const b of pts) {
    for (let k = 0; k <= 50; k++) {
      const t = k / 50;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (dentroDeAlguna(p)) return false;
    }
    a = b;
  }
  return true;
}

test('desde el pasillo hasta el frente de una estantería del otro lado, no atraviesa las de por medio', () => {
  const desde = { x: 0, z: 0.5 };
  const hasta = { x: 1.2 + 0.45 + 0.4, z: -5.5 };   // frente a una estantería de la derecha (lado del pasillo)
  const ruta = calcularRuta(disp, desde, hasta, medidas);
  assert.ok(caminoValido(desde, ruta), JSON.stringify(ruta));
  const ultimo = ruta[ruta.length - 1];
  assert.ok(Math.abs(ultimo.x - hasta.x) < 1e-9 && Math.abs(ultimo.z - hasta.z) < 1e-9);
});

test('si hay una estantería en el medio y el destino está en el mismo pasillo, camina en línea recta', () => {
  const desde = { x: 0, z: 1 };
  const hasta = { x: 0.2, z: 0.2 };
  const ruta = calcularRuta(disp, desde, hasta, medidas);
  assert.equal(ruta.length, 1);
});
