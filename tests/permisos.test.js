import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiosPermitidos } from '../lib/permisos.js';

const base = () => ({
  cliente: { nombre: 'X', niveles: [{ id: 'a', nombre: 'A' }] },
  lugares: { l1: { id: 'l1', nivelId: 'a', nombre: 'E', padreId: null } },
  objetos: { o1: { id: 'o1', descripcion: 'Caja' } },
  codigos: { 'INT-1': 'o1' },
  ubicaciones: {},
  auditoria: [{ id: 'r1', accion: 'objeto' }],
});

test('el operario solo puede ubicar, mover y sacar', () => {
  const antes = base();
  const ubicado = { ...base(), ubicaciones: { o1: 'l1' }, auditoria: [...antes.auditoria, { id: 'r2', accion: 'ubicar' }] };
  assert.equal(cambiosPermitidos(antes, ubicado, 'operario').ok, true);
});

test('el operario no cambia estructura ni objetos', () => {
  const antes = base();
  const estructura = { ...base(), lugares: { ...antes.lugares, l2: { id: 'l2', nivelId: 'a', nombre: 'F', padreId: null } } };
  assert.equal(cambiosPermitidos(antes, estructura, 'operario').ok, false);
  const objeto = { ...base(), objetos: { ...antes.objetos, o2: { id: 'o2' } }, codigos: { ...antes.codigos, 'INT-2': 'o2' } };
  assert.equal(cambiosPermitidos(antes, objeto, 'operario').ok, false);
});

test('el supervisor cambia estructura y objetos, pero no el nombre del depósito', () => {
  const antes = base();
  const estructura = { ...base(), lugares: { ...antes.lugares, l2: { id: 'l2', nivelId: 'a', nombre: 'F', padreId: null } } };
  assert.equal(cambiosPermitidos(antes, estructura, 'supervisor').ok, true);
  const cliente = { ...base(), cliente: { nombre: 'Otro', niveles: antes.cliente.niveles } };
  assert.equal(cambiosPermitidos(antes, cliente, 'supervisor').ok, false);
  assert.equal(cambiosPermitidos(antes, cliente, 'administrador').ok, true);
});

test('la auditoría solo crece', () => {
  const antes = base();
  const borrada = { ...base(), auditoria: [] };
  assert.equal(cambiosPermitidos(antes, borrada, 'administrador').ok, false);
  const editada = { ...base(), auditoria: [{ id: 'r1', accion: 'otra' }] };
  assert.equal(cambiosPermitidos(antes, editada, 'administrador').ok, false);
});

test('un rol inexistente no puede nada', () => {
  assert.equal(cambiosPermitidos(base(), base(), 'visitante').ok, false);
});
