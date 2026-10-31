// Interfaz para celular. Sin framework: cada vista devuelve HTML y las acciones llaman al dominio.
import {
  crearLugar, eliminarLugar, crearObjeto, ubicar, mover, sacar, contarLugar,
  buscarPorCodigo, lugarDe, ocupanteDe, rutaDe, hijosDe, ErrorDeposito,
} from './dominio/depositos.js';
import { crearRepositorioNube, crearRepositorioMemoria, ConflictoVersion, SesionVencida } from './datos/repositorio.js';
import { escanearCamara, camaraDisponible } from './escaner.js';
import { crearDemo } from './datos/demo.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const params = new URLSearchParams(location.search);
const ID = params.get('deposito') || 'demo';
const repo = params.get('deposito')
  ? crearRepositorioNube({ sesion: () => S.sesion })
  : crearRepositorioMemoria({ demo: await crearDemo() });

const S = {
  sesion: params.get('deposito') ? leerSesion(ID) : null, // { token, nombre, rol }
  usuario: params.get('deposito') ? (leerSesion(ID)?.nombre || '') : leerUsuario(),
  rol: params.get('deposito') ? (leerSesion(ID)?.rol || '') : 'administrador',
  vista: 'buscar',
  estado: null,
  version: null,
  q: '',
  objetoId: null,
  modo: null, // 'ubicar' | 'mover' al elegir lugar
  aviso: null, // { tipo: 'ok' | 'error', texto }
  codigoConteo: '',
};

function leerSesion(id) {
  try { return JSON.parse(localStorage.getItem(`stockmap.sesion.${id}`) || 'null'); } catch { return null; }
}
function guardarSesion(id, sesion) {
  try {
    if (sesion) localStorage.setItem(`stockmap.sesion.${id}`, JSON.stringify(sesion));
    else localStorage.removeItem(`stockmap.sesion.${id}`);
  } catch { /* sin almacenamiento: hay que volver a ingresar al recargar */ }
}
function cerrarSesion() {
  S.sesion = null;
  S.usuario = '';
  S.rol = '';
  S.estado = null;
  guardarSesion(ID, null);
  S.vista = 'buscar';
  render();
}

function leerUsuario() {
  try { return localStorage.getItem('stockmap.usuario') || ''; } catch { return ''; }
}
function guardarUsuario(nombre) {
  try { localStorage.setItem('stockmap.usuario', nombre); } catch { /* sin almacenamiento: solo esta sesión */ }
}

const ctx = () => ({
  usuario: S.usuario,
  fecha: new Date().toISOString(),
  nuevoId: () => crypto.randomUUID(),
});

async function recargar() {
  const { estado, version } = await repo.cargar(ID);
  S.estado = estado;
  S.version = version;
}

// Aplica un cambio al dominio y lo guarda. fn recibe (estado, ctx) y devuelve estado o {estado, ...}.
async function escribir(fn, mensajeOk) {
  try {
    const r = fn(S.estado, ctx());
    const nuevo = r.estado ?? r;
    S.version = await repo.guardar(ID, nuevo, S.version);
    S.estado = nuevo;
    S.aviso = { tipo: 'ok', texto: mensajeOk };
    return r;
  } catch (e) {
    if (e instanceof SesionVencida) {
      cerrarSesion();
      S.aviso = { tipo: 'error', texto: 'Tu sesión venció. Volvé a ingresar.' };
      return null;
    }
    if (e instanceof ConflictoVersion) {
      await recargar();
      S.aviso = { tipo: 'error', texto: 'Otra persona cambió el depósito. Se recargó; revisá y volvé a intentar.' };
    } else {
      S.aviso = { tipo: 'error', texto: e.message };
    }
    return null;
  }
}

const nombreLugar = (id) => (id ? rutaDe(S.estado, id).join(' › ') : '');
const lugaresFinales = () => {
  const niveles = S.estado.cliente.niveles;
  const ultimo = niveles[niveles.length - 1].id;
  return Object.values(S.estado.lugares).filter((l) => l.nivelId === ultimo);
};
const objetoDe = (id) => S.estado.objetos[id];

// ----- Vistas -----

function avisoHTML() {
  if (!S.aviso) return '';
  return `<div class="aviso ${S.aviso.tipo}">${esc(S.aviso.texto)}</div>`;
}

