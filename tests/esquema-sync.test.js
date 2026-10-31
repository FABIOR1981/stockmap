// Consistencia entre el esquema SQL, la whitelist del servidor y guardar_fila.
// Evita lo que pasó con vista_x: una columna nueva que falta en la base.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TABLAS } from '../functions/api/[[ruta]].js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (r) => readFileSync(join(raiz, r), 'utf8');

// Columnas de cada "create table" de esquema.sql.
function columnasDelEsquema(sql) {
  const tablas = {};
  const re = /create table if not exists (\w+) \(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const cols = m[2].split('\n')
      .map(l => l.replace(/--.*$/, '').trim())
      .filter(l => l && !/^(primary|unique|constraint|foreign|check)\b/i.test(l))
      .map(l => l.split(/\s+/)[0].replace(/,$/, ''));
    tablas[m[1]] = cols;
  }
  return tablas;
}

// Columnas que guardar_fila inserta para cada tabla.
function columnasDeGuardarFila(sql) {
  const tablas = {};
  const re = /when '(\w+)' then\s+insert into \w+ \(([^)]*)\)/g;
  let m;
  while ((m = re.exec(sql))) tablas[m[1]] = m[2].split(',').map(c => c.trim());
  return tablas;
}

const esquema = columnasDelEsquema(leer('supabase/esquema.sql'));
const funciones = columnasDeGuardarFila(leer('supabase/funciones.sql'));

for (const [tabla, { columnas }] of Object.entries(TABLAS)) {
  test(`${tabla}: el esquema SQL tiene todas las columnas que acepta el servidor`, () => {
    assert.ok(esquema[tabla], `falta la tabla ${tabla} en esquema.sql`);
    const faltan = columnas.filter(c => !esquema[tabla].includes(c));
    assert.deepEqual(faltan, [], `columnas que el servidor acepta y el esquema no tiene`);
  });

  test(`${tabla}: guardar_fila inserta las mismas columnas que el servidor acepta`, () => {
    assert.ok(funciones[tabla], `guardar_fila no tiene "when '${tabla}'"`);
    const faltan = columnas.filter(c => !funciones[tabla].includes(c));
    assert.deepEqual(faltan, [], 'columnas que guardar_fila no inserta');
  });
}
