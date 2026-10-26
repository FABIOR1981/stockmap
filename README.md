# stockmap

Organización de depósitos: edificios, lugares dentro de ellos (estanterías, estantes, divisiones…) y objetos asignados a lugares. Base para un futuro control de stock (cantidades y movimientos).

## Estructura

```
index.html            Punto de entrada (carga css/app.css y js/app.js como módulo)
css/app.css           Estilos
js/app.js             Arranque: crea el depósito, dibuja la interfaz, conecta eventos
js/core/              Lógica sin DOM (se puede probar con Node)
  formatos.js         Formatos de código (número, letra, letra minúscula)
  deposito.js         Modelo: consultas y reglas
  pruebas.js          Pruebas de reglas (también se ejecutan desde la app)
js/almacen/           Capa de almacenamiento
  memoria.js          Implementación en memoria (la que se usa hoy)
  supabase.js         Pendiente: misma interfaz sobre Supabase
js/ui/                Interfaz
  estado.js           Estado de la interfaz y utilidades de presentación
  iconos.js           Iconos SVG en línea
  componentes.js      Tarjetas, bloques del plano, migas
  vistas.js           Vistas y ventanas (modales)
  plano.js            Plano: posiciones y arrastre
  acciones.js         Acciones de los botones (data-act)
tests/reglas.test.js  Pruebas de reglas con el test runner de Node
supabase/esquema.sql  Esquema de base de datos, tablas, triggers y RLS
docs/modelo_datos.md  Modelo de datos y reglas de negocio
```

## Cómo se usa

Requiere Node 18 o superior. Los módulos ES no cargan abriendo el archivo directamente con `file://`, así que hay que servir la carpeta.

```bash
npm start        # sirve en http://localhost:8080
npm test         # corre las pruebas de reglas
```

## Conceptos

- **Cliente**: cada uno tiene sus propios edificios, lugares, objetos y movimientos. Nunca se ven entre sí.
- **Usuario**: el administrador general ve y hace todo. Los demás tienen un rol en cada cliente:
  - **Admin del cliente**: gestiona accesos y datos.
  - **Editor**: carga, saca y mueve stock.
  - **Lector**: solo mira.
- **Objeto de tipo unidad**: se identifica uno por uno (cada caja tiene su código). Cantidad 0 o 1.
- **Objeto de tipo producto**: hay N unidades repartidas en lugares (por ejemplo, 12 resmas en un estante). Puede tener un mínimo y avisa cuando baja de ahí.
- **Movimiento**: cada entrada, salida o transferencia queda registrada con fecha, usuario y cantidad.

## Reglas principales

- Cada edificio define sus propios niveles (tipo de lugar, formato del código y si el nombre es opcional).
- Los códigos son únicos entre hermanos.
- Un lugar con stock no se puede subdividir. Un lugar con subdivisiones no admite stock.
- Los edificios no tienen stock directo.
- Un objeto puede estar en varios lugares. Una unidad no se repite en el mismo lugar.
- Nunca hay existencias negativas: no se saca más de lo que hay.
- Transferir mueve stock sin cambiar el total.
- No se borra un objeto con existencias, ni un lugar con objetos adentro.
- Clonar copia niveles y estructura, nunca stock; los códigos nuevos se asignan solos.

## Almacenamiento

Hoy todo vive en memoria: se pierde al recargar. El contrato del almacén está documentado en `js/almacen/memoria.js`. Para pasar a Supabase hay que:

1. Implementar `js/almacen/supabase.js` con la misma interfaz, pero asíncrona.
2. Hacer `async/await` en `js/core/deposito.js` y en las acciones de la interfaz.
3. Aplicar `supabase/esquema.sql` en el proyecto de Supabase.

Los niveles hoy viven dentro de cada edificio; en el esquema tienen su propia tabla `niveles_edificio`.

## Pendiente

- Inicio de sesión real (hoy el usuario se elige en la barra lateral, como demostración).
- Actualizar `supabase/esquema.sql` con clientes, usuarios, membresías, stock y movimientos. Hoy todavía es el esquema anterior.
- Almacenamiento con Supabase.
- Probar el arrastre del plano en pantallas táctiles.