function vistaIngreso() {
  return `
    <h2>Ingresar</h2>
    <p class="sub">Usá tu nombre y tu PIN.</p>
    <form data-form="ingreso">
      <label for="ni">Nombre</label>
      <input id="ni" name="nombre" required autocomplete="username">
      <label for="pi">PIN</label>
      <input id="pi" name="pin" required type="password" inputmode="numeric" autocomplete="current-password">
      <button class="btn btn-bloque" type="submit">Entrar</button>
    </form>`;
}

function vistaUsuario() {
  return `
    <h2>¿Quién usa el sistema?</h2>
    <p class="sub">Tu nombre queda en cada movimiento.</p>
    <form data-form="usuario">
      <label for="u">Nombre</label>
      <input id="u" name="nombre" required autocomplete="name">
      <button class="btn btn-bloque" type="submit">Entrar</button>
    </form>`;
}

function vistaBuscar() {
  const q = S.q.trim();
  let html = `
    <h2>Buscar</h2>
    <form data-form="buscar">
      <label for="q">Código o descripción</label>
      <input id="q" name="q" value="${esc(S.q)}" autocomplete="off" inputmode="search" placeholder="Escaneá o escribí">
      <button class="btn btn-bloque sec" type="submit">Buscar</button>
    </form>
    ${camaraDisponible() ? '<button class="btn btn-bloque sec" data-act="escanearBuscar">Escanear con la cámara</button>' : ''}`;
  if (q) {
    const exacto = buscarPorCodigo(S.estado, q);
    const ids = exacto
      ? [exacto]
      : Object.values(S.estado.objetos)
          .filter((o) => o.descripcion.toLowerCase().includes(q.toLowerCase()))
          .map((o) => o.id);
    html += ids.length
      ? ids.map((id) => tarjetaObjeto(objetoDe(id))).join('')
      : `<p class="vacio">No hay objetos con "${esc(q)}".</p>`;
  }
  html += `<button class="btn btn-bloque" data-act="nuevoObjeto">+ Nuevo objeto</button>`;
  return html;
}

function tarjetaObjeto(o) {
  const lugar = lugarDe(S.estado, o.id);
  return `
    <button class="tarjeta" data-act="abrirObjeto" data-id="${esc(o.id)}">
      <strong>${esc(o.descripcion)}</strong>
      <div class="marca">${esc(o.codigoInterno)}</div>
      <div class="ruta">${lugar ? esc(nombreLugar(lugar)) : 'Sin ubicar'}</div>
    </button>`;
}

function vistaObjeto() {
  const o = objetoDe(S.objetoId);
  if (!o) return '<p class="vacio">Objeto inexistente.</p>';
  const lugar = lugarDe(S.estado, o.id);
  const medidas = [
    o.peso !== null && `peso ${o.peso}`,
    o.alto !== null && `alto ${o.alto}`,
    o.ancho !== null && `ancho ${o.ancho}`,
    o.largo !== null && `largo ${o.largo}`,
  ].filter(Boolean).join(' · ');
  return `
    <h2>${esc(o.descripcion)}</h2>
    <p class="marca">Código interno: ${esc(o.codigoInterno)}</p>
    ${o.codigosOrigen.length ? `<p class="marca">Códigos de origen: ${o.codigosOrigen.map(esc).join(', ')}</p>` : ''}
    ${medidas ? `<p class="marca">${esc(medidas)}</p>` : ''}
    <h3>Ubicación</h3>
    <p>${lugar ? esc(nombreLugar(lugar)) : '<span class="vacio">Sin ubicar</span>'}</p>
    ${lugar
      ? `<button class="btn btn-bloque" data-act="elegirLugar" data-modo="mover">Mover</button>
         <button class="btn btn-bloque peligro" data-act="sacar">Sacar</button>`
      : `<button class="btn btn-bloque" data-act="elegirLugar" data-modo="ubicar">Ubicar</button>`}`;
}

