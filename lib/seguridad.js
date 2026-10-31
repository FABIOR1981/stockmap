// Seguridad: hash de PIN (PBKDF2) y sesiones firmadas (HMAC-SHA256).
// Usa Web Crypto: funciona en Cloudflare Pages Functions y en Node 18+.

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;
const ITERACIONES = 100000;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const desb64 = (texto) => {
  const t = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const iguales = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

async function derivar(pin, salt, iteraciones) {
  const clave = await subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    clave,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPin(pin) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(String(pin), salt, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${b64(salt)}$${b64(hash)}`;
}

export async function verificarPin(pin, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1) return false;
  const hash = await derivar(String(pin), desb64(partes[2]), iteraciones);
  return iguales(hash, desb64(partes[3]));
}

const claveHmac = (secreto) =>
  subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

// payload: { d: depositoId, u: usuarioId, n: nombre, r: rol }. Vence en ttlSeg segundos.
export async function firmarToken(payload, secreto, ttlSeg = 12 * 3600) {
  const cuerpo = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeg };
  const datos = b64(enc.encode(JSON.stringify(cuerpo)));
  const firma = new Uint8Array(await subtle.sign('HMAC', await claveHmac(secreto), enc.encode(datos)));
  return `${datos}.${b64(firma)}`;
}

// Devuelve el payload si la firma y la vigencia son válidas; si no, null.
export async function verificarToken(token, secreto) {
  if (!token || !secreto) return null;
  const [datos, firma] = String(token).split('.');
  if (!datos || !firma) return null;
  const esperada = new Uint8Array(await subtle.sign('HMAC', await claveHmac(secreto), enc.encode(datos)));
  if (!iguales(esperada, desb64(firma))) return null;
  let cuerpo;
  try {
    cuerpo = JSON.parse(new TextDecoder().decode(desb64(datos)));
  } catch {
    return null;
  }
  if (!cuerpo.exp || cuerpo.exp < Math.floor(Date.now() / 1000)) return null;
  return cuerpo;
}
