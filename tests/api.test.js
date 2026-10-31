// Prueba la API de depósitos con Supabase simulado (fetch falso).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, firmarToken } from '../lib/seguridad.js';
import { onRequestGet, onRequestPost, onRequestPut } from '../functions/api/depositos/[id].js';

const ID = '2f1c7f7e-8c1a-4a4e-9d0e-123456789abc';
const env = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESION_SECRET: 'secreto-prueba' };
const estado = { cliente: { nombre: 'X', niveles: [{ id: 'a', nombre: 'A' }] }, lugares: {}, objetos: {}, codigos: {}, ubicaciones: {}, auditoria: [] };

// Tabla simulada: depositos, usuarios e intentos_ingreso (con estado entre llamadas).
async function montarSupabase(pinHash, { rol = 'supervisor' } = {}) {
  const originalFetch = globalThis.fetch;
  let version = 3;
  const intentos = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const tabla = u.pathname.split('/').pop();
    const valorEq = (p) => decodeURIComponent((u.searchParams.get(p) || '').replace(/^eq\./, ''));

    if (tabla === 'usuarios') {
      const nombre = valorEq('nombre');
      const filas = nombre === 'Ana' ? [{ id: 'u1', nombre: 'Ana', rol, pin_hash: pinHash }] : [];
      return new Response(JSON.stringify(filas), { status: 200 });
    }
    if (tabla === 'intentos_ingreso') {
      if (init.method === 'POST') {
        const fila = JSON.parse(init.body);
        intentos.set(fila.clave, fila);
        return new Response(null, { status: 201 });
      }
      if (init.method === 'DELETE') {
        intentos.delete(valorEq('clave'));
        return new Response(null, { status: 204 });
      }
      const fila = intentos.get(valorEq('clave'));
      return new Response(JSON.stringify(fila ? [fila] : []), { status: 200 });
    }
    if (tabla === 'depositos') {
      if (init.method === 'PATCH') {
        if (u.searchParams.get('version') !== `eq.${version}`) return new Response('[]', { status: 200 });
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

const ingresar = async (pin = '482913') => (await onRequestPost(pedir('POST', { nombre: 'Ana', pin }))).json();

test('ingreso correcto devuelve token; PIN incorrecto no', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const bien = await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }));
    assert.equal(bien.status, 200);
    const cuerpo = await bien.json();
    assert.equal(cuerpo.usuario.rol, 'supervisor');
    assert.ok(cuerpo.token);
    assert.equal((await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '000000' }))).status, 401);
    assert.equal((await onRequestPost(pedir('POST', { nombre: 'Luis', pin: '482913' }))).status, 401);
  } finally { restaurar(); }
});

test('tras 5 fallos se bloquea, aunque después el PIN sea correcto', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal((await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '000000' }))).status, 401);
    }
    assert.equal((await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }))).status, 429);
  } finally { restaurar(); }
});

test('un ingreso correcto borra los fallos previos', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    for (let i = 0; i < 4; i++) await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '000000' }));
    assert.equal((await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }))).status, 200);
    for (let i = 0; i < 4; i++) await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '000000' }));
    assert.equal((await onRequestPost(pedir('POST', { nombre: 'Ana', pin: '482913' }))).status, 200);
  } finally { restaurar(); }
});

test('sin token no se lee ni se guarda; con token sí', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const { token } = await ingresar();
    assert.equal((await onRequestGet(pedir('GET'))).status, 401);
    assert.equal((await onRequestPut(pedir('PUT', { estado, version: 3 }))).status, 401);
    assert.equal((await onRequestGet(pedir('GET', null, token))).status, 200);
    const guardado = await onRequestPut(pedir('PUT', { estado, version: 3 }, token));
    assert.equal(guardado.status, 200);
    assert.equal((await guardado.json()).version, 4);
  } finally { restaurar(); }
});

test('una versión vieja da 409', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const { token } = await ingresar();
    assert.equal((await onRequestPut(pedir('PUT', { estado, version: 1 }, token))).status, 409);
  } finally { restaurar(); }
});

test('un operario no puede cambiar la estructura; sí puede ubicar', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'), { rol: 'operario' });
  try {
    const { token } = await ingresar();
    const conLugar = { ...estado, lugares: { l1: { id: 'l1', nivelId: 'a', nombre: 'E', padreId: null } } };
    assert.equal((await onRequestPut(pedir('PUT', { estado: conLugar, version: 3 }, token))).status, 403);
    const ubicado = { ...estado, ubicaciones: { o1: 'l1' }, auditoria: [{ id: 'r1', accion: 'ubicar' }] };
    assert.equal((await onRequestPut(pedir('PUT', { estado: ubicado, version: 3 }, token))).status, 200);
  } finally { restaurar(); }
});

test('un token de otro depósito no sirve', async () => {
  const restaurar = await montarSupabase(await hashPin('482913'));
  try {
    const ajeno = await firmarToken({ d: 'otro-deposito', u: 'u', n: 'Ana', r: 'administrador' }, 'secreto-prueba');
    assert.equal((await onRequestGet(pedir('GET', null, ajeno))).status, 401);
  } finally { restaurar(); }
});