function vistaElegirLugar() {
  const o = objetoDe(S.objetoId);
  const actual = lugarDe(S.estado, S.objetoId);
  const libres = lugaresFinales().filter((l) => !ocupanteDe(S.estado, l.id) && l.id !== actual);
  return `
    <h2>${S.modo === 'mover' ? 'Mover' : 'Ubicar'}: ${esc(o?.descripcion || '')}</h2>
    <p class="sub">Elegí un lugar libre.</p>
    ${libres.length
      ? `<ul class="lista">${libres.map((l) => `
          <li><button class="tarjeta" data-act="elegir" data-id="${esc(l.id)}">${esc(nombreLugar(l.id))}</button></li>`).join('')}</ul>`
      : '<p class="vacio">No hay lugares libres.</p>'}
    <button class="btn btn-bloque sec" data-act="volverObjeto">Volver</button>`;
}

function vistaNuevoObjeto() {
  return `
    <h2>Nuevo objeto</h2>
    <form data-form="nuevoObjeto">
      <label for="d">Descripción</label>
      <input id="d" name="descripcion" required>
      <label for="ci">Código interno (vacío = automático)</label>
      <input id="ci" name="codigoInterno" autocomplete="off">
      <label for="co">Códigos de origen (separados por coma)</label>
      <input id="co" name="codigosOrigen" autocomplete="off" inputmode="numeric">
      <div class="fila">
        <div><label for="pe">Peso</label><input id="pe" name="peso" inputmode="decimal"></div>
        <div><label for="al">Alto</label><input id="al" name="alto" inputmode="decimal"></div>
      </div>
      <div class="fila">
        <div><label for="an">Ancho</label><input id="an" name="ancho" inputmode="decimal"></div>
        <div><label for="la">Largo</label><input id="la" name="largo" inputmode="decimal"></div>
      </div>
      <button class="btn btn-bloque" type="submit">Guardar</button>
    </form>`;
}

function vistaEstructura() {
  const niveles = S.estado.cliente.niveles;
  const nombreNivel = (id) => niveles.find((n) => n.id === id)?.nombre ?? '';

  const nodo = (l, profundidad) => {
    const hijos = hijosDe(S.estado, l.id);
    const ocupante = ocupanteDe(S.estado, l.id);
    const esFinal = l.nivelId === niveles[niveles.length - 1].id;
    const puedeBorrar = !hijos.length && !ocupante;
    return `
      <div class="${profundidad ? 'sangria' : ''}">
        <div class="fila">
          <span><strong>${esc(l.nombre)}</strong> <span class="marca">${esc(nombreNivel(l.nivelId))}</span>
          ${esFinal ? `<div class="marca">${ocupante ? esc(objetoDe(ocupante)?.descripcion) : 'Libre'}</div>` : ''}</span>
          ${puedeBorrar ? `<button class="btn sec" data-act="eliminarLugar" data-id="${esc(l.id)}">Eliminar</button>` : ''}
        </div>
        ${hijos.map((h) => nodo(h, profundidad + 1)).join('')}
      </div>`;
  };

  const raices = Object.values(S.estado.lugares).filter((l) => !l.padreId);
  const padres = Object.values(S.estado.lugares).filter((l) => l.nivelId !== niveles[niveles.length - 1].id);
  return `
    <h2>Estructura</h2>
    ${raices.length ? raices.map((r) => nodo(r, 0)).join('') : '<p class="vacio">Todavía no hay lugares.</p>'}
    <h3>Agregar lugar</h3>
    <form data-form="crearLugar">
      <label for="nv">Nivel</label>
      <select id="nv" name="nivelId">${niveles.map((n) => `<option value="${esc(n.id)}">${esc(n.nombre)}</option>`).join('')}</select>
      <label for="pd">Dentro de (si corresponde)</label>
      <select id="pd" name="padreId"><option value="">— ninguno (primer nivel) —</option>
        ${padres.map((p) => `<option value="${esc(p.id)}">${esc(rutaDe(S.estado, p.id).join(' › '))}</option>`).join('')}
      </select>
      <label for="nm">Nombre</label>
      <input id="nm" name="nombre" required>
      <button class="btn btn-bloque" type="submit">Agregar</button>
    </form>`;
}

