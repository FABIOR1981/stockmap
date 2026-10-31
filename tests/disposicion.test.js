// Disposición de las estanterías del recorrido 3D (funciones puras).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MITAD, FONDO, LARGO, huella, frenteDe, agruparPasillos, calcularDisposicion, calcularFila } from '../js/ui/recorrido/disposicion.js';

const lug = (id, extra = {}) => ({ id, ...extra });

test('sin posición guardada, cada par va a un lado del pasillo y las filas se separan', () => {
  const disp = calcularDisposicion([[lug('a'), lug('b')], [lug('c')]]);
  assert.equal(disp.get('a').x, -MITAD + FONDO / 2);
  assert.equal(disp.get('b').x, MITAD - FONDO / 2);
  assert.equal(disp.get('a').z, -1.2 - LARGO / 2);
  assert.ok(disp.get('c').z < disp.get('a').z - 5, 'la segunda fila va más atrás');
});

test('la posición guardada (en cm) reemplaza la automática', () => {
  const disp = calcularDisposicion([[lug('a', { vista_x: 150, vista_z: -300, vista_giro: 1 })]]);
  assert.deepEqual(disp.get('a'), { x: 1.5, z: -3, giro: 1 });
});

test('la fila se centra en x y cada estantería sabe de qué lado del pasillo está', () => {
  const filas = [[lug('a', { vista_x: -400, vista_z: -100 }), lug('b', { vista_x: 200, vista_z: -100 })]];
  const { disp } = calcularFila(filas, 0);
  const a = disp.get('a'), b = disp.get('b');
  assert.ok(Math.abs((a.x - huella(a.giro).ex) + (b.x + huella(b.giro).ex)) < 1e-9, 'centrada');
  assert.equal(a.lado, 'izq');
  assert.equal(b.lado, 'der');
});

test('agruparPasillos separa por fila del plano y ordena cada fila de izquierda a derecha', () => {
  const pos = { a: { x: 500, y: 100 }, b: { x: 100, y: 100 }, c: { x: 300, y: 900 } };
  const filas = agruparPasillos(Object.keys(pos).map(id => lug(id)), l => pos[l.id]);
  assert.deepEqual(filas.map(f => f.map(l => l.id)), [['b', 'a'], ['c']]);
});

test('frenteDe deja a la persona a 1,2 m de la cara de la estantería, mirándola', () => {
  const f = frenteDe({ x: -1.85, z: -3, giro: 0, lado: 'izq' });
  assert.ok(Math.abs(f.x - (-1.85 + 1.2)) < 1e-9 && Math.abs(f.z - -3) < 1e-9);
  assert.ok(Math.abs(f.yaw - Math.PI / 2) < 1e-9);
});
