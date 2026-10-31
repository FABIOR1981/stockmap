// Genera el SQL para dar de alta un usuario en un depósito.
// Uso: node scripts/crear-usuario.mjs <depositoId> "<nombre>" <administrador|supervisor|operario> <pin>
// El PIN no queda en el SQL: solo su hash.
import { hashPin } from '../lib/seguridad.js';

const [depositoId, nombre, rol, pin] = process.argv.slice(2);
const ROLES = ['administrador', 'supervisor', 'operario'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!UUID.test(depositoId || '')) { console.error('Falta un id de depósito válido.'); process.exit(1); }
if (!nombre?.trim()) { console.error('Falta el nombre.'); process.exit(1); }
if (!ROLES.includes(rol)) { console.error(`El rol debe ser: ${ROLES.join(', ')}.`); process.exit(1); }
if (!pin || pin.length < 6) { console.error('El PIN debe tener al menos 6 caracteres.'); process.exit(1); }

const hash = await hashPin(pin);
const nombreSql = nombre.trim().replace(/'/g, "''");
console.log(`insert into usuarios (deposito_id, nombre, rol, pin_hash) values ('${depositoId}', '${nombreSql}', '${rol}', '${hash}');`);
