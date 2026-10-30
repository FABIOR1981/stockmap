// Pasear con una estantería pegada a la pared: la ruta no sale del galpón ni entra en estanterías.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularRuta, pisoLibre, RADIO_CUERPO } from '../js/ui/recorrido/ruta.js';

const huella = giro => (giro % 2 === 0 ? { ex: 0.45, ez: 1.1 } : { ex: 1.1, ez: 0.45 });
const A = 12, L = 16;
const piso = { x0: -A / 2 + RADIO_CUERPO, x1: A / 2 - RADIO_CUERPO, z0: -L + 0.05, z1: 1 };

test('una estantería contra la pared: la ruta llega al frente sin cruzar el muro ni la estantería', () => {
  const disp = new Map([
    [1, { x: A / 2 - 0.45, z: -4, giro: 0, lado: 'der' }],  // pegada a la pared derecha
    [2, { x: -3, z: -4, giro: 0, lado: 'izq' }],
  ]);
  const libre = pisoLibre(disp, huella, piso);
  const meta = { x: A / 2 - 0.45 - 1.2, z: -4 };          // frente de la estantería contra la pared
  const ruta = calcularRuta(disp, { x: 0, z: 0.6 }, meta, huella, piso);
  assert.deepEqual(ruta.at(-1), meta);
  let p = { x: 0, z: 0.6 };
  for (const q of ruta) {
    for (let k = 1; k <= 20; k++) {
      const t = k / 20;
      assert.ok(libre(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t), `el tramo pasa por algo ocupado en ${JSON.stringify(q)}`);
    }
    p = q;
  }
});

test('la pared del galpón es el límite: el piso libre no incluye puntos fuera', () => {
  const libre = pisoLibre(new Map(), huella, piso);
  assert.equal(libre(A / 2, -4), false);
  assert.equal(libre(0, -L - 0.1), false);
  assert.equal(libre(0, -4), true);
});
