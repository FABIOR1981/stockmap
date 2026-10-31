import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRepositorioNube, crearRepositorioMemoria, ConflictoVersion, SesionVencida } from '../js/datos/repositorio.js';

const estado = { cliente: { nombre: 'X', niveles: [] }, lugares: {}, objetos: {}, codigos: {}, ubicaciones: {}, auditoria: [] };

test('memoria: guarda y rechaza versión vieja', async () => {
  const repo = crearRepositorioMemoria({ d1: { estado, version: 1 } });
  const v2 = await repo.guardar('d1', { ...estado, codigos: { a: 'x' } }, 1);
  assert.equal(v2, 2);
  await assert.rejects(repo.guardar('d1', estado, 1), ConflictoVersion);
  const leido = await repo.cargar('d1');
  assert.deepEqual(leido.estado.codigos, { a: 'x' });
});

test('nube: ingreso, carga y guardado envían el token', async () => {
  const llamadas = [];
  const fetchFn = async (url, init = {}) => {
    llamadas.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (init.method === 'POST') {
      return new Response(JSON.stringify({ token: 'T1', usuario: { nombre: 'Ana', rol: 'supervisor' } }), { status: 200 });
    }
    if (init.method === 'PUT') return new Response(JSON.stringify({ id: 'd1', version: 4 }), { status: 200 });
    return new Response(JSON.stringify({ id: 'd1', nombre: 'X', estado, version: 3 }), { status: 200 });
  };
  let sesion = null;
  const repo = crearRepositorioNube({ fetchFn, sesion: () => sesion });
  const ing = await repo.ingresar('d1', 'Ana', '482913');
  assert.deepEqual(ing, { token: 'T1', nombre: 'Ana', rol: 'supervisor' });
  sesion = ing;
  const { version } = await repo.cargar('d1');
  assert.equal(version, 3);
  assert.equal(llamadas[1].headers.authorization, 'Bearer T1');
  assert.equal(await repo.guardar('d1', estado, version), 4);
  assert.deepEqual(JSON.parse(llamadas[2].body), { estado, version: 3 });
});

test('nube: un 409 es conflicto y un 401 es sesión vencida', async () => {
  const conflicto = crearRepositorioNube({ fetchFn: async () => new Response('{"error":"x"}', { status: 409 }) });
  await assert.rejects(conflicto.guardar('d1', estado, 3), ConflictoVersion);
  const vencida = crearRepositorioNube({ fetchFn: async () => new Response('{}', { status: 401 }) });
  await assert.rejects(vencida.cargar('d1'), SesionVencida);
});
