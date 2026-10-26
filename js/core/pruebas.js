// Pruebas de las reglas del depósito. Corren sobre el modelo, sin DOM.
// Al terminar devuelven los datos y la sesión (usuario y cliente) a como estaban.

export function correrPruebas(dep) {
  const almacen = dep.almacen;
  const copia = almacen.snapshot();
  const sesion = { uid: dep.uid, eid: dep.eid };
  const R = [];
  const t = (nombre, cond) => R.push({ nombre, ok: !!cond });
  const ej = () => dep.cargarEjemplo();
  const bld = c => dep.hijos(null).find(x => x.codigo === c);
  const kid = (p, c) => dep.hijos(p.id).find(x => x.codigo === c);
  const obj = () => dep.crearObjeto('', 'prueba').objeto;
  const usuario = n => dep.usuarios.find(u => u.nombre === n);
  const cliente = n => dep.establecimientos.find(e => e.nombre === n);
  const B1 = () => kid(kid(bld('0'), 'B'), '1');
  const B2 = () => kid(kid(bld('0'), 'B'), '2');
  const resma = () => dep.objetos.find(o => o.codigo_propio === 'RES-A4');
  const tinta = () => dep.objetos.find(o => o.codigo_propio === 'TIN-N');

  // ----- Lugares y niveles -----
  ej();
  t('Se puede crear un edificio', !dep.crearLugar(null, '9').error);
  t('Un edificio sin niveles no admite lugares dentro',
    !!dep.crearLugar(dep.hijos(null).find(x => x.codigo === '9').id, '1').error);
  ej();
  t('Edificio 1 (un solo nivel) no admite profundidad 2', !!dep.crearLugar(kid(bld('1'), '1').id, 'a').error);
  ej();
  t('Edificio 0 (tres niveles) admite profundidad 3', !dep.crearLugar(kid(kid(bld('0'), 'A'), '1').id, 'a').error);
  ej();
  t('Cada edificio tiene sus propios niveles', bld('0').niveles.length === 3 && bld('1').niveles.length === 1);
  ej();
  t('No se repite código entre hermanos', !!dep.crearLugar(bld('0').id, 'A').error);
  ej();
  t('Lote numérico 3 a 5 bajo el edificio 1 crea 3', dep.crearLote(bld('1').id, '3', '5').creados === 3);
  ej();
  t('Lote con rango invertido se rechaza', !!dep.crearLote(bld('0').id, 'C', 'A').error);
  ej();
  t('No se quita el último nivel si tiene lugares', !!dep.quitarNivel(bld('0').id));
  ej();
  t('No se cambia el formato de un nivel en uso', !!dep.editarNivel(bld('0').id, 0, 'formato', 'numero'));
  ej();
  t('Editar el código no permite repetir un hermano', dep.editarLugar(kid(bld('0'), 'B').id, { codigo: 'A' }) !== null);
  ej();
  t('Editar el código lo cambia si no hay repetidos',
    dep.editarLugar(kid(bld('0'), 'B').id, { codigo: 'C' }) === null && !!kid(bld('0'), 'C'));

  // ----- Clonar y borrar -----
  ej();
  t('Clonar un edificio copia sus niveles y su estructura, sin objetos', (() => {
    const r = dep.clonar(bld('1').id, 1);
    if (r.error) return false;
    const nuevo = bld(r.creados[0]);
    return !!nuevo && nuevo.niveles.length === 1 && dep.hijos(nuevo.id).length === 2
      && dep.descendientes(nuevo).every(d => !dep.tieneObjetos(d));
  })());
  ej();
  t('Clonar una estantería la copia dentro del mismo edificio, sin objetos', (() => {
    const r = dep.clonar(kid(bld('0'), 'B').id, 2);
    if (r.error) return false;
    const copias = r.creados.map(c => kid(bld('0'), c));
    return copias.length === 2 && copias.every(c => !dep.tieneObjetos(c) && dep.hijos(c.id).length === 2);
  })());
  ej();
  t('Borrar un edificio sin objetos borra también lo que tiene adentro', (() => {
    const copiaEd = bld(dep.clonar(bld('1').id, 1).creados[0]);
    const antes = dep.lugares.length, dentro = dep.descendientes(copiaEd).length;
    const err = dep.borrarLugar(copiaEd.id);
    return err === null && dep.lugares.length === antes - dentro - 1;
  })());
  ej();
  t('No se borra un lugar que tiene objetos', (() => {
    const e = kid(bld('1'), '1');
    dep.asignar(obj().id, e.id);
    return !!dep.borrarLugar(e.id);
  })());

  // ----- Unidades -----
  ej();
  t('Un lugar admite varios objetos', (() => {
    const x = [obj(), obj(), obj()];
    return x.every(o => dep.asignar(o.id, B1().id) === null) && dep.objetosDe(B1().id).length >= 3;
  })());
  ej();
  t('Un edificio no admite objetos', (dep.asignar(obj().id, bld('0').id) || '').includes('edificios'));
  ej();
  t('Un lugar con subdivisiones no admite objetos', (dep.asignar(obj().id, kid(bld('0'), 'A').id) || '').includes('subdivisiones'));
  ej();
  t('No se subdivide un lugar que tiene objetos', (() => {
    dep.asignar(obj().id, B1().id);
    return !!dep.crearLugar(B1().id, 'a').error;
  })());
  ej();
  t('Una unidad no se asigna dos veces al mismo lugar', (() => {
    const o = obj();
    dep.asignar(o.id, B1().id);
    return !!dep.asignar(o.id, B1().id);
  })());
  ej();
  t('Un objeto puede estar en lugares no contiguos', (() => {
    const o = obj(), b = kid(bld('0'), 'B');
    return dep.asignar(o.id, kid(b, '1').id) === null && dep.asignar(o.id, kid(b, '2').id) === null
      && dep.ubicacionesDe(o.id).length === 2;
  })());
  ej();
  t('Liberar un objeto de un lugar no saca a los demás', (() => {
    const x = obj(), y = obj();
    dep.asignar(x.id, B1().id);
    dep.asignar(y.id, B1().id);
    dep.liberar(x.id, B1().id);
    return dep.objetosDe(B1().id).some(o => o.id === y.id) && !dep.objetosDe(B1().id).some(o => o.id === x.id);
  })());
  ej();
  t('Una unidad no se duplica al transferirla a un lugar que ya la tiene', (() => {
    const x = obj(), y = obj();
    dep.asignar(x.id, B1().id);
    dep.asignar(y.id, B2().id);
    dep.asignar(x.id, B2().id);
    return !!dep.transferir(x.id, B1().id, B2().id, 1);
  })());

  // ----- Productos y existencias -----
  ej();
  t('Un producto suma existencias en un lugar', (() => {
    const antes = dep.cantidadEn(resma().id, B1().id);
    dep.asignar(resma().id, B1().id, 5);
    return dep.cantidadEn(resma().id, B1().id) === antes + 5;
  })());
  ej();
  t('No se retira más de lo que hay en el lugar', (() => {
    const disp = dep.cantidadEn(resma().id, B1().id);
    const err = dep.retirar(resma().id, B1().id, disp + 1);
    return !!err && dep.cantidadEn(resma().id, B1().id) === disp;
  })());
  ej();
  t('Nunca queda stock negativo', (() => {
    dep.retirar(resma().id, B1().id, 999);
    return dep.cantidadEn(resma().id, B1().id) >= 0 && dep.asignaciones.every(a => a.cantidad > 0);
  })());
  ej();
  t('Transferir mueve existencias y el total no cambia', (() => {
    const total = dep.existenciaTotal(resma().id);
    const origen = dep.cantidadEn(resma().id, B1().id);
    const err = dep.transferir(resma().id, B2().id, B1().id, 0);
    const err2 = dep.transferir(resma().id, B1().id, B2().id, 4);
    return err !== null && err2 === null && dep.existenciaTotal(resma().id) === total
      && dep.cantidadEn(resma().id, B1().id) === origen - 4;
  })());
  ej();
  t('Cada cambio de stock deja un movimiento', (() => {
    const antes = dep.movimientos.length;
    dep.asignar(resma().id, B1().id, 2);
    dep.retirar(resma().id, B1().id, 1);
    return dep.movimientos.length === antes + 2;
  })());
  ej();
  t('Un producto bajo su mínimo se avisa, y deja de avisarse al reponer', (() => {
    const p = tinta();
    const lid = dep.ubicacionesDe(p.id)[0].id;
    const alInicio = dep.bajoMinimo(p);
    dep.asignar(p.id, lid, 10);
    return alInicio === true && dep.bajoMinimo(p) === false;
  })());
  ej();
  t('No se borra un producto que tiene existencias', !!dep.borrarObjeto(resma().id));

  // ----- Clientes y permisos -----
  ej();
  t('Los lugares de un cliente no aparecen en otro', (() => {
    dep.elegirEstablecimiento(cliente('Cliente B').id);
    const lugaresB = dep.lugares.length;
    dep.elegirEstablecimiento(cliente('Cliente A').id);
    return lugaresB > 0 && dep.lugares.every(l => l.eid === cliente('Cliente A').id);
  })());
  ej();
  t('Un lector puede mirar pero no cambiar datos', (() => {
    dep.elegirUsuario(usuario('Luis').id);
    const cambio = !!dep.crearObjeto('x', 'y').error;
    const mira = dep.objetos.length > 0;
    dep.elegirUsuario(usuario('Fabio').id);
    return cambio && mira;
  })());
  ej();
  t('Un usuario no entra a un cliente sin membresía', (() => {
    dep.elegirUsuario(usuario('Luis').id);
    const err = dep.elegirEstablecimiento(cliente('Cliente B').id);
    dep.elegirUsuario(usuario('Fabio').id);
    return !!err;
  })());
  ej();
  t('Solo el administrador general crea clientes', (() => {
    dep.elegirUsuario(usuario('Ana').id);
    const err = dep.crearEstablecimiento('Cliente C').error;
    dep.elegirUsuario(usuario('Fabio').id);
    return !!err;
  })());
  ej();
  t('Un editor no gestiona accesos; el admin del cliente sí', (() => {
    dep.elegirUsuario(usuario('Ana').id);
    const errAna = dep.darAcceso(usuario('Luis').id, 'editor');
    dep.elegirUsuario(usuario('Fabio').id);
    const errFabio = dep.darAcceso(usuario('Luis').id, 'editor');
    return !!errAna && errFabio === null;
  })());
  ej();
  t('Un usuario solo ve los clientes donde tiene acceso', (() => {
    dep.elegirUsuario(usuario('Luis').id);
    const visibles = dep.establecimientosVisibles().map(e => e.nombre);
    dep.elegirUsuario(usuario('Fabio').id);
    return visibles.length === 1 && visibles[0] === 'Cliente A';
  })());

  // Restaura datos y sesión
  almacen.restaurar(copia);
  dep.uid = sesion.uid;
  dep.eid = sesion.eid;
  return R;
}
