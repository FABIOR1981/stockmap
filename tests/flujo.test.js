// Flujo completo sin desplegar: el modelo arma los cambios, la API (functions/api) los valida
// y los guarda en una base simulada (PostgREST en memoria), y después se recargan los datos.
// Así se prueba lo que el usuario hace: ingresar, crear un cliente y un edificio, y recargar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Deposito } from '../js/core/deposito.js';
import { crearAlmacenMemoria } from '../js/almacen/memoria.js';
import { aFilasDb, aEstadoModelo, calcularOperaciones, nuevoEstadoSincronizacion } from '../js/almacen/nube.js';

const ADMIN = '33333333-3333-4333-8333-333333333333';
const LECTOR = '44444444-4444-4444-8444-444444444444';
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESSION_SECRET: 'x'.repeat(32) };

let tablas;
const reset = () => {
  tablas = { perfiles: [{ id: ADMIN, nombre: 'Fabio', es_admin: true }], establecimientos: [], membresias: [], lugares: [],
    niveles_edificio: [], objetos: [], existencias: [], movimientos: [] };
};

const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });

import { aplicarOpsSimuladas } from './simulador.js';

// Filtros estilo PostgREST: col=eq.valor y col=in.(a,b). Lo demás (select, order, limit) se ignora.
function filtrar(filas, params) {
  return filas.filter(r => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(r[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(r[k]));
    return true;
  }));
}

// Simula Supabase: rutas /auth/v1 (login) y /rest/v1 (tablas).
async function fetchSimulado(url, opts = {}) {
  const u = new URL(url);
  const metodo = (opts.method || 'GET').toUpperCase();
  if (u.pathname.startsWith('/auth/v1/')) {
    const email = JSON.parse(opts.body || '{}').email;
    const id = email === 'ana@x.com' ? LECTOR : ADMIN;
    return u.pathname.endsWith('/token') ? json({ user: { id } }) : json({});
  }
  if (u.pathname === '/rest/v1/rpc/aplicar_cambios') return json(aplicarOpsSimuladas(tablas, JSON.parse(opts.body).ops));
  const tabla = u.pathname.replace('/rest/v1/', '');
  const filas = tablas[tabla];
  if (!filas) throw new Error(`Tabla inexistente en la simulación: ${tabla}`);
  if (metodo === 'GET') return json(filtrar(filas, u.searchParams));
  if (metodo === 'POST') {
    const claves = (u.searchParams.get('on_conflict') || 'id').split(',');
    for (const fila of JSON.parse(opts.body)) {
      const i = filas.findIndex(r => claves.every(c => String(r[c]) === String(fila[c])));
      if (i >= 0) filas[i] = { ...filas[i], ...fila }; else filas.push({ ...fila });
    }
    return new Response(null, { status: 201 });   // como con return=minimal: sin cuerpo
  }
  if (metodo === 'DELETE') {
    const restantes = filas.filter(r => filtrar([r], u.searchParams).length === 0);
    filas.splice(0, filas.length, ...restantes);
    return new Response(null, { status: 204 });
  }
  throw new Error(`Método no simulado: ${metodo}`);
}

async function cargarApi() {
  return import(new URL('../functions/api/[[ruta]].js', import.meta.url).href);
}

