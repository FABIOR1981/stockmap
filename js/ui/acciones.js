// Acciones de la interfaz. Cada botón con data-act llama a una de estas funciones.
// Cambian el estado (S) o el modelo (ctx.dep); render() se llama después de cada clic.

import { ctx, S, aviso } from './estado.js';
import { correrPruebas } from '../core/pruebas.js';

const d = () => ctx.dep;

const limpiarModal = () => { S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.msg = {}; };

export const ACCIONES = {
  // Navegación
  vista:   el => { S.vista = el.v; S.nodo = null; S.msg = {}; },
  nodo:    el => { S.vista = 'estructura'; S.nodo = el.id || null; S.msg = {}; },
  planoIr: el => { S.vista = 'plano'; S.nodo = el.id || null; S.msg = {}; },

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

  // Borrar, niveles y edición
  borrarLugar: el => {
    const l = d().porId(el.id);
    if (!l) return;
    const dentro = d().descendientes(l).length;
    const pregunta = `¿Borrar "${d().dir(l)}"?` + (dentro ? ` Se borran también ${dentro} lugares que tiene adentro.` : '');
    if (!window.confirm(pregunta)) return;
    aviso('borrar', d().borrarLugar(el.id), 'Borrado.');
  },
  nivelesTipicos: () => { d().ponerNivelesTipicos(S.nodo); aviso('niveles', null, 'Niveles definidos.'); },
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

  // Objetos
  verObjetos: el => { S.verObj = el.id; S.modal = 'objetos'; S.msg = {}; },
  asignarAqui: el => {
    const e = d().asignar(S.f.objAqui, el.lid);
    aviso('objetos', e, 'Agregado.');
    if (!e) S.f.objAqui = '';
  },
  asignarObj: el => {
    const lid = S.f.lugarPara[el.oid];
    if (!lid) return aviso('obj', 'Elegí el lugar donde lo querés agregar.');
    aviso('obj', d().asignar(el.oid, lid), 'Agregado.');
  },
  liberarPar: el => {
    d().liberar(el.oid, el.lid);
    aviso(S.modal === 'objetos' ? 'objetos' : 'obj', null, 'Sacado de ese lugar.');
  },
  abrirNuevoObjeto: () => { S.modal = 'nuevoObjeto'; S.msg = {}; },
  crearObjeto: () => {
    const r = d().crearObjeto(S.f.codigoP, S.f.desc);
    if (r.error) return aviso('obj', r.error);
    S.f.codigoP = ''; S.f.desc = '';
    S.modal = null;
    aviso('obj', null, `Objeto creado: ${r.objeto.codigo_interno}`);
  },
  borrarObjeto: el => {
    const o = d().objetoPorId(el.oid);
    if (o && !window.confirm(`¿Borrar el objeto ${o.codigo_interno}? Se saca también de todos sus lugares.`)) return;
    d().borrarObjeto(el.oid);
    aviso('obj', null, 'Objeto borrado.');
  },

  // Ventanas, pruebas y datos de ejemplo
  modalCerrar:   () => limpiarModal(),
  pruebas:       () => { S.pruebas = correrPruebas(d()); },
  cerrarPruebas: () => { S.pruebas = null; },
  ejemplo:       () => {
    d().cargarEjemplo();
    S.vista = 'estructura'; S.nodo = null; S.msg = {}; S.f.lugarPara = {}; S.posiciones = {};
  }
};
