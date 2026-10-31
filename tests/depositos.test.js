import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearDeposito, crearLugar, renombrarLugar, eliminarLugar, crearObjeto,
  ubicar, mover, sacar, contarLugar, buscarPorCodigo, lugarDe, ocupanteDe,
  rutaDe, hijosDe, ErrorDeposito,
} from '../js/dominio/depositos.js';

// Contexto determinista para las pruebas
function ctxFabrica(usuario = 'ana') {
  let n = 0;
  return { usuario, fecha: '2026-10-31T10:00:00Z', nuevoId: () => `id${++n}` };
}

const niveles = [
  { id: 'estanteria', nombre: 'Estantería' },
  { id: 'estante', nombre: 'Estante' },
  { id: 'hueco', nombre: 'Hueco' },
];

// Estructura de prueba: Estantería E > Estante 1 > Hueco 1 y 2
function depositoConEstructura() {
  let e = crearDeposito({ nombre: 'Cliente Demo', niveles });
  const ctx = ctxFabrica();
  const est = crearLugar(e, { nivelId: 'estanteria', nombre: 'E' }, ctx);
  e = est.estado;
  const est1 = crearLugar(e, { nivelId: 'estante', nombre: 'Estante 1', padreId: est.id }, ctx);
  e = est1.estado;
  const h1 = crearLugar(e, { nivelId: 'hueco', nombre: 'Hueco 1', padreId: est1.id }, ctx);
  e = h1.estado;
  const h2 = crearLugar(e, { nivelId: 'hueco', nombre: 'Hueco 2', padreId: est1.id }, ctx);
  e = h2.estado;
  return { e, ids: { estanteria: est.id, estante: est1.id, hueco1: h1.id, hueco2: h2.id } };
}

test('crear depósito exige nombre y niveles válidos', () => {
  assert.throws(() => crearDeposito({ nombre: '', niveles }), ErrorDeposito);
  assert.throws(() => crearDeposito({ nombre: 'X', niveles: [] }), ErrorDeposito);
  assert.throws(
    () => crearDeposito({ nombre: 'X', niveles: [{ id: 'a', nombre: 'A' }, { id: 'a', nombre: 'B' }] }),
    ErrorDeposito,
  );
});

test('la estructura respeta el orden de niveles', () => {
  const { e, ids } = depositoConEstructura();
  assert.deepEqual(rutaDe(e, ids.hueco1), ['E', 'Estante 1', 'Hueco 1']);
  assert.deepEqual(hijosDe(e, ids.estante).map((l) => l.nombre), ['Hueco 1', 'Hueco 2']);

  // El primer nivel no tiene superior
  assert.throws(() => crearLugar(e, { nivelId: 'estanteria', nombre: 'F', padreId: ids.estanteria }, ctxFabrica()), ErrorDeposito);
  // El hueco tiene que colgar de un estante, no de una estantería
  assert.throws(() => crearLugar(e, { nivelId: 'hueco', nombre: 'Malo', padreId: ids.estanteria }, ctxFabrica()), ErrorDeposito);
});

test('renombrar y eliminar lugares', () => {
  const { e, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const renombrado = renombrarLugar(e, ids.hueco2, 'Hueco 2 (frente)', ctx);
  assert.equal(renombrado.lugares[ids.hueco2].nombre, 'Hueco 2 (frente)');

  // No se elimina un estante con huecos adentro
  assert.throws(() => eliminarLugar(e, ids.estante, ctx), /Tiene lugares adentro/);
  const sinHueco2 = eliminarLugar(e, ids.hueco2, ctx);
  assert.equal(sinHueco2.lugares[ids.hueco2], undefined);
});

test('un objeto se crea con código interno y códigos de origen', () => {
  const { e } = depositoConEstructura();
  const { estado, id } = crearObjeto(e, {
    descripcion: 'Caja de tornillos M6',
    codigoInterno: 'INT-0001',
    codigosOrigen: ['7790001112223', '7790001112223', ' 7790001112224 '],
    peso: 1.5,
  }, ctxFabrica());
  assert.equal(buscarPorCodigo(estado, 'INT-0001'), id);
  assert.equal(buscarPorCodigo(estado, '7790001112223'), id);
  assert.equal(buscarPorCodigo(estado, '7790001112224'), id);
  assert.deepEqual(estado.objetos[id].codigosOrigen, ['7790001112223', '7790001112224']);
  assert.equal(estado.objetos[id].peso, 1.5);
  assert.equal(estado.objetos[id].alto, null);
});

test('no se repiten códigos entre objetos', () => {
  const { e } = depositoConEstructura();
  const a = crearObjeto(e, { descripcion: 'A', codigoInterno: 'INT-1', codigosOrigen: ['779-1'] }, ctxFabrica());
  assert.throws(
    () => crearObjeto(a.estado, { descripcion: 'B', codigoInterno: 'INT-1' }, ctxFabrica()),
    /ya existe/,
  );
  assert.throws(
    () => crearObjeto(a.estado, { descripcion: 'B', codigoInterno: 'INT-2', codigosOrigen: ['779-1'] }, ctxFabrica()),
    /ya está asignado/,
  );
});

test('medidas inválidas se rechazan', () => {
  const { e } = depositoConEstructura();
  assert.throws(
    () => crearObjeto(e, { descripcion: 'X', codigoInterno: 'INT-9', alto: -3 }, ctxFabrica()),
    /alto debe ser/,
  );
});

test('ubicar, mover y sacar un objeto', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const { estado: e1, id: obj } = crearObjeto(base, { descripcion: 'Caja', codigoInterno: 'INT-1' }, ctx);

  const e2 = ubicar(e1, obj, ids.hueco1, ctx);
  assert.equal(lugarDe(e2, obj), ids.hueco1);
  assert.equal(ocupanteDe(e2, ids.hueco1), obj);

  const e3 = mover(e2, obj, ids.hueco2, ctx);
  assert.equal(lugarDe(e3, obj), ids.hueco2);
  assert.equal(ocupanteDe(e3, ids.hueco1), null);

  const e4 = sacar(e3, obj, ctx);
  assert.equal(lugarDe(e4, obj), null);
  assert.equal(ocupanteDe(e4, ids.hueco2), null);
});

