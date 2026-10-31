// Acciones de la interfaz. Cada botón (o select) con data-act llama a una de estas funciones.
// Reciben el dataset del elemento; en selects e inputs, además, el valor en `value`.
// Cambian el estado (S) o el modelo (ctx.dep). render() se llama después de cada evento.

import { ctx, S, aviso } from './estado.js';
import { correrPruebas } from '../core/pruebas.js';
import { metrosACm } from '../core/medidas.js';
import { api } from '../almacen/nube.js';
import { sonAledanos } from './plano.js';
import { abrirEtiquetas } from './etiquetas.js';
import { escanearCamara } from './escaner.js';
import { accionesRecorrido3d } from './recorrido3d.js';

const d = () => ctx.dep;

// Cantidades de la estructura, si el usuario la eligió (vacío = sin estructura).
const medidasDelFormulario = () => metrosACm(S.f.ancho, S.f.largo, S.f.alto);

const cuentasDelFormulario = () => S.f.usarEstructura
  ? d().nivelesBajo(S.nodo).map((_, i) => Number(S.f['cuenta' + i]))
  : [];

// Pide confirmación con una ventana de la app (en vez del cuadro del navegador). La acción confirmada es `accion`.
const pedirConfirmacion = (titulo, texto, accion, datos, boton) => { S.confirmar = { titulo, texto, accion, datos, boton }; S.modal = 'confirmar'; S.msg = {}; };
const limpiarModal = () => { S.confirmar = null; S.modal = null; S.editar = null; S.clon = null; S.verObj = null; S.elegirPara = null; S.elegirNodo = null; S.elegirLugares = []; S.elegirOrigen = null; S.msg = {}; };
const cerrarElegir = mensaje => { limpiarModal(); aviso('obj', null, mensaje); };

