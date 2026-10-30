// Pruebas del recorrido 3D en un navegador real (Chromium con Playwright).
// Uso: npm run test:navegador
// Levanta la app en un servidor local, con datos de ejemplo (un edificio de 12 × 16 m) y la API simulada.
// Si Playwright no está en el proyecto, indicar su ubicación con PLAYWRIGHT_MODULE=/ruta/a/playwright/index.js

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUERTO = 8799;
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { chromium } = pw.chromium ? pw : pw.default;
const { aplicarOpsSimuladas } = await import(join(raiz, 'tests', 'simulador.js'));
const app = await import(join(raiz, 'functions', 'api', '[[ruta]].js'));

const ADMIN = '33333333-3333-4333-8333-333333333333', EID = '55555555-5555-4555-8555-555555555555';
const EDI = 'aaaaaaaa-0000-4000-8000-000000000001';
const ESTANTE_A = 'bbbbbbbb-0000-4000-8000-000000000001', ESTANTE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const HUECO = 'dddddddd-0000-4000-8000-000000000001', OBJ = 'cccccccc-0000-4000-8000-000000000001';
const ENV = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_KEY: 'clave', SESSION_SECRET: 'x'.repeat(32) };

// Datos de ejemplo: un edificio sin medidas (se cargan desde la vista aérea) con dos estanterías.
const tablas = {
  perfiles: [{ id: ADMIN, nombre: 'Fabio', es_admin: true }],
  establecimientos: [{ id: EID, nombre: 'Cliente' }],
  membresias: [],
  lugares: [
    { id: EDI, establecimiento_id: EID, padre_id: null, codigo: '1', nombre: '' },
    { id: ESTANTE_A, establecimiento_id: EID, padre_id: EDI, codigo: 'A', nombre: '' },
    { id: ESTANTE_B, establecimiento_id: EID, padre_id: EDI, codigo: 'B', nombre: '' },
    { id: HUECO, establecimiento_id: EID, padre_id: ESTANTE_A, codigo: '1', nombre: '' },
  ],
  niveles_edificio: [
    { edificio_id: EDI, orden: 1, nombre: 'Estantería', formato: 'letra', nombre_opcional: false },
    { edificio_id: EDI, orden: 2, nombre: 'Estante', formato: 'numero', nombre_opcional: false },
    { edificio_id: EDI, orden: 3, nombre: 'Hueco', formato: 'letra', nombre_opcional: false },
  ],
  existencias: [{ id: 'ee000000-0000-4000-8000-000000000001', establecimiento_id: EID, objeto_id: OBJ, lugar_id: HUECO, cantidad: 2 }],
  objetos: [{ id: OBJ, establecimiento_id: EID, codigo_interno: 'OBJ-1', codigo_propio: null, descripcion: 'Caja', tipo: 'producto', minimo: 0 }],
  movimientos: [],
};

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const filtrar = (f, p) => f.filter(r => [...p].every(([k, v]) => ['select', 'order', 'limit', 'on_conflict'].includes(k) ? true
  : v.startsWith('eq.') ? String(r[k]) === v.slice(3) : true));
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(url); const m = (o.method || 'GET').toUpperCase();
  if (u.pathname.startsWith('/auth/v1/')) return u.pathname.endsWith('/token') ? json({ user: { id: ADMIN } }) : json({});
  if (u.pathname === '/rest/v1/rpc/aplicar_cambios') return json(aplicarOpsSimuladas(tablas, JSON.parse(o.body).ops));
  const t = tablas[u.pathname.replace('/rest/v1/', '')];
  if (m === 'GET') return json(filtrar(t, u.searchParams));
  throw new Error(`método no simulado: ${m}`);
};

