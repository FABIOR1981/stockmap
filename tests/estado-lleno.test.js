// El color de un edificio o de una estantería: "lleno" solo si todos sus lugares del último nivel tienen objetos.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Lógica pura equivalente a estadoDe (componentes.js), sobre un árbol simple.
const lleno = (id, hijos, conObjetos) => {
  const todos = [];
  const pila = [...(hijos[id] || [])];
  while (pila.length) { const x = pila.pop(); todos.push(x); pila.push(...(hijos[x] || [])); }
  const huecos = todos.filter(x => !(hijos[x]?.length));
  return huecos.length > 0 && huecos.every(h => conObjetos.has(h));
};

test('un edificio con un hueco libre no es lleno', () => {
  const hijos = { E: ['A', 'B'], A: ['A1', 'A2'], B: ['B1'] };
  assert.equal(lleno('E', hijos, new Set(['A1', 'A2', 'B1'])), true);
  assert.equal(lleno('E', hijos, new Set(['A1', 'B1'])), false);   // A2 libre
});

test('una estantería con un estante con objetos y otro libre no es llena', () => {
  const hijos = { A: ['1', '2'] };
  assert.equal(lleno('A', hijos, new Set(['1'])), false);
});

test('un lugar sin hijos no se marca como lleno', () => {
  assert.equal(lleno('X', {}, new Set(['X'])), false);
});