function vistaConteo() {
  const finales = lugaresFinales();
  return `
    <h2>Conteo de lugar</h2>
    <p class="sub">Elegí el lugar, mirá qué hay y anotalo. El conteo no mueve objetos; las diferencias se corrigen con Ubicar, Mover o Sacar.</p>
    <form data-form="contar">
      <label for="lg">Lugar</label>
      <select id="lg" name="lugarId">
        ${finales.map((l) => `<option value="${esc(l.id)}">${esc(nombreLugar(l.id))}</option>`).join('')}
      </select>
      <label for="cf">Código del objeto encontrado (vacío = lugar vacío)</label>
      <input id="cf" name="codigo" autocomplete="off" value="${esc(S.codigoConteo)}">
      ${camaraDisponible() ? '<button class="btn sec btn-bloque" type="button" data-act="escanearConteo">Escanear con la cámara</button>' : ''}
      <button class="btn btn-bloque" type="submit">Registrar conteo</button>
    </form>`;
}

function vistaAuditoria() {
  const filas = [...S.estado.auditoria].reverse().slice(0, 60);
  if (!filas.length) return '<h2>Historial</h2><p class="vacio">Todavía no hay movimientos.</p>';
  return `
    <h2>Historial</h2>
    <ul class="lista">
      ${filas.map((r) => {
        const fecha = new Date(r.fecha).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' });
        const obj = r.objetoId ? objetoDe(r.objetoId)?.descripcion ?? '' : '';
        const origen = r.lugarOrigen ? nombreLugar(r.lugarOrigen) : '';
        const destino = r.lugarDestino ? nombreLugar(r.lugarDestino) : '';
        const trazo = [origen && `de ${origen}`, destino && `a ${destino}`].filter(Boolean).join(' ');
        return `<li><strong>${esc(r.usuario)}</strong> · ${esc(fecha)}<br>
          ${esc(r.accion)} ${esc(obj)} ${esc(trazo)} ${r.nota ? `<span class="marca">(${esc(r.nota)})</span>` : ''}</li>`;
      }).join('')}
    </ul>`;
}

const TITULOS = {
  buscar: 'Buscar', estructura: 'Estructura', conteo: 'Conteo', auditoria: 'Historial',
};

