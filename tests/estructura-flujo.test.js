// Estructura por la API: estantería con estantes y divisiones se guarda y vuelve al recargar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb, aEstadoModelo, calcularOperaciones, nuevoEstadoSincronizacion } from '../js/almacen/nube.js';

const ADMIN = '33333333-3333-4333-8333-333333333333';
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESSION_SECRET: 'x'.repeat(32) };
let tablas;
const reset = () => { tablas = { perfiles: [{ id: ADMIN, nombre: 'Fabio', es_admin: true }], establecimientos: [], membresias: [], lugares: [],
  niveles_edificio: [], objetos: [], existencias: [], movimientos: [] }; };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
function filtrar(filas, params) {
  return filas.filter(r => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]));
    return true;
  }));
}
async function fetchSimulado(url, opts = {}) {
  const u = new URL(url); const m = (opts.method || 'GET').toUpperCase();
  if (u.pathname.startsWith('/auth/v1/')) return u.pathname.endsWith('/token') ? json({ user: { id: ADMIN } }) : json({});
  const tabla = u.pathname.replace('/rest/v1/', ''); const filas = tablas[tabla];
  if (!filas) throw new Error('tabla inexistente ' + tabla);
  if (m === 'GET') return json(filtrar(filas, u.searchParams));
  if (m === 'POST') {
    const claves = (u.searchParams.get('on_conflict') || 'id').split(',');
    for (const f of JSON.parse(opts.body)) {
      const i = filas.findIndex(r => claves.every(c => String(r[c]) === String(f[c])));
      if (i >= 0) filas[i] = { ...filas[i], ...f }; else filas.push({ ...f });
    }
    return new Response(null, { status: 201 });
  }
  if (m === 'DELETE') { const keep = filas.filter(r => filtrar([r], u.searchParams).length === 0); filas.splice(0, filas.length, ...keep); return new Response(null, { status: 204 }); }
  throw new Error('metodo ' + m);
}
const pedir = (app, ruta, { metodo = 'GET', cuerpo, cookie } = {}) => app.onRequest({
  request: new Request(`https://stockmap.test/api/${ruta}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }),
  env: ENV, params: { ruta: ruta.split('/') }
});

test('una estantería con estantes y divisiones sobrevive al guardar y al recargar', async (t) => {
  const original = globalThis.fetch; globalThis.fetch = fetchSimulado; t.after(() => { globalThis.fetch = original; });
  reset();
  const app = await import(new URL('../functions/api/[[ruta]].js', import.meta.url).href);
  const login = await pedir(app, 'login', { metodo: 'POST', cuerpo: { email: 'x@x.com', password: 'clave' } });
  const cookie = login.headers.get('Set-Cookie').split(';')[0];

  const inicio = await pedir(app, 'datos', { cookie });
  const almacen = crearAlmacenMemoria(); almacen.restaurar(aEstadoModelo(await inicio.json()));
  const dep = new Deposito(almacen); dep.uid = ADMIN;
  const base = nuevoEstadoSincronizacion(almacen).base;
  const c = dep.crearEstablecimiento('Cliente'); dep.elegirEstablecimiento(c.establecimiento.id);
  const ed = dep.crearLugar(null, '1', ''); dep.ponerNivelesTipicos(ed.id);
  const est = dep.crearArbol(ed.id, 'A', '', [2, 3]);
  assert.equal(est.error, undefined, est.error);

  const ops = calcularOperaciones(base, aFilasDb(almacen));
  const envio = await pedir(app, 'sincronizar', { metodo: 'POST', cookie, cuerpo: { ops } });
  assert.equal(envio.status, 200, await envio.clone().text());
  assert.equal(tablas.lugares.length, 1 + 1 + 2 + 6, 'todo el árbol tiene que estar en la base');

  const recarga = await pedir(app, 'datos', { cookie });
  const copia = new Deposito(crearAlmacenMemoria());
  copia.almacen.restaurar(aEstadoModelo(await recarga.json())); copia.uid = ADMIN;
  copia.elegirEstablecimiento(copia.establecimientos[0].id);
  const estanteria = copia.hijos(copia.hijos(null)[0].id)[0];
  assert.equal(copia.hijos(estanteria.id).length, 2, 'los estantes tienen que seguir al recargar');
});
