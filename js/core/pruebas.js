// Pruebas de las reglas del depósito. Corren sobre el modelo, sin DOM.
// Al terminar devuelven el estado a como estaba.

export function correrPruebas(dep) {
  const almacen = dep.almacen;
  const copia = almacen.snapshot();
  const R = [];
  const t = (nombre, cond) => R.push({ nombre, ok: !!cond });
  const ej = () => dep.cargarEjemplo();
  const bld = c => dep.hijos(null).find(x => x.codigo === c);
  const kid = (p, c) => dep.hijos(p.id).find(x => x.codigo === c);
  const obj = () => dep.crearObjeto('', 'prueba').objeto;

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
  t('Un lugar admite varios objetos', (() => {
    const b1 = kid(kid(bld('0'), 'B'), '1');
    const x = [obj(), obj(), obj()];
    return x.every(o => dep.asignar(o.id, b1.id) === null) && dep.objetosDe(b1.id).length === 3;
  })());
  ej();
  t('Un edificio no admite objetos', (dep.asignar(obj().id, bld('0').id) || '').includes('edificios'));
  ej();
  t('Un lugar con subdivisiones no admite objetos', (dep.asignar(obj().id, kid(bld('0'), 'A').id) || '').includes('subdivisiones'));
  ej();
  t('No se subdivide un lugar que tiene objetos', (() => {
    const b1 = kid(kid(bld('0'), 'B'), '1');
    dep.asignar(obj().id, b1.id);
    return !!dep.crearLugar(b1.id, 'a').error;
  })());
  ej();
  t('El mismo objeto no se asigna dos veces al mismo lugar', (() => {
    const b1 = kid(kid(bld('0'), 'B'), '1');
    const o = obj();
    dep.asignar(o.id, b1.id);
    return !!dep.asignar(o.id, b1.id);
  })());
  ej();
  t('Un objeto puede estar en lugares no contiguos', (() => {
    const o = obj(), b = kid(bld('0'), 'B');
    return dep.asignar(o.id, kid(b, '1').id) === null && dep.asignar(o.id, kid(b, '2').id) === null
      && dep.ubicacionesDe(o.id).length === 2;
  })());
  ej();
  t('Liberar un objeto de un lugar no saca a los demás', (() => {
    const b1 = kid(kid(bld('0'), 'B'), '1');
    const x = obj(), y = obj();
    dep.asignar(x.id, b1.id);
    dep.asignar(y.id, b1.id);
    dep.liberar(x.id, b1.id);
    return dep.objetosDe(b1.id).length === 1 && dep.objetosDe(b1.id)[0].id === y.id;
  })());
  ej();
  t('No se borra un lugar que tiene objetos', (() => {
    const e = kid(bld('1'), '1');
    dep.asignar(obj().id, e.id);
    return !!dep.borrarLugar(e.id);
  })());
  ej();
  t('Borrar un edificio sin objetos borra también lo que tiene adentro', (() => {
    const copiaEd = bld(dep.clonar(bld('1').id, 1).creados[0]);
    const antes = dep.lugares.length, dentro = dep.descendientes(copiaEd).length;
    const err = dep.borrarLugar(copiaEd.id);
    return err === null && dep.lugares.length === antes - dentro - 1;
  })());

  ej();
  t('Lote numérico 3 a 5 bajo el edificio 1 crea 3', dep.crearLote(bld('1').id, '3', '5').creados === 3);
  ej();
  t('Lote con rango invertido se rechaza', !!dep.crearLote(bld('0').id, 'C', 'A').error);
  ej();
  t('No se repite código entre hermanos', !!dep.crearLugar(bld('0').id, 'A').error);

  ej();
  t('No se quita el último nivel si tiene lugares', !!dep.quitarNivel(bld('0').id));
  ej();
  t('No se cambia el formato de un nivel en uso', !!dep.editarNivel(bld('0').id, 0, 'formato', 'numero'));

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
  t('Editar el código no permite repetir un hermano', dep.editarLugar(kid(bld('0'), 'B').id, { codigo: 'A' }) !== null);
  ej();
  t('Editar el código lo cambia si no hay repetidos',
    dep.editarLugar(kid(bld('0'), 'B').id, { codigo: 'C' }) === null && !!kid(bld('0'), 'C'));

  almacen.restaurar(copia);
  return R;
}