function render() {
  const app = $('#app');
  const nav = $('#nav');
  const cabecera = $('#usuario');
  cabecera.innerHTML = S.usuario
    ? `${esc(S.usuario)} <button class="btn sec" data-act="salir">Salir</button>`
    : '';
  $('#titulo').textContent = S.estado ? S.estado.cliente.nombre : 'stockmap';
  nav.hidden = !S.usuario;
  // Un operario no ve la estructura (el control real está en el servidor: ver requisitos).
  nav.querySelector('[data-vista="estructura"]').hidden = S.rol === 'operario';

  const vistas = {
    usuario: vistaUsuario,
    ingreso: vistaIngreso,
    buscar: vistaBuscar,
    objeto: vistaObjeto,
    elegirLugar: vistaElegirLugar,
    nuevoObjeto: vistaNuevoObjeto,
    estructura: vistaEstructura,
    conteo: vistaConteo,
    auditoria: vistaAuditoria,
  };
  const modoNube = Boolean(params.get('deposito'));
  const vista = S.usuario ? S.vista : (modoNube ? 'ingreso' : 'usuario');
  app.innerHTML = avisoHTML() + (vistas[vista] ? vistas[vista]() : vistaBuscar());

  nav.querySelectorAll('button').forEach((b) => {
    if (b.dataset.vista === S.vista) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function ir(vista) {
  S.vista = vista;
  S.aviso = null;
  render();
  window.scrollTo(0, 0);
}

// ----- Acciones -----

const acciones = {
  ingreso: async ({ nombre, pin }) => {
    try {
      const sesion = await repo.ingresar(ID, String(nombre || '').trim(), String(pin || ''));
      S.sesion = sesion;
      S.usuario = sesion.nombre;
      S.rol = sesion.rol;
      guardarSesion(ID, sesion);
      await recargar();
      ir('buscar');
    } catch (e) {
      S.aviso = { tipo: 'error', texto: e.message };
      render();
    }
  },
  salir: () => cerrarSesion(),
  usuario: async ({ nombre }) => {
    S.usuario = String(nombre || '').trim();
    if (!S.usuario) return;
    guardarUsuario(S.usuario);
    ir('buscar');
  },
  buscar: ({ q }) => { S.q = String(q || ''); S.aviso = null; render(); },
  nuevoObjeto: () => ir('nuevoObjeto'),
  abrirObjeto: (id) => { S.objetoId = id; ir('objeto'); },
  volverObjeto: () => ir('objeto'),
  elegirLugar: (modo) => { S.modo = modo; ir('elegirLugar'); },
  elegir: async (lugarId) => {
    const hecho = S.modo === 'mover'
      ? await escribir((e, c) => mover(e, S.objetoId, lugarId, c), 'Movido.')
      : await escribir((e, c) => ubicar(e, S.objetoId, lugarId, c), 'Ubicado.');
    if (hecho) ir('objeto'); else render();
  },
  sacar: async () => {
    await escribir((e, c) => sacar(e, S.objetoId, c), 'Sacado del lugar.');
    render();
  },
  eliminarLugar: async (id) => {
    await escribir((e, c) => eliminarLugar(e, id, c), 'Lugar eliminado.');
    render();
  },
  crearLugar: async ({ nivelId, padreId, nombre }) => {
    await escribir(
      (e, c) => crearLugar(e, { nivelId, nombre, padreId: padreId || null }, c),
      `Lugar "${nombre}" creado.`,
    );
    render();
  },
  crearObjeto: async (datos) => {
    const codigoInterno = (datos.codigoInterno || '').trim() || `INT-${Date.now().toString(36).toUpperCase()}`;
    const codigosOrigen = String(datos.codigosOrigen || '').split(',').map((c) => c.trim()).filter(Boolean);
    const r = await escribir(
      (e, c) => crearObjeto(e, { ...datos, codigoInterno, codigosOrigen }, c),
      'Objeto creado.',
    );
    if (r) { S.objetoId = r.id; ir('objeto'); } else render();
    // Si falla, se muestra el aviso en la misma vista del formulario.
  },
  escanearBuscar: () => escanear((valor) => { S.q = valor; S.aviso = null; ir('buscar'); }),
  escanearConteo: () => escanear((valor) => { S.codigoConteo = valor; S.aviso = null; render(); }),
  cerrarEscaner: () => cerrarEscaner(),
  contar: async ({ lugarId, codigo }) => {
    let fisico = null;
    if (String(codigo || '').trim()) {
      fisico = buscarPorCodigo(S.estado, codigo);
      if (!fisico) {
        S.aviso = { tipo: 'error', texto: `No existe un objeto con el código ${codigo}.` };
        return render();
      }
    }
    const r = await escribir(
      (e, c) => contarLugar(e, lugarId, fisico, c),
      '',
    );
    S.codigoConteo = '';
    if (r) {
      S.aviso = r.resultado.coincide
        ? { tipo: 'ok', texto: 'Conteo sin diferencias.' }
        : { tipo: 'error', texto: 'Diferencia: no coincide con lo registrado.' };
    }
    render();
  },
};

// ----- Cámara -----

let pararEscaner = null;

function cerrarEscaner() {
  if (pararEscaner) pararEscaner();
  pararEscaner = null;
  $('#escaner').hidden = true;
}

async function escanear(alDetectar) {
  $('#escaner').hidden = false;
  pararEscaner = await escanearCamara({
    video: $('#video'),
    alDetectar: (valor) => { cerrarEscaner(); alDetectar(valor); },
    alError: (e) => { cerrarEscaner(); S.aviso = { tipo: 'error', texto: e.message }; render(); },
  });
}

// ----- Eventos -----

document.addEventListener('click', (ev) => {
  const nav = ev.target.closest('.nav [data-vista]');
  if (nav) return ir(nav.dataset.vista);
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const fn = acciones[act];
  if (!fn) return;
  const arg = el.dataset.id ?? el.dataset.modo ?? undefined;
  fn(arg);
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const datos = Object.fromEntries(new FormData(form).entries());
  acciones[form.dataset.form](datos);
});

// ----- Arranque -----

try {
  // En modo nube sin sesión no se carga nada: primero hay que ingresar.
  if (!params.get('deposito') || S.sesion) await recargar();
} catch (e) {
  if (e instanceof SesionVencida) {
    guardarSesion(ID, null);
    S.sesion = null;
    S.usuario = '';
    S.rol = '';
    S.aviso = { tipo: 'error', texto: 'Tu sesión venció. Volvé a ingresar.' };
  } else {
    S.aviso = { tipo: 'error', texto: `No se pudo cargar el depósito: ${e.message}` };
  }
}
render();
