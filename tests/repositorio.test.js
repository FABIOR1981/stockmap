import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRepositorioNube, crearRepositorioMemoria, ConflictoVersion } from '../js/datos/repositorio.js';

const estado = { cliente: { nombre: 'X', niveles: [] }, lugares: {}, objetos: {}, codigos: {}, ubicaciones: {}, auditoria: [] };

test('memoria: guarda y rechaza versión vieja', async () => {
  const repo = crearRepositorioMemoria({ d1: { estado, version: 1 } });
  const v2 = await repo.guardar('d1', { ...estado, codigos: { a: 'x' } }, 1);
  assert.equal(v2, 2);
  await assert.rejects(repo.guardar('d1', estado, 1), ConflictoVersion);
  const leido = await repo.cargar('d1');
  assert.deepEqual(leido.estado.codigos, { a: 'x' });
});

test('nube: carga y guarda con la versión', async () => {
  const llamadas = [];
  const fetchFn = async (url, init = {}) => {
    llamadas.push({ url, method: init.method || 'GET', body: init.body });
    if (init.method === 'PUT') return new Response(JSON.stringify({ id: 'd1', version: 4 }), { status: 200 });
    return new Response(JSON.stringify({ id: 'd1', nombre: 'X', estado, version: 3 }), { status: 200 });
  };
  const repo = crearRepositorioNube({ fetchFn });
  const { version } = await repo.cargar('d1');
  assert.equal(version, 3);
  const nueva = await repo.guardar('d1', estado, version);
  assert.equal(nueva, 4);
  assert.deepEqual(JSON.parse(llamadas[1].body), { estado, version: 3 });
});

test('nube: un 409 se informa como conflicto', async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: 'Conflicto' }), { status: 409 });
  const repo = crearRepositorioNube({ fetchFn });
  await assert.rejects(repo.guardar('d1', estado, 3), ConflictoVersion);
});
