import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPin, verificarPin, firmarToken, verificarToken } from '../lib/seguridad.js';

test('el PIN se verifica con su hash y no con otro', async () => {
  const h = await hashPin('482913');
  assert.match(h, /^pbkdf2\$100000\$/);
  assert.equal(await verificarPin('482913', h), true);
  assert.equal(await verificarPin('482914', h), false);
  assert.equal(await verificarPin('482913', 'basura'), false);
});

test('el token válido se lee y uno alterado no', async () => {
  const t = await firmarToken({ d: 'dep', u: 'usr', n: 'Ana', r: 'supervisor' }, 'secreto-1');
  const p = await verificarToken(t, 'secreto-1');
  assert.equal(p.n, 'Ana');
  assert.equal(p.r, 'supervisor');
  assert.equal(await verificarToken(t, 'otro-secreto'), null);
  const [datos, firma] = t.split('.');
  const cambiado = Buffer.from(JSON.stringify({ d: 'dep', u: 'usr', n: 'Ana', r: 'administrador', exp: 9999999999 })).toString('base64url');
  assert.equal(await verificarToken(`${cambiado}.${firma}`, 'secreto-1'), null);
  assert.ok(datos);
});

test('un token vencido no se acepta', async () => {
  const t = await firmarToken({ d: 'dep', u: 'usr', n: 'Ana', r: 'operario' }, 'secreto-1', -10);
  assert.equal(await verificarToken(t, 'secreto-1'), null);
});