export const ACCIONES = {
  ...accionesRecorrido3d,
  // Navegación
  // Entre Asignación, Mover y Recorrido se conserva el lugar que se está mirando; a las demás vistas se va a la raíz.
  vista:   el => {
    const enPlano = v => ['plano', 'mover', 'recorrido3d'].includes(v);
    if (!(enPlano(S.vista) && enPlano(el.v))) S.nodo = null;
    // El lugar seleccionado es el destino de 'Por asignar': al cambiar de vista no se hereda uno de adentro
    // (por ejemplo, un hueco encontrado en el recorrido). El destino vuelve a ser el edificio que se está mirando.
    S.elegido = null;
    S.vista = el.v; S.msg = {};
  },
  // Entrar a un lugar se queda en la vista donde se está (Asignación o Mover).
  planoIr: el => {
    S.vista = S.vista === 'mover' ? 'mover' : 'plano';
    S.nodo = el.id || null; S.elegido = null; S.rec = { i: 0, resaltado: null }; S.msg = {};
    // Al cambiar de nivel se corta cualquier selección pendiente (por ejemplo, elegir un lugar para un objeto).
    S.elegirPara = null; S.elegirOrigen = null; S.elegirNodo = null; S.elegirLugares = [];
  },
  // Doble clic en la tarjeta Contenido: muestra en un modal los objetos puestos en ese lugar.
  verContenido: el => { S.verObj = el.id; S.modal = 'contenido'; S.msg = {}; },
  // Un clic en un lugar lo selecciona: es el destino de 'Por asignar'.
  planoSeleccionar: el => { S.elegido = el.id || null; S.msg = {}; },
  // Vuelve un nivel arriba en el plano (al padre; si era de primer nivel, a la raíz).
  subirNivel: () => { const l = d().porId(S.nodo); S.nodo = l?.padre_id || null; S.elegido = null; S.msg = {}; },

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
    // Medidas (opcionales, solo para edificios): se indican en metros y se guardan en cm.
    const medidas = medidasDelFormulario();
    if (medidas && medidas.error) return aviso('crear', medidas.error);
    const r = d().crearArbol(S.nodo, S.f.codigo, S.f.nombre, cuentasDelFormulario(), medidas);
    aviso('crear', r.error, r.creados > 1 ? `Creados: ${r.creados}.` : 'Creado.');
    if (!r.error) { S.f.codigo = ''; S.f.nombre = ''; S.f.ancho = ''; S.f.largo = ''; S.f.alto = ''; }
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
    const texto = `Se borra "${d().dir(l)}".` + (dentro ? ` También se borran los ${dentro} lugares que tiene adentro.` : '') + ' No se puede deshacer.';
    pedirConfirmacion('Borrar lugar', texto, 'borrarLugarOk', { id: el.id }, 'Borrar lugar');
  },
  borrarLugarOk: el => { limpiarModal(); aviso('borrar', d().borrarLugar(el.id), 'Borrado.'); },
  toggleNiveles: () => { S.editarNiveles = !S.editarNiveles; S.msg = {}; },
  abrirNiveles: () => { S.editarNiveles = true; S.modal = 'niveles'; S.msg = {}; },
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

  // Clonar un hijo existente del nivel que se mira (la copia queda al mismo nivel).
  clonarNivelAbrir: () => {
    S.clon = d().hijos(S.nodo || null)[0]?.id || null;
    S.modal = 'clonarNivel'; S.msg = {};
  },
  clonarElegir: el => { S.clon = el.value || null; S.msg = {}; },
  clonarEjecutar: () => {
    const r = d().clonar(S.clon, S.f.cantClon);
    if (r.error) return aviso('clon', r.error);
    aviso('clon', null, `Creadas: ${r.creados.join(', ')}.`);
  },

  // Objetos dentro de un lugar (ventana)
  verObjetos: el => { S.verObj = el.id; S.modal = 'objetos'; S.msg = {}; },
  // Lugar elegido para un objeto sin lugar (selector de un estante o estantería).
  // Tocar un objeto de 'Por asignar' lo pone en el lugar destino (el seleccionado, o el lugar en el que estás).
  ponerObjeto: el => {
    const err = d().asignar(el.oid, el.lugar);
    aviso('objetos', err, 'Puesto en el lugar.');
  },
  // Por código: el lugar se busca por su identificador (QR) o por su código visible, y el objeto por su código.
  // Enter en el lugar pasa al objeto; Enter en el objeto asigna. El lugar queda elegido para seguir escaneando.
  asignarPorCodigo: () => {
    const dep = d();
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const raw = String(S.f.codLugar || '').trim();
    const lc = norm(raw);
    const lugar = raw ? (dep.lugares.find(l => l.id === raw) || dep.lugares.find(l => lc && norm(dep.dir(l)) === lc)) : null;
    S.enfocar = 'codObjeto';
    if (!lugar) return aviso('codigo', `No encuentro un lugar con el código "${raw}".`);
    const oc = norm(S.f.codObjeto);
    const obj = oc ? dep.objetos.find(o => norm(o.codigo_interno) === oc || (o.codigo_propio && norm(o.codigo_propio) === oc)) : null;
    if (!obj) return aviso('codigo', `No encuentro un objeto con el código "${S.f.codObjeto}".`);
    const cant = obj.tipo === 'producto' ? (S.f.codCant || '1') : '1';
    const err = dep.asignar(obj.id, lugar.id, cant);
    aviso('codigo', err, `${obj.codigo_interno} asignado en ${dep.dir(lugar)}.`);
    if (!err) S.f.codObjeto = '';
  },
  enfocar: el => { S.enfocar = el.campo || null; },
  // Lee con la cámara el QR del lugar (campo codLugar) o del objeto (campo codObjeto).
  // Al leer el objeto, si ya hay un lugar cargado, asigna sin tener que tocar nada más.
  escanear: el => {
    const campo = el.campo;
    const error = escanearCamara({
      alDetectar: texto => {
        S.f[campo] = texto;
        if (campo === 'buscar') {
          ACCIONES.buscarFicha();
        } else if (campo === 'codContar') {
          ACCIONES.contarLugar();
        } else if (campo === 'codDonde') {
          ACCIONES.dondeEsta();
        } else if (campo === 'codLugar') {
          S.enfocar = 'codObjeto';
        } else if (S.f.codLugar) {
          ACCIONES.asignarPorCodigo();
        }
        ctx.render();
        if (ctx.sesion) ctx.sincronizar();
      },
      alError: msg => { aviso('codigo', msg); ctx.render(); },
    });
    if (error) aviso('codigo', error);
  },
  // "¿Dónde está?": un lugar o un objeto, escrito o escaneado (misma regla que el recorrido).
  dondeEsta: () => {
    const dep = d();
    const raw = String(S.f.codDonde || '').trim();
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(raw);
    if (!q) return aviso('donde', 'Escribí o escaneá un código de lugar u objeto.');
    const lugar = dep.lugares.find(l => l.id === raw || norm(dep.dir(l)) === q);
    if (lugar) return aviso('donde', null, `Lugar: ${dep.dir(lugar)}.`);
    const obj = dep.objetos.find(o => norm(o.codigo_interno) === q || (o.codigo_propio && norm(o.codigo_propio) === q));
    if (!obj) return aviso('donde', `No encuentro un lugar ni un objeto con el código "${raw}".`);
    const ubicaciones = dep.ubicacionesDe(obj.id);
    if (!ubicaciones.length) return aviso('donde', `${obj.codigo_interno} no está puesto en ningún lugar.`);
    aviso('donde', null, `${obj.codigo_interno} está en ${dep.dir(ubicaciones[0])}.`);
  },
  // Activa o desactiva vencimientos para el cliente abierto (solo administrador general).
  guardarVencimientos: () => {
    const marcado = !!document.querySelector('input[data-f="vencimientosCliente"]')?.checked;
    const err = d().fijarVencimientos(marcado);
    aviso('cliente', err, marcado ? 'Vencimientos activados para este cliente.' : 'Vencimientos desactivados para este cliente.');
  },
  // Inicio: busca un lugar o un objeto (código exacto, o descripción si es única) y abre su ficha.
  buscarFicha: () => {
    const dep = d();
    const raw = String(S.f.buscar || '').trim();
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(raw);
    if (!q) return aviso('inicio', 'Escribí o escaneá un código o descripción.');
    const lugar = dep.lugares.find(l => l.id === raw || norm(dep.dir(l)) === q);
    let obj = lugar ? null : dep.objetos.find(o => norm(o.codigo_interno) === q || (o.codigo_propio && norm(o.codigo_propio) === q));
    if (!lugar && !obj) {
      const parecidos = dep.objetos.filter(o => norm(o.descripcion).includes(q) || norm(o.codigo_interno).includes(q));
      if (parecidos.length === 1) obj = parecidos[0];
      else if (parecidos.length > 1) return aviso('inicio', `Hay ${parecidos.length} objetos con "${raw}". Escribí el código para elegir uno.`);
      else return aviso('inicio', `No encuentro un lugar ni un objeto con "${raw}".`);
    }
    S.ficha = lugar ? { tipo: 'lugar', id: lugar.id } : { tipo: 'objeto', id: obj.id };
    S.vista = 'ficha'; S.msg = {};
    S.f.buscar = '';
  },
  abrirFicha: el => { S.ficha = { tipo: el.tipo, id: el.id }; S.vista = 'ficha'; S.msg = {}; },
  // Desde la ficha: abre la estructura en el nivel donde está el lugar (o el primero donde está el objeto).
  verEnEstructura: el => {
    const dep = d();
    const l = el.tipo === 'objeto' ? dep.ubicacionesDe(el.id)[0] : dep.porId(el.id);
    if (!l) return aviso('ficha', 'Ese objeto no está en ningún lugar.');
    const nivel = dep.esHoja(l) ? l.padre_id : l.id;
    S.vista = 'plano';
    ACCIONES.planoIr({ id: nivel });
  },
  // Desde la ficha: abre el edificio en el recorrido 3D, frente a la estantería del lugar.
  verEnRecorrido: el => {
    const dep = d();
    const l = el.tipo === 'objeto' ? dep.ubicacionesDe(el.id)[0] : dep.porId(el.id);
    if (!l) return aviso('ficha', 'Ese objeto no está en ningún lugar.');
    S.nodo = dep.ruta(l)[0].id;
    S.f.recBusca = dep.dir(l);
    S.vista = 'recorrido3d';
    S.rec = { i: 0, resaltado: null };
    ACCIONES.recBuscar({});
  },
  filtrarStock: el => { S.f.filtroStock = el.v; },
  // En celular, el panel de objetos por asignar se abre y cierra con su botón (no tapa el plano).
  toggleAsignar: () => { S.f.asignarAbierto = !S.f.asignarAbierto; },
  filtrarMov: el => { S.f.filtroMov = el.v; },
  // Desde la ficha: saca la cantidad escrita (productos) o la unidad, del lugar indicado.
  sacarDeFicha: el => {
    const o = d().objetoPorId(el.oid);
    const cant = o?.tipo === 'producto' ? (S.f.cantFicha || '1') : '1';
    aviso('obj', d().retirar(el.oid, el.lid, cant), 'Sacado del depósito.');
  },
  // Desde la ficha: lleva a Ingresar con el lugar (o el objeto) ya escrito.
  ingresarEn: el => {
    const dep = d();
    if (el.tipo === 'objeto') {
      const o = dep.objetoPorId(el.id);
      if (!o) return;
      S.f.codObjeto = o.codigo_interno;
    } else {
      const l = dep.porId(el.id);
      if (!l) return;
      S.f.codLugar = dep.dir(l);
    }
    S.vista = 'codigo'; S.msg = {};
  },
  // Desde la ficha de un lugar: lo cuenta ahora.
  contarEn: el => {
    const l = d().porId(el.id);
    if (!l) return;
    S.f.codContar = d().dir(l);
    ACCIONES.contarLugar();
    S.vista = 'codigo';
  },
  // Conteo: abre el lugar y carga lo que el sistema tiene como punto de partida.
  contarLugar: () => {
    const dep = d();
    const raw = String(S.f.codContar || '').trim();
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = norm(raw);
    const lugar = q ? dep.lugares.find(l => l.id === raw || norm(dep.dir(l)) === q) : null;
    if (!lugar) return aviso('conteo', raw ? `No encuentro un lugar con el código "${raw}".` : 'Escribí o escaneá el código del lugar.');
    if (!dep.esHoja(lugar)) return aviso('conteo', 'Para contar, elegí un lugar del último nivel (donde se guardan los objetos).');
    S.conteo = lugar.id;
    dep.objetosDe(lugar.id).forEach(o => { S.f['conteo_' + o.id] = String(dep.cantidadEn(o.id, lugar.id)); });
  },
  cancelarConteo: () => { S.conteo = null; },
  // Guarda lo contado: el sistema queda igual a lo que hay de verdad, con un movimiento por cada diferencia.
  guardarConteo: () => {
    const dep = d();
    const lid = S.conteo;
    if (!lid) return;
    const cuentas = {};
    dep.objetosDe(lid).forEach(o => { cuentas[o.id] = S.f['conteo_' + o.id] ?? String(dep.cantidadEn(o.id, lid)); });
    const err = dep.contar(lid, cuentas);
    if (err) return aviso('conteo', err);
    S.conteo = null;
    aviso('conteo', null, 'Conteo guardado. Las diferencias quedaron en Movimientos.');
  },
  // Tocar un objeto de la lista "Bajo mínimo": dice dónde está.
  ubicarObjeto: el => {
    S.f.codDonde = el.codigo || '';
    ACCIONES.dondeEsta();
  },
  // Etiqueta de un solo lugar (QR = su identificador) o de un solo objeto (QR = su código interno).
  etiquetaLugar: el => {
    const dep = d();
    const l = dep.porId(el.id);
    if (!l) return;
    aviso('codigo', abrirEtiquetas('Etiqueta de lugar', [{ codigo: l.id, titulo: dep.dir(l), detalle: l.nombre || '' }]));
  },
  etiquetaObjeto: el => {
    const dep = d();
    const o = dep.objetoPorId(el.oid);
    if (!o) return;
    aviso('codigo', abrirEtiquetas('Etiqueta de objeto', [{ codigo: o.codigo_interno, titulo: o.codigo_interno, detalle: [o.codigo_propio, o.descripcion].filter(Boolean).join(' · ') }]));
  },
  // Hoja de etiquetas QR de todos los lugares o de todos los objetos.
  imprimirEtiquetas: el => {
    const dep = d();
    const items = el.que === 'objetos'
      ? dep.objetos.map(o => ({ codigo: o.codigo_interno, titulo: o.codigo_interno, detalle: [o.codigo_propio, o.descripcion].filter(Boolean).join(' · ') }))
      : dep.lugares.map(l => ({ codigo: l.id, titulo: dep.dir(l), detalle: l.nombre || '' }));
    aviso('codigo', abrirEtiquetas(el.que === 'objetos' ? 'Etiquetas de objetos' : 'Etiquetas de lugares', items));
  },
  // Mover: lugar elegido para un objeto que está en un lugar (fila de la vista Mover).
  moverEn: el => { S.f.moverA = { ...S.f.moverA, [`${el.oid}|${el.lid}`]: el.value || null }; },
  moverObjeto: el => {
    const key = `${el.oid}|${el.lid}`;
    const hasta = S.f.moverA?.[key];
    if (!hasta) return aviso('objetos', 'Elegí a dónde moverlo.');
    const o = d().objetoPorId(el.oid);
    const cant = o?.tipo === 'producto' ? (S.f.cantPara[el.oid] || '1') : '1';
    const err = d().transferir(el.oid, el.lid, hasta, cant);
    aviso('objetos', err, 'Movido.');
    if (!err) S.f.moverA = { ...S.f.moverA, [key]: null };
  },
  // Saca de un lugar la cantidad elegida (una unidad, o la cantidad escrita para productos).
  sacarDeLugar: el => {
    const o = d().objetoPorId(el.oid);
    const cant = o?.tipo === 'producto' ? (S.f.cantPara[el.oid] || '1') : '1';
    aviso(S.modal === 'objetos' || ['plano', 'mover'].includes(S.vista) ? 'objetos' : 'obj', d().retirar(el.oid, el.lid, cant), 'Sacado del depósito.');
  },

  // Stock desde la tabla

  // Elegir el lugar de un objeto mirando el plano (solo se navega y se elige; Agregar confirma).
  elegirEnPlano: el => { S.elegirPara = el.oid; S.elegirModo = 'asignar'; S.elegirOrigen = null; S.elegirNodo = null; S.elegirLugares = []; S.modal = 'elegirLugar'; S.msg = {}; },
  // Mover: si el objeto está en un solo lugar, sale de ahí; si está en varios, se elige de cuál.
  moverEnPlano: el => {
    const ub = d().ubicacionesDe(el.oid);
    S.elegirPara = el.oid; S.elegirModo = 'mover'; S.elegirOrigen = ub.length === 1 ? ub[0].id : null;
    S.elegirNodo = null; S.elegirLugares = []; S.modal = 'elegirLugar'; S.msg = {};
  },
  elegirOrigen: el => { S.elegirOrigen = el.id || null; S.msg = {}; },
  // Desde Stock: lleva a Por código con el objeto ya cargado; solo falta tocar el lugar.
  asignarDesdeStock: el => {
    const o = d().objetoPorId(el.oid);
    S.f.codObjeto = o?.codigo_interno || '';
    S.f.codLugar = '';
    S.vista = 'codigo'; S.msg = {}; S.enfocar = 'codLugar';
  },
  elegirIr: el => { S.elegirNodo = el.id || null; S.msg = {}; },
  // Una unidad va en un solo lugar: se asigna de una vez. Un producto puede ir en varios lugares
  // aledaños: el primero que se toca manda, y los siguientes tienen que estar cerca de él.
  elegir: el => {
    if (!S.elegirPara) return;
    const o = d().objetoPorId(S.elegirPara);
    if (!o) return;
    // Mover: sale de S.elegirOrigen y va a un lugar, o a SALIDA (sale del sistema).
    if (S.elegirModo === 'mover') {
      if (!S.elegirOrigen) return aviso('elegir', 'Primero elegí de qué lugar sale.');
      const cant = o.tipo === 'producto' ? (S.f.cantPara[o.id] || '1') : '1';
      if (el.id === 'SALIDA') {
        const err = d().retirar(o.id, S.elegirOrigen, cant);
        if (err) return aviso('elegir', err);
        return cerrarElegir(`${o.codigo_interno} salió del sistema.`);
      }
      const destino = d().porId(el.id);
      if (!destino) return;
      const err = d().transferir(o.id, S.elegirOrigen, destino.id, cant);
      if (err) return aviso('elegir', err);
      return cerrarElegir(`${o.codigo_interno} movido a ${d().dir(destino)}.`);
    }
    const l = d().porId(el.id);
    if (!l) return;
    // Asignar: una unidad va en un solo lugar; un producto puede ir en varios aledaños.
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

  cargarPaquetesPrueba: () => {
    const r = d().cargarPaquetesPrueba();
    aviso('objetos', r.error, `Paquetes de prueba agregados: ${r.creados}.`);
  },
  ubicarPaquetesPrueba: () => {
    const r = d().ubicarPaquetesPrueba();
    aviso('objetos', r.error, `Paquetes de prueba ubicados en lugares al azar: ${r.ubicados}${r.noPudieron ? `. No hubo lugar para ${r.noPudieron}` : ''}.`);
  },
  devolverPaquetesPrueba: () => {
    const r = d().devolverPaquetesPrueba();
    aviso('objetos', r.error, `Paquetes de prueba devueltos a pendientes: ${r.sacados}.`);
  },
  abrirNuevoObjeto: () => { S.modal = 'nuevoObjeto'; S.msg = {}; },
  crearObjeto: () => {
    const r = d().crearObjeto(S.f.codigoP, S.f.desc, S.f.tipoNuevo, S.f.minimoNuevo);
    if (r.objeto && S.f.venceNuevo) d().fijarVencimiento(r.objeto.id, S.f.venceNuevo);
    if (r.error) return aviso('obj', r.error);
    S.f.codigoP = ''; S.f.desc = ''; S.f.minimoNuevo = ''; S.f.venceNuevo = '';
    S.modal = null;
    aviso('obj', null, `Objeto creado: ${r.objeto.codigo_interno}`);
  },
  borrarObjeto: el => {
    const o = d().objetoPorId(el.oid);
    if (!o) return;
    // Con stock no se puede borrar: se avisa antes de pedir confirmación.
    if (d().existenciaTotal(o.id) > 0) return aviso('obj', 'Ese objeto tiene existencias. Sacalas antes de borrarlo.');
    pedirConfirmacion('Borrar objeto', `Se borra ${o.codigo_interno} y todo lo que tiene registrado. No se puede deshacer.`, 'borrarObjetoOk', { oid: el.oid }, 'Borrar objeto');
  },
  borrarObjetoOk: el => { limpiarModal(); aviso('obj', d().borrarObjeto(el.oid), 'Objeto borrado.'); },

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

