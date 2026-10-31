// Reglas del depósito. Funciones puras: reciben un estado y devuelven un estado nuevo.
// Reglas principales:
// - Un lugar final (el último nivel de la estructura) guarda un solo objeto.
// - Un objeto está en un solo lugar a la vez.
// - Cada cambio deja una entrada de auditoría: quién, cuándo, qué y dónde.
// - El sistema no controla capacidad; eso se resuelve fuera.

export class ErrorDeposito extends Error {}

const exigir = (condicion, mensaje) => {
  if (!condicion) throw new ErrorDeposito(mensaje);
};

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

const medida = (valor, nombre) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  exigir(Number.isFinite(n) && n > 0, `${nombre} debe ser un número mayor que cero`);
  return n;
};

// Estado inicial de un cliente. niveles: [{id, nombre}] de arriba hacia abajo.
export function crearDeposito({ nombre, niveles }) {
  exigir(texto(nombre), 'El cliente necesita un nombre');
  exigir(Array.isArray(niveles) && niveles.length >= 1, 'Hace falta al menos un nivel');
  const ids = new Set();
  for (const nivel of niveles) {
    exigir(texto(nivel.id) && texto(nivel.nombre), 'Cada nivel necesita id y nombre');
    exigir(!ids.has(nivel.id), `Nivel repetido: ${nivel.id}`);
    ids.add(nivel.id);
  }
  return {
    cliente: { nombre: texto(nombre), niveles: niveles.map((n) => ({ id: n.id, nombre: texto(n.nombre) })) },
    lugares: {},
    objetos: {},
    codigos: {}, // código (interno o de origen) -> objetoId
    ubicaciones: {}, // objetoId -> lugarId
    auditoria: [],
  };
}

// ctx = { usuario, fecha, nuevoId() }
const clonar = (estado) => structuredClone(estado);

const auditar = (estado, ctx, datos) => {
  estado.auditoria.push({
    id: ctx.nuevoId(),
    fecha: ctx.fecha,
    usuario: ctx.usuario,
    accion: datos.accion,
    objetoId: datos.objetoId ?? null,
    lugarOrigen: datos.lugarOrigen ?? null,
    lugarDestino: datos.lugarDestino ?? null,
    nota: datos.nota ?? '',
  });
};

const indiceNivel = (estado, nivelId) => estado.cliente.niveles.findIndex((n) => n.id === nivelId);

const esFinal = (estado, lugar) => {
  const niveles = estado.cliente.niveles;
  return lugar.nivelId === niveles[niveles.length - 1].id;
};

export function hijosDe(estado, lugarId) {
  return Object.values(estado.lugares).filter((l) => l.padreId === lugarId);
}

// Objeto que ocupa el lugar, o null.
export function ocupanteDe(estado, lugarId) {
  const par = Object.entries(estado.ubicaciones).find(([, l]) => l === lugarId);
  return par ? par[0] : null;
}

// Lugar donde está el objeto, o null.
export function lugarDe(estado, objetoId) {
  return estado.ubicaciones[objetoId] ?? null;
}

// Ruta completa de un lugar, de arriba hacia abajo: ["Edificio A", "Estantería 3", ...].
export function rutaDe(estado, lugarId) {
  const nombres = [];
  let actual = estado.lugares[lugarId];
  while (actual) {
    nombres.unshift(actual.nombre);
    actual = actual.padreId ? estado.lugares[actual.padreId] : null;
  }
  return nombres;
}

export function buscarPorCodigo(estado, codigo) {
  return estado.codigos[texto(codigo)] ?? null;
}

// ----- Estructura -----

export function crearLugar(estado, { nivelId, nombre, padreId = null }, ctx) {
  const e = clonar(estado);
  const i = indiceNivel(e, nivelId);
  exigir(i >= 0, 'Nivel inexistente');
  exigir(texto(nombre), 'El lugar necesita un nombre');
  if (i === 0) {
    exigir(!padreId, 'El primer nivel no tiene lugar superior');
  } else {
    const padre = e.lugares[padreId];
    exigir(padre, 'Hay que indicar el lugar superior');
    exigir(padre.nivelId === e.cliente.niveles[i - 1].id, 'El lugar superior tiene que ser del nivel anterior');
  }
  const id = ctx.nuevoId();
  e.lugares[id] = { id, nivelId, nombre: texto(nombre), padreId: padreId || null };
  auditar(e, ctx, { accion: 'estructura', lugarDestino: id, nota: `Creó ${texto(nombre)}` });
  return { estado: e, id };
}

export function renombrarLugar(estado, lugarId, nombre, ctx) {
  const e = clonar(estado);
  const lugar = e.lugares[lugarId];
  exigir(lugar, 'Lugar inexistente');
  exigir(texto(nombre), 'El lugar necesita un nombre');
  const anterior = lugar.nombre;
  lugar.nombre = texto(nombre);
  auditar(e, ctx, { accion: 'estructura', lugarDestino: lugarId, nota: `Renombró ${anterior} a ${lugar.nombre}` });
  return e;
}

