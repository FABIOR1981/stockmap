// Acciones de la interfaz. Cada botón (o select) con data-act llama a una de estas funciones.
// Reciben el dataset del elemento; en selects e inputs, además, el valor en `value`.
// Cambian el estado (S) o el modelo (ctx.dep). render() se llama después de cada evento.

import { ctx, S, aviso } from './estado.js';
import { correrPruebas } from '../core/pruebas.js';
import { api } from '../almacen/nube.js';
import { sonAledanos } from './plano.js';

const d = () => ctx.dep;

// Cantidades de la estructura, si el usuario la eligió (vacío = sin estructura).
const cuentasDelFormulario = () => S.f.usarEstructura
  ? d().nivelesBajo(S.nodo).map((_, i) => Number(S.f['cuenta' + i]))
  : [];

const limpiarModal = () => { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.mover = null; S.elegirPara = null; S.elegirNodo = null; S.elegirLugares = []; S.msg = {}; };
const cerrarElegir = mensaje => { limpiarModal(); aviso('obj', null, mensaje); };

export const ACCIONES = {
  // Navegación
  vista:   el => { S.vista = el.v; S.nodo = null; S.msg = {}; },
  nodo:    el => { S.vista = 'estructura'; S.nodo = el.id || null; S.msg = {}; },
  planoIr: el => { S.vista = 'plano'; S.nodo = el.id || null; S.msg = {}; },

  // Sesión: usuario y cliente
  usuario: el => {
    const err = d().elegirUsuario(el.value);
    S.nodo = null; S.modal = null;
    aviso('cliente', err);
  },
  cliente: el => {
    const err = d().elegirEstablecimiento(el.value || el.v || null);
    S.nodo = null; S.modal = null;
    aviso('cliente', err);
  },
  crearCliente: () => {
    const r = d().crearEstablecimiento(S.f.nuevoCliente);
    if (r.error) return aviso('cliente', r.error);
    S.f.nuevoCliente = '';
    aviso('cliente', null, `Cliente creado: ${r.establecimiento.nombre}. Elegilo en la barra lateral para cargar su depósito.`);
  },
  // El usuario se crea en Supabase Auth a través de la API (solo administrador general).
  crearUsuario: async () => {
    const f = S.f;
    if (!f.nuevoUsuarioEmail || !f.nuevoUsuarioClave) return aviso('usuario', 'Email y contraseña son obligatorios.');
    try {
      await api.crearUsuario({ email: f.nuevoUsuarioEmail.trim(), password: f.nuevoUsuarioClave, nombre: f.nuevoUsuario, es_admin: !!f.nuevoUsuarioAdmin });
    } catch (e) {
      return aviso('usuario', e.message);
    }
    f.nuevoUsuario = ''; f.nuevoUsuarioEmail = ''; f.nuevoUsuarioClave = ''; f.nuevoUsuarioAdmin = false;
    await ctx.recargar();
    aviso('usuario', null, 'Usuario creado. Ya puede ingresar con su email y contraseña.');
  },

  // Accesos del cliente
  darAcceso: () => {
    if (!S.f.accUid) return aviso('acceso', 'Elegí un usuario.');
    const err = d().darAcceso(S.f.accUid, S.f.accRol);
    if (!err) S.f.accUid = '';
    aviso('acceso', err, 'Acceso dado.');
  },
  cambiarRol: el => aviso('acceso', d().darAcceso(el.uid, el.value), 'Rol actualizado.'),
  quitarAcceso: el => aviso('acceso', d().quitarAcceso(el.uid), 'Acceso quitado.'),

  // Crear lugares
  abrirCrear: () => { S.modal = 'crear'; S.msg = {}; },
  crear: () => {
    const r = d().crearArbol(S.nodo, S.f.codigo, S.f.nombre, cuentasDelFormulario());
    aviso('crear', r.error, r.creados > 1 ? `Creados: ${r.creados}.` : 'Creado.');
    if (!r.error) { S.f.codigo = ''; S.f.nombre = ''; }
  },
  verVarios: () => { S.f.verVarios = !S.f.verVarios; S.msg = {}; },
  lote: () => {
    const r = d().crearLote(S.nodo, S.f.desde, S.f.hasta, cuentasDelFormulario());
    if (r.error) return aviso('lote', r.error);
    aviso('lote', r.errores.length ? r.errores.join(' · ') : null, `${r.creados} creados.`);
  },

  // Borrar, niveles y edición de lugares
  borrarLugar: el => {
    const l = d().porId(el.id);
    if (!l) return;
    const dentro = d().descendientes(l).length;
    const pregunta = `¿Borrar "${d().dir(l)}"?` + (dentro ? ` Se borran también ${dentro} lugares que tiene adentro.` : '');
    if (!window.confirm(pregunta)) return;
    aviso('borrar', d().borrarLugar(el.id), 'Borrado.');
  },
  toggleNiveles: () => { S.editarNiveles = !S.editarNiveles; S.msg = {}; },
  nivelesTipicos: () => aviso('niveles', d().ponerNivelesTipicos(S.nodo), 'Niveles definidos.'),
  agregarNivel:   () => aviso('niveles', d().agregarNivel(S.nodo)),
  quitarNivel:    () => aviso('niveles', d().quitarNivel(S.nodo)),

  editarAbrir: el => {
    const l = d().porId(el.id);
    S.editar = el.id; S.modal = 'editar'; S.msg = {};
    S.f.edCodigo = l.codigo; S.f.edNombre = l.nombre;
  },
  editarGuardar: () => aviso('editar',
    d().editarLugar(S.editar, { codigo: S.f.edCodigo, nombre: S.f.edNombre }), 'Cambios guardados.'),

  clonarAbrir: el => { S.clon = el.id; S.modal = 'clonar'; S.msg = {}; },
  clonarEjecutar: () => {
    const r = d().clonar(S.clon, S.f.cantClon);
    if (r.error) return aviso('clon', r.error);
    aviso('clon', null, `Creadas: ${r.creados.join(', ')}.`);
  },

  // Objetos dentro de un lugar (ventana)
  verObjetos: el => { S.verObj = el.id; S.modal = 'objetos'; S.msg = {}; },
  asignarAqui: el => {
    const err = d().asignar(S.f.objAqui, el.lid);
    aviso('objetos', err, 'Agregado.');
    if (!err) S.f.objAqui = '';
  },
  liberarPar: el => {
    const err = d().liberar(el.oid, el.lid);
    aviso(S.modal === 'objetos' ? 'objetos' : 'obj', err, 'Sacado de ese lugar.');
  },

  // Stock desde la tabla
  moverAbrir: el => {
    S.mover = { oid: el.oid, lid: el.lid }; S.modal = 'mover'; S.msg = {};
    S.f.cantMov = '1'; S.f.mvHasta = '';
  },
  moverEjecutar: () => {
    const { oid, lid } = S.mover || {};
    if (!oid) return;
    const err = S.f.mvHasta
      ? d().transferir(oid, lid, S.f.mvHasta, S.f.cantMov)
      : d().retirar(oid, lid, S.f.cantMov);
    if (err) return aviso('mover', err);
    S.modal = null; S.mover = null;
    aviso('obj', null, S.f.mvHasta ? 'Movido.' : 'Retirado del depósito.');
  },

  // Elegir el lugar de un objeto mirando el plano (solo se navega y se elige; Agregar confirma).
  elegirEnPlano: el => { S.elegirPara = el.oid; S.elegirNodo = null; S.elegirLugares = []; S.modal = 'elegirLugar'; S.msg = {}; },
  elegirIr: el => { S.elegirNodo = el.id || null; S.msg = {}; },
  // Una unidad va en un solo lugar: se asigna de una vez. Un producto puede ir en varios lugares
  // aledaños: el primero que se toca manda, y los siguientes tienen que estar cerca de él.
  elegir: el => {
    const l = d().porId(el.id);
    if (!l || !S.elegirPara) return;
    const o = d().objetoPorId(S.elegirPara);
    if (o.tipo === 'unidad') {
      const err = d().asignar(o.id, l.id, '1');
      if (err) return aviso('elegir', err);
      return cerrarElegir(`${o.codigo_interno} agregado en ${d().dir(l)}.`);
    }
    const elegidos = S.elegirLugares;
    if (elegidos.includes(l.id)) { S.elegirLugares = elegidos.filter(x => x !== l.id); aviso('elegir', null); return; }
    if (elegidos.length && !sonAledanos(d().porId(elegidos[0]), l)) {
      return aviso('elegir', 'Ese lugar no está cerca del primero. Los lugares tienen que estar en el mismo plano y uno al lado del otro.');
    }
    S.elegirLugares = [...elegidos, l.id];
    aviso('elegir', null);
  },
  elegirConfirmar: () => {
    const oid = S.elegirPara, ids = S.elegirLugares;
    if (!oid || !ids.length) return aviso('elegir', 'Elegí al menos un lugar.');
    const cant = S.f.cantPara[oid] || '1';
    for (const lid of ids) {
      const err = d().asignar(oid, lid, cant);
      if (err) return aviso('elegir', err);
    }
    cerrarElegir(`${d().objetoPorId(oid).codigo_interno} agregado en ${ids.length} ${ids.length > 1 ? 'lugares' : 'lugar'}.`);
  },

  abrirNuevoObjeto: () => { S.modal = 'nuevoObjeto'; S.msg = {}; },
  crearObjeto: () => {
    const r = d().crearObjeto(S.f.codigoP, S.f.desc, S.f.tipoNuevo, S.f.minimoNuevo);
    if (r.error) return aviso('obj', r.error);
    S.f.codigoP = ''; S.f.desc = ''; S.f.minimoNuevo = '';
    S.modal = null;
    aviso('obj', null, `Objeto creado: ${r.objeto.codigo_interno}`);
  },
  borrarObjeto: el => {
    const o = d().objetoPorId(el.oid);
    if (o && !window.confirm(`¿Borrar el objeto ${o.codigo_interno}?`)) return;
    aviso('obj', d().borrarObjeto(el.oid), 'Objeto borrado.');
  },

  // Ventanas y pruebas
  modalCerrar:   () => limpiarModal(),
  pruebas:       () => { S.pruebas = correrPruebas(d()); },
  cerrarPruebas: () => { S.pruebas = null; },

  // Sesión
  salir: async () => {
    await api.logout().catch(() => {});
    location.reload();
  }
};

