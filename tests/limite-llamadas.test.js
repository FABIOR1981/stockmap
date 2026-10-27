// Cloudflare limita cuántas llamadas externas puede hacer una petición (50 en el plan gratis).
// Un envío grande tiene que quedar muy por debajo de ese límite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb, aEstadoModelo, calcularOperaciones, nuevoEstadoSincronizacion } from '../js/almacen/nube.js';

const ADMIN = '33333333-3333-4333-8333-333333333333';
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESSION_SECRET: 'x'.repeat(32) };
const LIMITE = 50;
import { aplicarOpsSimuladas } from './simulador.js';

function simulada(tablas, contador) {
  const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
  const filtrar = (filas, params) => filas.filter(r => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]));
    return true;
  }));
  return async (url, o = {}) => {
    contador.n++;
    const u = new URL(url); const m = (o.method || 'GET').toUpperCase();
    if (u.pathname.startsWith('/auth/v1/')) return u.pathname.endsWith('/token') ? json({ user: { id: ADMIN } }) : json({});
    if (u.pathname === '/rest/v1/rpc/aplicar_cambios') return json(aplicarOpsSimuladas(tablas, JSON.parse(o.body).ops));
    const t = tablas[u.pathname.replace('/rest/v1/', '')];
    if (m === 'GET') return json(filtrar(t, u.searchParams));
    if (m === 'POST') {
      const claves = (u.searchParams.get('on_conflict') || 'id').split(',');
      for (const f of JSON.parse(o.body)) {
        const i = t.findIndex(r => claves.every(c => String(r[c]) === String(f[c])));
        if (i >= 0) t[i] = { ...t[i], ...f }; else t.push({ ...f });
      }
      return new Response(null, { status: 201 });
    }
    if (m === 'DELETE') { const k = t.filter(r => filtrar([r], u.searchParams).length === 0); t.splice(0, t.length, ...k); return new Response(null, { status: 204 }); }
    throw new Error(m);
  };
}

test('un envío de 36 lugares (Crear varios con estructura) no supera el límite de llamadas', async (t) => {
  const tablas = { perfiles: [{ id: ADMIN, nombre: 'Fabio', es_admin: true }], establecimientos: [], membresias: [], lugares: [],
    niveles_edificio: [], objetos: [], existencias: [], movimientos: [] };
  const contador = { n: 0 };
  const original = globalThis.fetch; globalThis.fetch = simulada(tablas, contador); t.after(() => { globalThis.fetch = original; });
  const app = await import(new URL('../functions/api/[[ruta]].js', import.meta.url).href);
  const pedir = (ruta, cuerpo, cookie) => app.onRequest({ request: new Request(`https://x/api/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(cuerpo || {}) }), env: ENV, params: { ruta: [ruta] } });
  const cookie = (await pedir('login', { email: 'a', password: 'b' })).headers.get('Set-Cookie').split(';')[0];

  // Modelo: edificio con 3 niveles, y 4 estanterías con 2 estantes y 3 divisiones cada una.
  const almacen = crearAlmacenMemoria();
  almacen.insertar('usuarios', { id: ADMIN, nombre: 'Fabio', es_admin: true });
  const dep = new Deposito(almacen); dep.uid = ADMIN;
  const base = nuevoEstadoSincronizacion(almacen).base;
  const c = dep.crearEstablecimiento('Cliente'); dep.elegirEstablecimiento(c.establecimiento.id);
  const ed = dep.crearLugar(null, '1', ''); dep.ponerNivelesTipicos(ed.id);
  const r = dep.crearLote(ed.id, 'A', 'D', [2, 3]);
  assert.equal(r.creados, 36);

  contador.n = 0;
  const ops = calcularOperaciones(base, aFilasDb(almacen));
  const envio = await pedir('sincronizar', { ops }, cookie);
  assert.equal(envio.status, 200, await envio.clone().text());
  assert.equal(tablas.lugares.length, 1 + 36, 'todos tienen que quedar guardados');
  assert.ok(contador.n < LIMITE, `el envío hizo ${contador.n} llamadas externas (límite ${LIMITE})`);
});
