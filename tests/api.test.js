// Prueba la API de depósitos con Supabase simulado (fetch falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin } from '../lib/seguridad.js';
import { onRequestGet, onRequestPost, onRequestPut } from '../functions/api/depositos/[id].js';

const ID = '2f1c7f7e-8c1a-4a4e-9d0e-123456789abc';
const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESION_SECRET: 'secreto-prueba' };
const estado = { cliente: { nombre: 'X', niveles: [{ id: 'a', nombre: 'A' }] }, lugares: {}, objetos: {}, codigos: {}, ubicaciones: {}, auditoria: [] };

// Tabla simulada: depositos y usuarios.
async function montarSupabase(pinHash) {
  const originalFetch = globalThis.fetch;
  let version = 3;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const tabla = u.pathname.split('/').pop();
    if (tabla === 'usuarios') {
      const nombre = decodeURIComponent(u.searchParams.get('nombre').replace('eq.', ''));
      const filas = nombre === 'Ana' ? [{ id: 'u1', nombre: 'Ana', rol: 'supervisor', pin_hash: pinHash }] : [];
      return new Response(JSON.stringify(filas), { status: 200 });
    }
    if (tabla === 'depositos') {
      if (init.method === 'PATCH') {
        const pedido = u.searchParams.get('version');
        if (pedido !== `eq.${version}`) return new Response('[]', { status: 200 });
        version += 1;
        return new Response(JSON.stringify([{ id: ID, version }]), { status: 200 });
      }
      if (u.searchParams.get('select') === 'version') return new Response(JSON.stringify([{ version }]), { status: 200 });
      return new Response(JSON.stringify([{ id: ID, nombre: 'X', estado, version }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };
  return () => { globalThis.fetch = originalFetch; };
}

const pedir = (metodo, cuerpo, token) => ({
  params: { id: ID },
  env,
  request: new Request(`https://x/api/depositos/${ID}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }),
});

test('ingreso correcto devuelve token; PIN incorrecto no', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const bien = await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }));
    assert.equal(bien.status, 200);
    const cuerpo = await bien.json();
    assert.equal(cuerpo.usuario.rol, 'supervisor');
    assert.ok(cuerpo.token);

    const mal = await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '000000' }));
    assert.equal(mal.status, 401);
    const nadie = await onRequestPost(pedir('POST', { nombre: 'Luis', pin: '482913' }));
    assert.equal(nadie.status, 401);
  } finally { restaurar(); }
});

test('sin token no se lee ni se guarda; con token sí', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const { token } = await (await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }))).json();
    assert.equal((await onRequestGet(pedir('GET'))).status, 401);
    assert.equal((await onRequestPut(pedir('PUT', { estado, version: 3 }))).status, 401);

    const leido = await onRequestGet(pedir('GET', null, token));
    assert.equal(leido.status, 200);
    const guardado = await onRequestPut(pedir('PUT', { estado, version: 3 }, token));
    assert.equal(guardado.status, 200);
    assert.equal((await guardado.json()).version, 4);
  } finally { restaurar(); }
});

test('una versión vieja da 409', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const { token } = await (await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }))).json();
    const r = await onRequestPut(pedir('PUT', { estado, version: 1 }, token));
    assert.equal(r.status, 409);
  } finally { restaurar(); }
});
