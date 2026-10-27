// Modelo de stock de depósitos: clientes, usuarios, lugares, objetos y movimientos.
// No toca el DOM. Todo cambio pasa por el almacén (js/almacen/memoria.js).
// Las funciones de cambio devuelven null si salió bien, o un texto con el error.
//
// Conceptos:
//   - Cliente (establecimiento): cada uno tiene sus propios edificios, lugares y objetos.
//   - Usuario: puede ser administrador general (ve y hace todo) o tener un rol en cada cliente:
//       admin (gestiona accesos y datos), editor (carga y mueve), lector (solo mira).
//   - Objeto de tipo 'unidad': un elemento identificado (cada caja tiene su código). Cantidad 0 o 1.
//   - Objeto de tipo 'producto': un artículo del que hay N unidades repartidas en lugares.
//   - Asignación: cuánto de un objeto hay en un lugar (cantidad > 0).
//   - Movimiento: registro de entrada, salida o transferencia. Es el historial de todo cambio de stock.

import { FORMATOS, NIVEL_EDIFICIO } from './formatos.js';

const ROLES = ['admin', 'editor', 'lector'];
const TIPOS = ['unidad', 'producto'];

const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
const enteroPositivo = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export class Deposito {
  constructor(almacen) {
    this.almacen = almacen;
    this.uid = null;   // usuario con el que se opera (sesión)
    this.eid = null;   // cliente que se está mirando
  }

  // ---------- Lectura (todo lo de un cliente sale filtrado por this.eid) ----------
  get establecimientos() { return this.almacen.filas('establecimientos'); }
  get usuarios()         { return this.almacen.filas('usuarios'); }
  get membresias()       { return this.almacen.filas('membresias'); }
  get lugares()          { return this.almacen.filas('lugares').filter(l => l.eid === this.eid); }
  get objetos()          { return this.almacen.filas('objetos').filter(o => o.eid === this.eid); }
  get asignaciones() {
    const ids = new Set(this.lugares.map(l => l.id));
    return this.almacen.filas('asignaciones').filter(a => ids.has(a.lid));
  }
  get movimientos()      { return this.almacen.filas('movimientos').filter(m => m.eid === this.eid); }

  usuarioActual()         { return this.usuarios.find(u => u.id === this.uid) || null; }
  establecimientoActual() { return this.establecimientos.find(e => e.id === this.eid) || null; }
  nombreUsuario(uid)      { const u = this.usuarios.find(x => x.id === uid); return u ? u.nombre : '—'; }
  rolEn(eid = this.eid)   { const m = this.membresias.find(x => x.uid === this.uid && x.eid === eid); return m ? m.rol : null; }

  puedeVer(eid) {
    const u = this.usuarioActual();
    if (!u) return false;
    return u.es_admin || this.membresias.some(m => m.uid === u.id && m.eid === eid);
  }
  establecimientosVisibles() { return this.establecimientos.filter(e => this.puedeVer(e.id)); }
  puedeEditar()   { return this._exigir('editar') === null; }
  puedeGestionar() { return this._exigir('gestionar') === null; }

  accesosDelCliente() {
    return this.membresias.filter(m => m.eid === this.eid)
      .map(m => ({ ...m, nombre: this.nombreUsuario(m.uid) }));
  }

  // Devuelve null si el usuario actual puede hacer la acción, o un texto con el motivo.
  // Acciones: 'global' (solo administrador general), 'gestionar' (admin del cliente), 'editar'.
  _exigir(accion) {
    const u = this.usuarioActual();
    if (!u) return 'Elegí un usuario.';
    if (accion === 'global') return u.es_admin ? null : 'Solo el administrador general puede hacer esto.';
    if (!this.eid) return 'Elegí un cliente primero.';
    if (u.es_admin) return null;
    const rol = this.rolEn();
    if (!rol) return 'No tenés acceso a este cliente.';
    if (accion === 'gestionar' && rol !== 'admin') return 'Solo un admin del cliente puede gestionar accesos.';
    if (accion === 'editar' && rol === 'lector') return 'Tu rol es de solo lectura en este cliente.';
    return null;
  }

  // ---------- Sesión ----------
  elegirUsuario(uid) {
    if (!this.usuarios.some(u => u.id === uid)) return 'Usuario inexistente.';
    this.uid = uid;
    if (this.eid && !this.puedeVer(this.eid)) {
      this.eid = this.establecimientosVisibles()[0]?.id || null;
    }
    return null;
  }

  elegirEstablecimiento(eid) {
    if (eid && !this.puedeVer(eid)) return 'No tenés acceso a ese cliente.';
    this.eid = eid || null;
    return null;
  }

  // ---------- Clientes, usuarios y accesos ----------
  crearEstablecimiento(nombre) {
    const err = this._exigir('global'); if (err) return { error: err };
    const n = (nombre || '').trim();
    if (!n) return { error: 'Falta el nombre del cliente.' };
    const e = this.almacen.insertar('establecimientos', { id: crypto.randomUUID(), nombre: n });
    return { establecimiento: e };
  }

  crearUsuario(nombre, esAdmin = false) {
    const err = this._exigir('global'); if (err) return { error: err };
    const n = (nombre || '').trim();
    if (!n) return { error: 'Falta el nombre del usuario.' };
    const u = this.almacen.insertar('usuarios', { id: crypto.randomUUID(), nombre: n, es_admin: !!esAdmin });
    return { usuario: u };
  }

  darAcceso(uid, rol) {
    const err = this._exigir('gestionar'); if (err) return err;
    if (!ROLES.includes(rol)) return 'Rol inexistente.';
    if (!this.usuarios.some(u => u.id === uid)) return 'Usuario inexistente.';
    const actual = this.membresias.find(m => m.uid === uid && m.eid === this.eid);
    if (actual) this.almacen.actualizar('membresias', actual.id, { rol });
    else this.almacen.insertar('membresias', { id: crypto.randomUUID(), uid, eid: this.eid, rol });
    return null;
  }

  quitarAcceso(uid) {
    const err = this._exigir('gestionar'); if (err) return err;
    this.almacen.borrarDonde('membresias', m => m.uid === uid && m.eid === this.eid);
    return null;
  }

  // ---------- Lugares ----------
  porId(id)       { return this.lugares.find(l => l.id === id); }
  objetoPorId(id) { return this.objetos.find(o => o.id === id); }

  hijos(id) {
    return this.lugares.filter(l => l.padre_id === (id || null)).sort(porCodigo);
  }
  ancestros(l) {
    const r = [];
    let p = l.padre_id ? this.porId(l.padre_id) : null;
    while (p) { r.unshift(p); p = p.padre_id ? this.porId(p.padre_id) : null; }
    return r;
  }
  ruta(l)        { return [...this.ancestros(l), l]; }
  dir(l)         { return this.ruta(l).map(x => x.codigo).join(' · '); }
  prof(l)        { return this.ancestros(l).length; }
  edificioDe(l)  { return this.ruta(l)[0]; }

  nivelDe(l) {
    const p = this.prof(l);
    return p === 0 ? NIVEL_EDIFICIO : this.edificioDe(l).niveles[p - 1];
  }
  nivelParaHijo(padreId) {
    if (!padreId) return { def: NIVEL_EDIFICIO, ed: null };
    const padre = this.porId(padreId), ed = this.edificioDe(padre);
    return { def: ed.niveles[this.prof(padre)], ed };
  }

  descendientes(l) {
    const r = [], pila = [...this.hijos(l.id)];
    while (pila.length) { const x = pila.pop(); r.push(x); pila.push(...this.hijos(x.id)); }
    return r;
  }
  esHoja(l) { return this.prof(l) > 0 && this.hijos(l.id).length === 0; }

  usadoEn(edId, profundidad) {
    return this.lugares.some(l => l.padre_id && this.edificioDe(l).id === edId && this.prof(l) === profundidad);
  }

  crearLugar(padreId, codigo, nombre) {
    const err = this._exigir('editar'); if (err) return { error: err };
    const { def, ed } = this.nivelParaHijo(padreId);
    if (!def) return { error: `Este edificio no tiene nivel para esta profundidad. Agregalo en "Niveles de ${ed.codigo}".` };
    const F = FORMATOS[def.formato];
    const cod = F.norm((codigo || '').trim());
    if (!cod) return { error: 'Falta el código.' };
    if (!F.ok(cod)) return { error: `${def.nombre}: el código debe ser ${F.txt}.` };
    const padre = padreId ? this.porId(padreId) : null;
    if (padre && this.tieneObjetos(padre)) return { error: 'Este lugar tiene objetos. Sacalos antes de subdividirlo.' };
    if (this.lugares.some(l => l.padre_id === (padreId || null) && l.codigo.toLowerCase() === cod.toLowerCase()))
      return { error: `Ya existe "${cod}" dentro de este lugar.` };
    const id = crypto.randomUUID();
    this.almacen.insertar('lugares', {
      id, eid: this.eid, padre_id: padreId || null, codigo: cod,
      nombre: (def.nombreOpcional && nombre) ? nombre.trim() : '',
      niveles: []
    });
    return { id };
  }

  // Niveles que tendría dentro un hijo nuevo de padreId (los que define el edificio debajo de él).
  nivelesBajo(padreId) {
    if (!padreId) return [];
    const padre = this.porId(padreId);
    return this.edificioDe(padre).niveles.slice(this.prof(padre) + 1);
  }

  // Cantidades para la estructura de un lugar nuevo: cuentas[0] = hijos, cuentas[1] = nietos, etc.
  validarCuentas(padreId, cuentas) {
    if (!cuentas.length) return null;
    if (!padreId) return 'Primero definí los niveles del edificio.';
    if (cuentas.length > this.nivelesBajo(padreId).length) return 'La estructura del edificio tiene menos niveles.';
    if (cuentas.some(n => !Number.isInteger(n) || n < 1)) return 'Indicá cantidades de 1 o más.';
    return null;
  }

  codigosPara(formato, n) {
    if (formato === 'numero') return Array.from({ length: n }, (_, i) => String(i + 1));
    if (n > 26) return null;
    const base = formato === 'letra' ? 65 : 97;
    return Array.from({ length: n }, (_, i) => String.fromCharCode(base + i));
  }

  // Crea un lugar y, si hay cuentas, sus hijos y nietos según la estructura del edificio.
  crearArbol(padreId, codigo, nombre, cuentas = []) {
    const err = this.validarCuentas(padreId, cuentas);
    if (err) return { error: err };
    const r = this.crearLugar(padreId, codigo, nombre);
    if (r.error) return r;
    let creados = 1;
    const hijos = (padre, k) => {
      if (k >= cuentas.length) return null;
      const { def } = this.nivelParaHijo(padre);
      const cods = this.codigosPara(def.formato, cuentas[k]);
      if (!cods) return { error: `No hay códigos suficientes para ${cuentas[k]} ${def.nombre.toLowerCase()}s.` };
      for (const c of cods) {
        const h = this.crearLugar(padre, c, '');
        if (h.error) return { error: `${c}: ${h.error}` };
        creados++;
        const e = hijos(h.id, k + 1);
        if (e) return e;
      }
      return null;
    };
    const e = hijos(r.id, 0);
    return e ? { ...e, id: r.id, creados } : { id: r.id, creados };
  }

  crearLote(padreId, desde, hasta, cuentas = []) {
    const err = this._exigir('editar'); if (err) return { error: err };
    const errCuentas = this.validarCuentas(padreId, cuentas);
    if (errCuentas) return { error: errCuentas };
    const { def } = this.nivelParaHijo(padreId);
    if (!def) return { error: 'Este edificio no tiene nivel para esta profundidad.' };
    const cods = this.rango(desde, hasta, def.formato);
    if (!cods) return { error: `Rango no válido. Usá ${FORMATOS[def.formato].txt} en ambos extremos, con el primero menor o igual al segundo.` };
    if (cods.length > 100) return { error: 'Máximo 100 por lote.' };
    let creados = 0;
    const errores = [];
    cods.forEach(c => {
      const r = this.crearArbol(padreId, c, '', cuentas);
      r.error ? errores.push(`${c}: ${r.error}`) : (creados += r.creados);
    });
    return { creados, errores };
  }

  rango(desde, hasta, formato) {
    const F = FORMATOS[formato];
    const a = F.norm((desde || '').trim()), b = F.norm((hasta || '').trim());
    if (!F.ok(a) || !F.ok(b)) return null;
    if (formato === 'numero') {
      const x = +a, y = +b;
      if (x > y) return null;
      return Array.from({ length: y - x + 1 }, (_, i) => String(x + i));
    }
    const s = a.charCodeAt(0), e = b.charCodeAt(0);
    if (s > e) return null;
    return Array.from({ length: e - s + 1 }, (_, i) => F.norm(String.fromCharCode(s + i)));
  }

  borrarLugar(id) {
    const err = this._exigir('editar'); if (err) return err;
    const l = this.porId(id);
    if (!l) return 'Lugar inexistente.';
    const todos = [l, ...this.descendientes(l)];
    if (todos.some(x => this.tieneObjetos(x))) return 'Hay objetos dentro. Sacalos antes de borrar.';
    const ids = new Set(todos.map(x => x.id));
    this.almacen.borrarDonde('lugares', x => ids.has(x.id));
    return null;
  }

  editarLugar(id, cambios) {
    const err = this._exigir('editar'); if (err) return err;
    const l = this.porId(id);
    if (!l) return 'Lugar inexistente.';
    const def = this.nivelDe(l);
    const cambio = {};
    if (cambios.codigo !== undefined) {
      const F = FORMATOS[def.formato];
      const cod = F.norm((cambios.codigo || '').trim());
      if (!F.ok(cod)) return `${def.nombre}: el código debe ser ${F.txt}.`;
      if (this.lugares.some(x => x.id !== id && x.padre_id === l.padre_id && x.codigo.toLowerCase() === cod.toLowerCase()))
        return `Ya existe "${cod}" dentro de este lugar.`;
      cambio.codigo = cod;
    }
    if (cambios.nombre !== undefined) cambio.nombre = def.nombreOpcional ? (cambios.nombre || '').trim() : '';
    this.almacen.actualizar('lugares', id, cambio);
    return null;
  }

  // Posición libre de un lugar dentro del plano de su padre. Se guarda con el resto de los cambios.
  posicionar(id, x, y) {
    const err = this._exigir('editar'); if (err) return err;
    if (!this.porId(id)) return 'Lugar inexistente.';
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return 'Posición inválida.';
    this.almacen.actualizar('lugares', id, { pos_x: x, pos_y: y });
    return null;
  }

  siguienteCodigo(padreId, formato) {
    const hermanos = this.hijos(padreId || null);
    if (formato === 'numero') {
      const max = hermanos.reduce((m, h) => Math.max(m, parseInt(h.codigo, 10) || 0), -1);
      return String(max + 1);
    }
    const F = FORMATOS[formato];
    const base = formato === 'letra' ? 'A' : 'a';
    const usados = new Set(hermanos.map(h => h.codigo));
    for (let c = base.charCodeAt(0); c < base.charCodeAt(0) + 26; c++) {
      const cand = F.norm(String.fromCharCode(c));
      if (!usados.has(cand)) return cand;
    }
    return null;
  }

  // Copia un lugar con todo lo que tiene adentro, sin stock. Devuelve el id de la copia.
  copiarSubarbol(src, padreId, codigo) {
    let raiz = null;
    const copiar = (orig, padre, cod) => {
      const id = crypto.randomUUID();
      if (!raiz) raiz = id;
      this.almacen.insertar('lugares', {
        id, eid: this.eid, padre_id: padre, codigo: cod, nombre: orig.nombre, niveles: structuredClone(orig.niveles)
      });
      this.hijos(orig.id).forEach(h => copiar(h, id, h.codigo));
    };
    copiar(src, padreId, codigo);
    return raiz;
  }

  clonar(srcId, cantidad) {
    const err = this._exigir('editar'); if (err) return { error: err };
    const src = this.porId(srcId);
    if (!src) return { error: 'Lugar inexistente.' };
    const n = parseInt(cantidad, 10);
    if (!(n >= 1 && n <= 50)) return { error: 'La cantidad tiene que estar entre 1 y 50.' };
    const padreId = src.padre_id;
    const formato = this.nivelDe(src).formato;
    const nuevos = [];
    for (let i = 0; i < n; i++) {
      const cod = this.siguienteCodigo(padreId, formato);
      if (!cod) return { error: 'No quedan códigos libres para este nivel.' };
      nuevos.push(this.copiarSubarbol(src, padreId, cod));
    }
    return { creados: nuevos.map(id => this.porId(id).codigo) };
  }

  // ---------- Niveles de un edificio ----------
  agregarNivel(edId) {
    const err = this._exigir('editar'); if (err) return err;
    const ed = this.porId(edId);
    if (ed.niveles.length >= 6) return 'Máximo 6 niveles por edificio.';
    const nuevo = { nombre: `Nivel ${ed.niveles.length + 1}`, formato: 'numero', nombreOpcional: false };
    this.almacen.actualizar('lugares', edId, { niveles: [...ed.niveles, nuevo] });
    return null;
  }

  editarNivel(edId, i, campo, valor) {
    const err = this._exigir('editar'); if (err) return err;
    const ed = this.porId(edId);
    if (campo === 'formato' && this.usadoEn(edId, i + 1)) return 'Ese nivel ya tiene lugares. No se puede cambiar su formato.';
    const niveles = ed.niveles.map((n, k) => k === i ? { ...n, [campo]: valor } : n);
    this.almacen.actualizar('lugares', edId, { niveles });
    return null;
  }

  quitarNivel(edId) {
    const err = this._exigir('editar'); if (err) return err;
    const ed = this.porId(edId);
    const i = ed.niveles.length - 1;
    if (i < 0) return 'No hay niveles para quitar.';
    if (this.usadoEn(edId, i + 1)) return 'Ese nivel tiene lugares creados. Borralos antes.';
    this.almacen.actualizar('lugares', edId, { niveles: ed.niveles.slice(0, -1) });
    return null;
  }

  ponerNivelesTipicos(edId) {
    const err = this._exigir('editar'); if (err) return err;
    this.almacen.actualizar('lugares', edId, { niveles: [
      { nombre: 'Estantería', formato: 'letra',     nombreOpcional: false },
      { nombre: 'Estante',    formato: 'numero',    nombreOpcional: false },
      { nombre: 'División',   formato: 'letra_min', nombreOpcional: false }
    ] });
    return null;
  }

  // ---------- Objetos ----------
  crearObjeto(codigoPropio, descripcion, tipo = 'unidad', minimo = 0) {
    const err = this._exigir('editar'); if (err) return { error: err };
    const cp = (codigoPropio || '').trim(), de = (descripcion || '').trim();
    if (!cp && !de) return { error: 'Ingresá un código propio o una descripción.' };
    if (!TIPOS.includes(tipo)) return { error: 'Tipo de objeto inexistente.' };
    const min = tipo === 'producto' ? Math.max(0, Math.floor(Number(minimo) || 0)) : 0;
    const id = crypto.randomUUID();
    const objeto = this.almacen.insertar('objetos', {
      id, eid: this.eid, codigo_interno: 'OBJ-' + id.slice(0, 8).toUpperCase(),
      codigo_propio: cp || null, descripcion: de || null, tipo, minimo: min
    });
    return { objeto };
  }

  borrarObjeto(oid) {
    const err = this._exigir('editar'); if (err) return err;
    if (this.existenciaTotal(oid) > 0) return 'Ese objeto tiene existencias. Sacalas antes de borrarlo.';
    this.almacen.borrarDonde('objetos', o => o.id === oid && o.eid === this.eid);
    return null;
  }

  // ---------- Stock: consultas ----------
  cantidadEn(oid, lid) {
    const a = this.asignaciones.find(x => x.oid === oid && x.lid === lid);
    return a ? a.cantidad : 0;
  }
  existenciaTotal(oid) {
    return this.asignaciones.filter(a => a.oid === oid).reduce((s, a) => s + a.cantidad, 0);
  }
  bajoMinimo(o) {
    return o.tipo === 'producto' && o.minimo > 0 && this.existenciaTotal(o.id) < o.minimo;
  }
  tieneObjetos(l) { return this.asignaciones.some(a => a.lid === l.id && a.cantidad > 0); }
  objetosDe(lid) {
    return this.asignaciones.filter(a => a.lid === lid && a.cantidad > 0)
      .map(a => this.objetoPorId(a.oid)).filter(Boolean);
  }
  ubicacionesDe(oid) {
    return this.asignaciones.filter(a => a.oid === oid && a.cantidad > 0)
      .map(a => this.porId(a.lid)).filter(Boolean);
  }
  movimientosRecientes(limite = 100) { return [...this.movimientos].reverse().slice(0, limite); }

  // Lugar donde se puede guardar stock: hoja que no es edificio. Devuelve el lugar o un texto de error.
  _lugarHoja(lid) {
    const l = this.porId(lid);
    if (!l) return 'Lugar inexistente.';
    if (this.prof(l) === 0) return 'Los edificios no tienen objetos directos. Elegí un lugar dentro.';
    if (this.hijos(l.id).length) return 'Este lugar tiene subdivisiones. Los objetos van dentro de ellas.';
    return l;
  }

  // ---------- Stock: cambios (cada uno deja un movimiento) ----------
  _sumar(oid, lid, n) {
    const a = this.asignaciones.find(x => x.oid === oid && x.lid === lid);
    if (a) this.almacen.actualizar('asignaciones', a.id, { cantidad: a.cantidad + n });
    else this.almacen.insertar('asignaciones', { id: crypto.randomUUID(), oid, lid, cantidad: n });
  }

  _restar(oid, lid, n) {
    const a = this.asignaciones.find(x => x.oid === oid && x.lid === lid);
    const nuevo = a.cantidad - n;
    if (nuevo > 0) this.almacen.actualizar('asignaciones', a.id, { cantidad: nuevo });
    else this.almacen.borrarDonde('asignaciones', x => x.id === a.id);
  }

  _registrar(tipo, oid, desde, hasta, cantidad, nota) {
    this.almacen.insertar('movimientos', {
      id: crypto.randomUUID(), eid: this.eid,
      fecha: new Date().toISOString(), tipo, oid, desde, hasta, cantidad,
      uid: this.uid, nota: (nota || '').trim()
    });
  }

  // Entrada: pone objetos en un lugar. Las unidades entran de a una y no se repiten en el mismo lugar.
  asignar(oid, lid, cantidad = 1, nota = '') {
    const err = this._exigir('editar'); if (err) return err;
    const o = this.objetoPorId(oid);
    if (!o) return 'Objeto inexistente.';
    const l = this._lugarHoja(lid);
    if (typeof l === 'string') return l;
    const n = o.tipo === 'unidad' ? 1 : enteroPositivo(cantidad);
    if (!n) return 'La cantidad tiene que ser un número entero mayor que 0.';
    if (o.tipo === 'unidad' && this.cantidadEn(oid, lid) > 0) return 'Ese objeto ya está en este lugar.';
    this._sumar(oid, lid, n);
    this._registrar('entrada', oid, null, lid, n, nota);
    return null;
  }

  // Salida: saca objetos de un lugar. Nunca deja existencias negativas.
  retirar(oid, lid, cantidad, nota = '') {
    const err = this._exigir('editar'); if (err) return err;
    const o = this.objetoPorId(oid);
    if (!o) return 'Objeto inexistente.';
    const n = enteroPositivo(cantidad);
    if (!n) return 'La cantidad tiene que ser un número entero mayor que 0.';
    const disp = this.cantidadEn(oid, lid);
    if (!disp) return 'Ese objeto no está en este lugar.';
    if (n > disp) return `Solo hay ${disp} en este lugar.`;
    this._restar(oid, lid, n);
    this._registrar('salida', oid, lid, null, n, nota);
    return null;
  }

  // Saca todo lo que haya del objeto en ese lugar.
  liberar(oid, lid) {
    const c = this.cantidadEn(oid, lid);
    if (!c) return 'Ese objeto no está en este lugar.';
    return this.retirar(oid, lid, c);
  }

  // Mueve objetos de un lugar a otro. El total no cambia.
  transferir(oid, desde, hasta, cantidad, nota = '') {
    const err = this._exigir('editar'); if (err) return err;
    const o = this.objetoPorId(oid);
    if (!o) return 'Objeto inexistente.';
    if (desde === hasta) return 'El origen y el destino son el mismo lugar.';
    const destino = this._lugarHoja(hasta);
    if (typeof destino === 'string') return destino;
    const n = o.tipo === 'unidad' ? 1 : enteroPositivo(cantidad);
    if (!n) return 'La cantidad tiene que ser un número entero mayor que 0.';
    const disp = this.cantidadEn(oid, desde);
    if (!disp) return 'Ese objeto no está en el lugar de origen.';
    if (n > disp) return `Solo hay ${disp} en el origen.`;
    if (o.tipo === 'unidad' && this.cantidadEn(oid, hasta) > 0) return 'Ese objeto ya está en el destino.';
    this._restar(oid, desde, n);
    this._sumar(oid, hasta, n);
    this._registrar('transferencia', oid, desde, hasta, n, nota);
    return null;
  }

  // ---------- Datos de ejemplo ----------
  cargarEjemplo() {
    this.almacen.vaciar();
    const fabio = this.almacen.insertar('usuarios', { id: 'U' + this.almacen.siguiente('usuarios'), nombre: 'Fabio', es_admin: true });
    const ana   = this.almacen.insertar('usuarios', { id: 'U' + this.almacen.siguiente('usuarios'), nombre: 'Ana', es_admin: false });
    const luis  = this.almacen.insertar('usuarios', { id: 'U' + this.almacen.siguiente('usuarios'), nombre: 'Luis', es_admin: false });
    const cA = this.almacen.insertar('establecimientos', { id: 'E' + this.almacen.siguiente('establecimientos'), nombre: 'Cliente A' });
    const cB = this.almacen.insertar('establecimientos', { id: 'E' + this.almacen.siguiente('establecimientos'), nombre: 'Cliente B' });
    this.almacen.insertar('membresias', { id: 'A' + this.almacen.siguiente('membresias'), uid: ana.id, eid: cA.id, rol: 'editor' });
    this.almacen.insertar('membresias', { id: 'A' + this.almacen.siguiente('membresias'), uid: luis.id, eid: cA.id, rol: 'lector' });

    this.uid = fabio.id;
    this.eid = cB.id;
    const e0B = this.crearLugar(null, '0').id;
    this.ponerNivelesTipicos(e0B);

    this.eid = cA.id;
    const e0 = this.crearLugar(null, '0').id;
    this.ponerNivelesTipicos(e0);
    const A = this.crearLugar(e0, 'A').id;
    ['1', '2', '3'].forEach(n => this.crearLugar(A, n));
    const a3 = this.hijos(A).find(l => l.codigo === '3').id;
    ['a', 'b', 'c'].forEach(d => this.crearLugar(a3, d));
    const B = this.crearLugar(e0, 'B').id;
    ['1', '2'].forEach(n => this.crearLugar(B, n));

    const e1 = this.crearLugar(null, '1').id;
    this.almacen.actualizar('lugares', e1, { niveles: [{ nombre: 'Estante', formato: 'numero', nombreOpcional: false }] });
    ['1', '2'].forEach(n => this.crearLugar(e1, n));

    const caja1 = this.crearObjeto('CAJA-778', 'Cajas de archivo 2019').objeto;
    const caja2 = this.crearObjeto('CAJA-779', 'Cajas de archivo 2020').objeto;
    const armario = this.crearObjeto('ARM-12', 'Armario metálico').objeto;
    const mesa = this.crearObjeto('', 'Mesa plegable').objeto;
    const resma = this.crearObjeto('RES-A4', 'Resma A4 75 g', 'producto', 10).objeto;
    const tinta = this.crearObjeto('TIN-N', 'Tinta negra', 'producto', 5).objeto;
    const divA = this.hijos(a3)[0].id;
    this.asignar(caja1.id, divA);
    this.asignar(caja2.id, divA);
    this.asignar(caja1.id, this.hijos(B)[1].id);
    this.asignar(armario.id, this.hijos(e1)[0].id);
    this.asignar(mesa.id, this.hijos(e1)[1].id);
    this.asignar(resma.id, this.hijos(B)[0].id, 12);
    this.asignar(tinta.id, this.hijos(e1)[0].id, 2);

    this.eid = cA.id;
  }
}
