// Las estanterías sin mover quedan dentro del galpón al recorrerlo (igual que en la vista aérea).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acomodarEnGalpon } from '../js/ui/recorrido/ruta.js';

const huella = () => ({ ex: 0.5, ez: 1 });

test('una estantería fuera del galpón se acerca al borde', () => {
  const disp = new Map([[1, { x: 9, z: 5, giro: 0 }]]);
  acomodarEnGalpon(disp, { A: 6, L: 10 }, huella);
  const d = disp.get(1);
  assert.equal(d.x, 2.5);     // ancho/2 − ex
  assert.equal(d.z, -1);      // frente: −ez
});

test('una estantería adentro no se mueve', () => {
  const disp = new Map([[1, { x: 0, z: -4, giro: 0 }]]);
  acomodarEnGalpon(disp, { A: 6, L: 10 }, huella);
  assert.deepEqual([disp.get(1).x, disp.get(1).z], [0, -4]);
});
