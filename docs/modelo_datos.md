# Modelo de datos: sistema de depósitos (v2)

Destino: `/mnt/user-data/outputs/modelo_datos_depositos_v2.md`
Reemplaza a `modelo_datos_depositos.md`. El esquema de base está en `esquema_supabase_v2.sql`.

## Jerarquía

- **Establecimiento** (el cliente). No se divide.
- **Edificio**: 1 a N por establecimiento. Código numérico (0, 1, 2…), nombre opcional. Define sus propios niveles.
- **Niveles del edificio**: lista ordenada de tipos de lugar. Cada uno tiene nombre, formato de código (número, letra mayúscula, letra minúscula) y si el nombre es opcional. Un edificio puede tener 1 o más niveles, y cada edificio puede tener los suyos.
- **Lugar**: un elemento dentro de un edificio, en un nivel. Se puede subdividir hasta el último nivel que tenga definido el edificio.

## Entidades

### Lugar
| Campo | Descripción |
|---|---|
| id | Identificador interno |
| padre_id | Lugar que lo contiene. Nulo si es edificio |
| codigo | Según el formato del nivel. Único entre hermanos |
| nombre | Opcional, según el nivel |

### Nivel de edificio
| Campo | Descripción |
|---|---|
| edificio_id | Edificio al que pertenece |
| orden | 1 = justo dentro del edificio, 2 = siguiente, etc. |
| nombre | Ej.: Estantería, Estante, División |
| formato | número, letra mayúscula o letra minúscula |
| nombre_opcional | Si el lugar de este nivel puede tener nombre |

### Objeto
| Campo | Descripción |
|---|---|
| codigo_interno | Generado por el sistema. Siempre presente, único |
| codigo_propio | Código del cliente o del objeto. Opcional |
| descripcion | Texto libre |

### Asignación
Relaciona un objeto con un lugar. Un objeto puede tener varias asignaciones (está en varios lugares). Un lugar puede tener varias asignaciones (tiene varios objetos). Un mismo objeto no se repite en el mismo lugar.

## Reglas

1. **Cantidad:** un lugar puede tener cuantos objetos quiera el operario. No hay tope.
2. **Lugar con subdivisiones:** no tiene objetos directos. Los objetos van solo en sus subdivisiones.
3. **Lugar con objetos:** no admite subdivisiones. Para subdividirlo, primero hay que sacar los objetos.
4. **Edificio:** no tiene objetos directos. Los objetos van dentro de algún lugar.
5. **Objeto en varios lugares:** permitido, por ejemplo, un objeto en dos estantes distintos.
6. **Códigos únicos entre hermanos.** Dos lugares con el mismo padre no pueden tener el mismo código.
7. **Niveles por edificio:** un lugar solo puede crearse si su edificio tiene definido el nivel para esa profundidad.
8. **Cambiar el formato de un nivel en uso:** no se permite. Sí se pueden cambiar nombres.
9. **Quitar un nivel:** solo el último, y solo si no tiene lugares.
10. **Borrar un lugar:** se borra con todo lo que tiene adentro, siempre que nada de eso tenga objetos.
11. **Clonar:** copia niveles y estructura (lugares y subdivisiones). Nunca copia objetos. Los códigos nuevos se asignan solos.
12. **Tamaño:** no existe. Ni los lugares ni los objetos tienen tamaño. El tamaño queda fuera del modelo por ahora.

## Consultas típicas

- **Dirección completa de un lugar:** subir por `padre_id` hasta el edificio.
- **Dónde se puede poner un objeto:** cualquier lugar sin subdivisiones que no sea edificio.
- **Qué hay en un lugar:** sus objetos asignados, y sus subdivisiones.
- **Dónde está un objeto:** todas sus asignaciones.