// Solo se puede eliminar un lugar sin hijos y sin objeto adentro.
export function eliminarLugar(estado, lugarId, ctx) {
  const e = clonar(estado);
  const lugar = e.lugares[lugarId];
  exigir(lugar, 'Lugar inexistente');
  exigir(hijosDe(e, lugarId).length === 0, 'Tiene lugares adentro; eliminalos antes');
  exigir(!ocupanteDe(e, lugarId), 'Tiene un objeto adentro; sacalo antes');
  delete e.lugares[lugarId];
  auditar(e, ctx, { accion: 'estructura', lugarOrigen: lugarId, nota: `Eliminó ${lugar.nombre}` });
  return e;
}

// ----- Objetos -----

// datos: { descripcion, codigoInterno, codigosOrigen?, peso?, alto?, ancho?, largo? }
export function crearObjeto(estado, datos, ctx) {
  const e = clonar(estado);
  const descripcion = texto(datos.descripcion);
  const codigoInterno = texto(datos.codigoInterno);
  exigir(descripcion, 'El objeto necesita una descripción');
  exigir(codigoInterno, 'El objeto necesita un código interno');
  exigir(!e.codigos[codigoInterno], `El código ${codigoInterno} ya existe`);

  const codigosOrigen = [...new Set((datos.codigosOrigen ?? []).map(texto).filter(Boolean))];
  for (const c of codigosOrigen) {
    exigir(c !== codigoInterno, 'El código de origen no puede ser igual al interno');
    exigir(!e.codigos[c], `El código ${c} ya está asignado a otro objeto`);
  }

  const id = ctx.nuevoId();
  e.objetos[id] = {
    id,
    descripcion,
    codigoInterno,
    codigosOrigen,
    peso: medida(datos.peso, 'El peso'),
    alto: medida(datos.alto, 'El alto'),
    ancho: medida(datos.ancho, 'El ancho'),
    largo: medida(datos.largo, 'El largo'),
  };
  e.codigos[codigoInterno] = id;
  for (const c of codigosOrigen) e.codigos[c] = id;
  auditar(e, ctx, { accion: 'objeto', objetoId: id, nota: descripcion });
  return { estado: e, id };
}

// ----- Movimientos -----

export function ubicar(estado, objetoId, lugarId, ctx) {
  const e = clonar(estado);
  exigir(e.objetos[objetoId], 'Objeto inexistente');
  const actual = lugarDe(e, objetoId);
  exigir(!actual, `Ya está en ${rutaDe(e, actual).join(' > ')}; usá Mover`);
  validarDestino(e, lugarId);
  e.ubicaciones[objetoId] = lugarId;
  auditar(e, ctx, { accion: 'ubicar', objetoId, lugarDestino: lugarId });
  return e;
}

export function mover(estado, objetoId, lugarId, ctx) {
  const e = clonar(estado);
  exigir(e.objetos[objetoId], 'Objeto inexistente');
  const origen = lugarDe(e, objetoId);
  exigir(origen, 'El objeto no está ubicado');
  exigir(origen !== lugarId, 'Ya está en ese lugar');
  validarDestino(e, lugarId);
  e.ubicaciones[objetoId] = lugarId;
  auditar(e, ctx, { accion: 'mover', objetoId, lugarOrigen: origen, lugarDestino: lugarId });
  return e;
}

export function sacar(estado, objetoId, ctx) {
  const e = clonar(estado);
  exigir(e.objetos[objetoId], 'Objeto inexistente');
  const origen = lugarDe(e, objetoId);
  exigir(origen, 'El objeto no está ubicado');
  delete e.ubicaciones[objetoId];
  auditar(e, ctx, { accion: 'sacar', objetoId, lugarOrigen: origen });
  return e;
}

function validarDestino(e, lugarId) {
  const lugar = e.lugares[lugarId];
  exigir(lugar, 'Lugar inexistente');
  exigir(esFinal(e, lugar), 'Solo se puede ubicar en un lugar final');
  exigir(!ocupanteDe(e, lugarId), 'Ese lugar ya tiene un objeto');
}

// Verifica un lugar contra lo que el sistema tiene registrado.
// objetoFisicoId: el objeto que se encontró en el lugar, o null si está vacío.
// No cambia la ubicación: solo registra el resultado. Los errores se corrigen con Ubicar, Mover o Sacar.
export function contarLugar(estado, lugarId, objetoFisicoId, ctx) {
  const e = clonar(estado);
  const lugar = e.lugares[lugarId];
  exigir(lugar, 'Lugar inexistente');
  exigir(esFinal(e, lugar), 'Solo se cuentan lugares finales');
  if (objetoFisicoId) exigir(e.objetos[objetoFisicoId], 'Objeto inexistente');
  const esperado = ocupanteDe(e, lugarId);
  const coincide = esperado === (objetoFisicoId || null);
  const nota = coincide ? 'Conteo sin diferencias' : 'Conteo con diferencia';
  auditar(e, ctx, { accion: 'conteo', objetoId: objetoFisicoId || esperado, lugarDestino: lugarId, nota });
  return { estado: e, resultado: { coincide, esperado, encontrado: objetoFisicoId || null } };
}