test('un lugar final guarda un solo objeto', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const b = crearObjeto(a.estado, { descripcion: 'B', codigoInterno: 'INT-B' }, ctx);
  const conA = ubicar(b.estado, a.id, ids.hueco1, ctx);
  assert.throws(() => ubicar(conA, b.id, ids.hueco1, ctx), /ya tiene un objeto/);
});

test('un objeto ya ubicado no se ubica dos veces', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const ubicado = ubicar(a.estado, a.id, ids.hueco1, ctx);
  assert.throws(() => ubicar(ubicado, a.id, ids.hueco2, ctx), /usá Mover/);
});

test('solo se ubica en lugares finales', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  assert.throws(() => ubicar(a.estado, a.id, ids.estante, ctx), /solo se puede ubicar en un lugar final/i);
});

test('mover no acepta el mismo lugar ni un lugar ocupado', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const b = crearObjeto(a.estado, { descripcion: 'B', codigoInterno: 'INT-B' }, ctx);
  const e1 = ubicar(ubicar(b.estado, a.id, ids.hueco1, ctx), b.id, ids.hueco2, ctx);
  assert.throws(() => mover(e1, a.id, ids.hueco1, ctx), /Ya está en ese lugar/);
  assert.throws(() => mover(e1, a.id, ids.hueco2, ctx), /ya tiene un objeto/);
});

test('no se puede eliminar un lugar con un objeto adentro', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const conA = ubicar(a.estado, a.id, ids.hueco2, ctx);
  assert.throws(() => eliminarLugar(conA, ids.hueco2, ctx), /Tiene un objeto adentro/);
});

test('el conteo informa coincidencias y diferencias sin mover nada', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const b = crearObjeto(a.estado, { descripcion: 'B', codigoInterno: 'INT-B' }, ctx);
  const e1 = ubicar(b.estado, a.id, ids.hueco1, ctx);

  const ok = contarLugar(e1, ids.hueco1, a.id, ctx);
  assert.equal(ok.resultado.coincide, true);
  assert.equal(lugarDe(ok.estado, a.id), ids.hueco1);

  const vacio = contarLugar(e1, ids.hueco2, null, ctx);
  assert.equal(vacio.resultado.coincide, true);

  const dif = contarLugar(e1, ids.hueco2, b.id, ctx);
  assert.equal(dif.resultado.coincide, false);
  assert.equal(dif.resultado.esperado, null);
  assert.equal(dif.resultado.encontrado, b.id);
  assert.equal(lugarDe(dif.estado, b.id), null);
});

test('cada acción deja auditoría con usuario, fecha y lugares', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica('operario-1');
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const e1 = ubicar(a.estado, a.id, ids.hueco1, ctx);
  const e2 = mover(e1, a.id, ids.hueco2, ctx);
  const e3 = sacar(e2, a.id, ctx);

  const ultimas = e3.auditoria.slice(-3);
  assert.deepEqual(ultimas.map((r) => r.accion), ['ubicar', 'mover', 'sacar']);
  assert.equal(ultimas[1].lugarOrigen, ids.hueco1);
  assert.equal(ultimas[1].lugarDestino, ids.hueco2);
  assert.equal(ultimas[2].lugarOrigen, ids.hueco2);
  assert.equal(ultimas[0].usuario, 'operario-1');
  assert.equal(ultimas[0].fecha, '2026-10-31T10:00:00Z');
});

test('las operaciones no modifican el estado original', () => {
  const { e: base, ids } = depositoConEstructura();
  const ctx = ctxFabrica();
  const a = crearObjeto(base, { descripcion: 'A', codigoInterno: 'INT-A' }, ctx);
  const antes = structuredClone(a.estado);
  ubicar(a.estado, a.id, ids.hueco1, ctx);
  assert.deepEqual(a.estado, antes);
});
