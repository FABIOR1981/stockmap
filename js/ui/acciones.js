// Acciones de la interfaz. Cada botón (o select) con data-act llama a una de estas funciones.
// Reciben el dataset del elemento; en selects e inputs, además, el valor en `value`.
// Cambian el estado (S) o el modelo (ctx.dep). render() se llama después de cada evento.

import { ctx, S, aviso } from './estado.js';
import { correrPruebas } from '../core/pruebas.js';

const d = () => ctx.dep;

const limpiarModal = () => { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.mover = null; S.msg = {}; };

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
  crearUsuario: () => {
    const r = d().crearUsuario(S.f.nuevoUsuario, S.f.nuevoUsuarioAdmin);
    if (r.error) return aviso('usuario', r.error);
    S.f.nuevoUsuario = ''; S.f.nuevoUsuarioAdmin = false;
    aviso('usuario', null, `Usuario creado: ${r.usuario.nombre}.`);
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
    const r = d().crearLugar(S.nodo, S.f.codigo, S.f.nombre);
    aviso('crear', r.error, 'Creado.');
    if (!r.error) { S.f.codigo = ''; S.f.nombre = ''; }
  },
  lote: () => {
    const r = d().crearLote(S.nodo, S.f.desde, S.f.hasta);
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
  asignarObj: el => {
    const lid = S.f.lugarPara[el.oid];
    if (!lid) return aviso('obj', 'Elegí el lugar donde lo querés agregar.');
    const cant = S.f.cantPara[el.oid] || '1';
    aviso('obj', d().asignar(el.oid, lid, cant), 'Agregado.');
  },
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

  // Ventanas, pruebas y datos de ejemplo
  modalCerrar:   () => limpiarModal(),
  pruebas:       () => { S.pruebas = correrPruebas(d()); },
  cerrarPruebas: () => { S.pruebas = null; },
  ejemplo:       () => {
    d().cargarEjemplo();
    S.vista = 'estructura'; S.nodo = null; S.msg = {};
    S.f.lugarPara = {}; S.f.cantPara = {}; S.posiciones = {};
  }
};