const pedir = (app, ruta, { metodo = 'GET', cuerpo, cookie } = {}) => app.onRequest({
  request: new Request(`https://stockmap.test/api/${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  }),
  env: ENV,
  params: { ruta: ruta.split('/') }
});

test('crear cliente y edificio llega a la base y vuelve al recargar', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = fetchSimulado;
  t.after(() => { globalThis.fetch = original; });
  reset();

  // 1) Ingreso
  const app = await cargarApi();
  const login = await pedir(app, 'login', { metodo: 'POST', cuerpo: { email: 'fabior1981@gmail.com', password: 'clave' } });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.get('Set-Cookie').split(';')[0];

  // 2) La interfaz crea un cliente y un edificio con niveles típicos (mismo código que usa la web)
  // Igual que la web al ingresar: primero carga los datos del servidor.
  const inicio = await pedir(app, 'datos', { cookie });
  assert.equal(inicio.status, 200, await inicio.clone().text());
  const almacen = crearAlmacenMemoria();
  almacen.restaurar(aEstadoModelo(await inicio.json()));
  const dep = new Deposito(almacen);
  dep.uid = ADMIN;
  const base = nuevoEstadoSincronizacion(almacen).base;
  const cliente = dep.crearEstablecimiento('Cliente prueba');
  assert.equal(cliente.error, undefined, cliente.error);
  assert.equal(dep.elegirEstablecimiento(cliente.establecimiento.id), null);
  const edificio = dep.crearLugar(null, '0', 'Galpon');
  assert.equal(edificio.error, undefined, edificio.error);
  assert.equal(dep.ponerNivelesTipicos(edificio.id), null);

  // 3) Se envían solo los cambios, como hace la web
  const ops = calcularOperaciones(base, aFilasDb(almacen));
  const envio = await pedir(app, 'sincronizar', { metodo: 'POST', cookie, cuerpo: { ops } });
  assert.equal(envio.status, 200, await envio.clone().text());

  // 4) Lo guardado en la base
  assert.equal(tablas.establecimientos.length, 1, 'el cliente tiene que estar en la base');
  assert.equal(tablas.establecimientos[0].nombre, 'Cliente prueba');
  assert.equal(tablas.lugares.length, 1, 'el edificio tiene que estar en la base');
  assert.equal(tablas.lugares[0].codigo, '0');
  assert.equal(tablas.lugares[0].establecimiento_id, cliente.establecimiento.id);
  assert.ok(tablas.niveles_edificio.length > 0, 'los niveles tienen que estar en la base');

  // 5) Al recargar, el edificio vuelve a aparecer
  const datos = await pedir(app, 'datos', { cookie });
  assert.equal(datos.status, 200, await datos.clone().text());
  const cuerpo = await datos.json();
  const copia = new Deposito(crearAlmacenMemoria());
  copia.almacen.restaurar(aEstadoModelo(cuerpo));
  copia.uid = ADMIN;
  copia.elegirEstablecimiento(copia.establecimientos[0].id);   // como al ingresar: primer cliente visible
  assert.equal(copia.establecimientos.length, 1);
  assert.equal(copia.hijos(null).length, 1, 'el edificio tiene que aparecer al recargar');
  assert.equal(copia.hijos(null)[0].codigo, '0');
});

test('un lector no puede crear nada aunque envíe los cambios a mano', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = fetchSimulado;
  t.after(() => { globalThis.fetch = original; });
  reset();
  tablas.perfiles.push({ id: LECTOR, nombre: 'Ana', es_admin: false });
  const EID = '55555555-5555-4555-8555-555555555555';
  tablas.establecimientos.push({ id: EID, nombre: 'Cliente' });
  tablas.membresias.push({ usuario_id: LECTOR, establecimiento_id: EID, rol: 'lector' });

  const app = await cargarApi();
  const ops = [{ op: 'upsert', tabla: 'lugares', fila: { id: '66666666-6666-4666-8666-666666666666', establecimiento_id: EID, padre_id: null, codigo: '0', nombre: '' } }];
  const sesion = await pedir(app, 'login', { metodo: 'POST', cuerpo: { email: 'ana@x.com', password: 'clave' } });
  assert.equal(sesion.status, 200, 'el login de Ana tiene que funcionar');
  const cookie = sesion.headers.get('Set-Cookie').split(';')[0];
  const envio = await pedir(app, 'sincronizar', { metodo: 'POST', cookie, cuerpo: { ops } });
  assert.equal(envio.status, 403);
  assert.equal(tablas.lugares.length, 0);
});
