// Modelo del depósito: consultas y reglas. No toca el DOM.
// Todo cambio pasa por el almacén (ver js/almacen/memoria.js).
// Las funciones de cambio devuelven null si salió bien o un texto con el error.

import { FORMATOS, NIVEL_EDIFICIO } from './formatos.js';

const porCodigo = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
const pad = n => String(n).padStart(4, '0');

export class Deposito {
  constructor(almacen) {
    this.almacen = almacen;
  }

  // ---------- Lectura ----------
  get lugares()      { return this.almacen.filas('lugares'); }
  get objetos()      { return this.almacen.filas('objetos'); }
  get asignaciones() { return this.almacen.filas('asignaciones'); }

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

  // Nivel que define un lugar (su tipo). Los edificios usan NIVEL_EDIFICIO.
  nivelDe(l) {
    const p = this.prof(l);
    return p === 0 ? NIVEL_EDIFICIO : this.edificioDe(l).niveles[p - 1];
  }
  // Nivel que tendrían los hijos de un lugar (o los edificios si padreId es null).
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
  tieneObjetos(l)    { return this.asignaciones.some(a => a.lid === l.id); }
  objetosDe(lid)     { return this.asignaciones.filter(a => a.lid === lid)
                           .map(a => this.objetoPorId(a.oid)).filter(Boolean); }
  ubicacionesDe(oid) { return this.asignaciones.filter(a => a.oid === oid)
                           .map(a => this.porId(a.lid)).filter(Boolean); }
  esHoja(l)          { return this.prof(l) > 0 && this.hijos(l.id).length === 0; }

  // ¿Hay lugares en esa profundidad dentro de este edificio?
  usadoEn(edId, profundidad) {
    return this.lugares.some(l => l.padre_id && this.edificioDe(l).id === edId && this.prof(l) === profundidad);
  }

  // ---------- Lugares ----------
  crearLugar(padreId, codigo, nombre) {
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
    const id = 'L' + this.almacen.siguiente('lugares');
    this.almacen.insertar('lugares', {
      id, padre_id: padreId || null, codigo: cod,
      nombre: (def.nombreOpcional && nombre) ? nombre.trim() : '',
      niveles: []
    });
    return { id };
  }

  crearLote(padreId, desde, hasta) {
    const { def } = this.nivelParaHijo(padreId);
    if (!def) return { error: 'Este edificio no tiene nivel para esta profundidad.' };
    const cods = this.rango(desde, hasta, def.formato);
    if (!cods) return { error: `Rango no válido. Usá ${FORMATOS[def.formato].txt} en ambos extremos, con el primero menor o igual al segundo.` };
    if (cods.length > 100) return { error: 'Máximo 100 por lote.' };
    let creados = 0;
    const errores = [];
    cods.forEach(c => {
      const r = this.crearLugar(padreId, c, '');
      r.error ? errores.push(`${c}: ${r.error}`) : creados++;
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
    const l = this.porId(id);
    if (!l) return 'Lugar inexistente.';
    const todos = [l, ...this.descendientes(l)];
    if (todos.some(x => this.tieneObjetos(x))) return 'Hay objetos dentro. Sacalos antes de borrar.';
    const ids = new Set(todos.map(x => x.id));
    this.almacen.borrarDonde('lugares', x => ids.has(x.id));
    return null;
  }

  editarLugar(id, cambios) {
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

  // Copia un lugar con todo lo que tiene adentro, sin objetos. Devuelve el id de la copia.
  copiarSubarbol(src, padreId, codigo) {
    let raiz = null;
    const copiar = (orig, padre, cod) => {
      const id = 'L' + this.almacen.siguiente('lugares');
      if (!raiz) raiz = id;
      this.almacen.insertar('lugares', {
        id, padre_id: padre, codigo: cod, nombre: orig.nombre, niveles: structuredClone(orig.niveles)
      });
      this.hijos(orig.id).forEach(h => copiar(h, id, h.codigo));
    };
    copiar(src, padreId, codigo);
    return raiz;
  }

  clonar(srcId, cantidad) {
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
    const ed = this.porId(edId);
    if (ed.niveles.length >= 6) return 'Máximo 6 niveles por edificio.';
    const nuevo = { nombre: `Nivel ${ed.niveles.length + 1}`, formato: 'numero', nombreOpcional: false };
    this.almacen.actualizar('lugares', edId, { niveles: [...ed.niveles, nuevo] });
    return null;
  }

  editarNivel(edId, i, campo, valor) {
    const ed = this.porId(edId);
    if (campo === 'formato' && this.usadoEn(edId, i + 1)) return 'Ese nivel ya tiene lugares. No se puede cambiar su formato.';
    const niveles = ed.niveles.map((n, k) => k === i ? { ...n, [campo]: valor } : n);
    this.almacen.actualizar('lugares', edId, { niveles });
    return null;
  }

  quitarNivel(edId) {
    const ed = this.porId(edId);
    const i = ed.niveles.length - 1;
    if (i < 0) return 'No hay niveles para quitar.';
    if (this.usadoEn(edId, i + 1)) return 'Ese nivel tiene lugares creados. Borralos antes.';
    this.almacen.actualizar('lugares', edId, { niveles: ed.niveles.slice(0, -1) });
    return null;
  }

  ponerNivelesTipicos(edId) {
    this.almacen.actualizar('lugares', edId, { niveles: [
      { nombre: 'Estantería', formato: 'letra',     nombreOpcional: false },
      { nombre: 'Estante',    formato: 'numero',    nombreOpcional: false },
      { nombre: 'División',   formato: 'letra_min', nombreOpcional: false }
    ] });
  }

  // ---------- Asignaciones ----------
  asignar(oid, lid) {
    if (!this.objetoPorId(oid)) return 'Objeto inexistente.';
    const l = this.porId(lid);
    if (!l) return 'Lugar inexistente.';
    if (this.prof(l) === 0) return 'Los edificios no tienen objetos directos. Elegí un lugar dentro.';
    if (this.hijos(l.id).length) return 'Este lugar tiene subdivisiones. Los objetos van dentro de ellas.';
    if (this.asignaciones.some(a => a.oid === oid && a.lid === lid)) return 'Ese objeto ya está en este lugar.';
    this.almacen.insertar('asignaciones', { oid, lid });
    return null;
  }

  liberar(oid, lid) {
    this.almacen.borrarDonde('asignaciones', a => a.oid === oid && a.lid === lid);
  }

  // ---------- Objetos ----------
  crearObjeto(codigoPropio, descripcion) {
    const cp = (codigoPropio || '').trim(), de = (descripcion || '').trim();
    if (!cp && !de) return { error: 'Ingresá un código propio o una descripción.' };
    const n = this.almacen.siguiente('objetos');
    const objeto = this.almacen.insertar('objetos', {
      id: 'O' + n, codigo_interno: 'OBJ-' + pad(n),
      codigo_propio: cp || null, descripcion: de || null
    });
    return { objeto };
  }

  borrarObjeto(oid) {
    this.almacen.borrarDonde('asignaciones', a => a.oid === oid);
    this.almacen.borrarDonde('objetos', o => o.id === oid);
  }

  // ---------- Datos de ejemplo ----------
  cargarEjemplo() {
    this.almacen.vaciar();
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
    const divA = this.hijos(a3)[0].id;
    this.asignar(caja1.id, divA);
    this.asignar(caja2.id, divA);
    this.asignar(caja1.id, this.hijos(B)[1].id);
    this.asignar(armario.id, this.hijos(e1)[0].id);
    this.asignar(mesa.id, this.hijos(e1)[1].id);
  }
}