const servidor = spawn('python3', ['-m', 'http.server', String(PUERTO)], { cwd: raiz, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const navegador = await chromium.launch();
const page = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
const errores = [];
page.on('pageerror', e => errores.push(e.message));
await page.route('https://fonts.**', r => r.abort());
let cookie = '';
await page.route('**/api/**', async route => {
  const req = route.request(); const ruta = new URL(req.url()).pathname.replace('/api/', '');
  const headers = { 'Content-Type': 'application/json' }; if (cookie) headers.Cookie = cookie;
  const res = await app.onRequest({ request: new Request(req.url(), { method: req.method(), headers, body: req.method() === 'GET' ? undefined : req.postData() }), env: ENV, params: { ruta: ruta.split('/') } });
  const sc = res.headers.get('Set-Cookie'); if (sc) cookie = sc.split(';')[0];
  await route.fulfill({ status: res.status, headers: { 'Content-Type': 'application/json' }, body: await res.text() });
});

await page.goto(`http://localhost:${PUERTO}/index.html`);
await page.waitForSelector('#formIngreso');
await page.fill('#ingEmail', 'admin@x.com'); await page.fill('#ingClave', 'clave');
await page.click('#formIngreso button[type="submit"]');
await page.waitForSelector('.bloque');

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

prueba('entra al recorrido y lista el edificio', async () => {
  await page.click('button[data-v="recorrido3d"]'); await page.waitForTimeout(300);
  assert.equal(await page.locator('button[data-act="recIr"]').count(), 1);
});

prueba('Pasear llega sin errores de página', async () => {
  await page.click('button[data-act="recIr"][data-id="' + EDI + '"]'); await page.waitForTimeout(300);
  await page.fill('input[data-f="recBusca"]', 'OBJ-1');
  await page.click('button[data-act="recBuscar"][data-pasear="1"]');
  await page.waitForTimeout(4000);
  assert.deepEqual(errores, []);
});

// Dónde cae en la pantalla un punto del piso (x, z en metros) en la vista aérea del galpón de 12 × 16 m.
// La cámara mira desde arriba al centro del galpón (0, −8) con extensión 20 m y campo de 45°.
function enPantalla(x, z, w, h) {
  const mitadAlto = 10, mitadAncho = mitadAlto * (w / h);
  return { px: w / 2 + (x / mitadAncho) * (w / 2), py: h / 2 + ((z + 8) * (h / 2)) / mitadAlto };
}

prueba('en la vista aérea se cargan las medidas del galpón y las estanterías no salen de él', async () => {
  await page.click('button[data-act="recAerea"]'); await page.waitForTimeout(800);
  assert.match(await page.textContent('.rec-medidas'), /Sin medidas/);
  await page.fill('input[data-f="medAncho"]', '12');
  await page.fill('input[data-f="medLargo"]', '16');
  await page.fill('input[data-f="medAlto"]', '8');
  await page.click('button[data-act="medirEdificio"]'); await page.waitForTimeout(500);
  assert.deepEqual([tablas.lugares[0].dim_ancho, tablas.lugares[0].dim_largo, tablas.lugares[0].dim_alto], [1200, 1600, 800]);
  const r = await page.$eval('#r3d canvas', e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  // La estantería A está en (−1,85; −2,3) m; se arrastra hacia la esquina de abajo a la derecha, fuera del galpón.
  const { px, py } = enPantalla(-1.85, -2.3, r.w, r.h);
  await page.mouse.move(r.x + px, r.y + py); await page.mouse.down();
  for (let k = 1; k <= 20; k++) { await page.mouse.move(r.x + px + k * 30, r.y + py + k * 12); await page.waitForTimeout(30); }
  await page.mouse.up(); await page.waitForTimeout(500);
  const guardadas = tablas.lugares.filter(l => l.vista_x != null);
  assert.ok(guardadas.length > 0, 'se guardó la posición');
  for (const l of guardadas) {
    // Galpón 12 × 16 m: x entre −6 y 6, z entre −16 y 0, menos media huella (0,45 m o 1,1 m).
    assert.ok(Math.abs(l.vista_x) <= 600 - 45, `x de ${l.codigo} dentro del galpón`);
    assert.ok(l.vista_z <= -45 && l.vista_z >= -1600 + 45, `z de ${l.codigo} dentro del galpón`);
  }
  assert.deepEqual(errores, []);
});

try {
  let fallas = 0;
  for (const { nombre, fn } of pruebas) {
    try { await fn(); console.log('ok  ', nombre); }
    catch (e) { fallas++; console.log('FALLA', nombre, '\n   ', e.message.split('\n')[0]); }
  }
  console.log(fallas ? `\n${fallas} prueba(s) fallaron` : `\n${pruebas.length} pruebas de navegador pasaron`);
  process.exitCode = fallas ? 1 : 0;
} finally {
  await navegador.close();
  servidor.kill();
}
