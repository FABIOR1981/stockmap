// Datos de prueba ficticios. No son datos de ningún cliente.
import {
  crearDeposito, crearLugar, crearObjeto, ubicar,
} from '../dominio/depositos.js';

export async function crearDemo() {
  let n = 0;
  const ctx = { usuario: 'sistema', fecha: '2026-10-31T00:00:00Z', nuevoId: () => `d${++n}` };
  let e = crearDeposito({
    nombre: 'Depósito de prueba',
    niveles: [
      { id: 'estanteria', nombre: 'Estantería' },
      { id: 'estante', nombre: 'Estante' },
      { id: 'hueco', nombre: 'Hueco' },
    ],
  });

  const lugares = {};
  const estructura = [
    { nombre: 'Estantería A', estantes: [2, 3] },
    { nombre: 'Estantería B', estantes: [2] },
  ];
  for (const est of estructura) {
    const r = crearLugar(e, { nivelId: 'estanteria', nombre: est.nombre }, ctx);
    e = r.estado;
    est.estantes.forEach((huecos, i) => {
      const s = crearLugar(e, { nivelId: 'estante', nombre: `Estante ${i + 1}`, padreId: r.id }, ctx);
      e = s.estado;
      for (let h = 1; h <= huecos; h++) {
        const hu = crearLugar(e, { nivelId: 'hueco', nombre: `Hueco ${h}`, padreId: s.id }, ctx);
        e = hu.estado;
        lugares[`${est.nombre} / Estante ${i + 1} / Hueco ${h}`] = hu.id;
      }
    });
  }

  const objetos = [
    { descripcion: 'Caja de tornillos M6', codigoInterno: 'INT-0001', codigosOrigen: ['7790000000011'], ubicar: 'Estantería A / Estante 1 / Hueco 1' },
    { descripcion: 'Caja de guantes talle M', codigoInterno: 'INT-0002', ubicar: 'Estantería A / Estante 1 / Hueco 2' },
    { descripcion: 'Rollo de cinta de embalar', codigoInterno: 'INT-0003', ubicar: 'Estantería A / Estante 2 / Hueco 1' },
    { descripcion: 'Bidón de aceite 5 L', codigoInterno: 'INT-0004', codigosOrigen: ['7790000000028'], peso: 4.8, ubicar: 'Estantería B / Estante 1 / Hueco 1' },
    { descripcion: 'Pallet de bolsas 40x60', codigoInterno: 'INT-0005', alto: 120, ancho: 80, largo: 100 },
  ];
  for (const o of objetos) {
    const r = crearObjeto(e, o, ctx);
    e = r.estado;
    if (o.ubicar) e = ubicar(e, r.id, lugares[o.ubicar], ctx);
  }
  return { estado: e, version: 1 };
}
