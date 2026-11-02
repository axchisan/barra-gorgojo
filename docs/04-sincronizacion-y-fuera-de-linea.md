# 04 · Sincronización y fuera de línea

Este documento explica cómo varios celulares anotan al mismo tiempo, con o sin señal, y
terminan viendo exactamente lo mismo. Es la parte que más fácil se hace mal y la que
más duele si falla, así que va con detalle.

## La idea en un párrafo

Cada toque que cambia algo produce una **operación**: un hecho pequeño e inmutable, como
«en la cuenta X se anotaron 2 Águila y 1 Light». El celular la guarda en su memoria
local, la aplica a la pantalla al instante y la pone en una **cola de envío**. Cuando
hay señal, la cola se vacía hacia el servidor, que le pone un **número de orden**, la
aplica al estado oficial y la reparte a los demás celulares. Cada celular reconstruye lo
que ve como: *lo confirmado por el servidor, más lo suyo que todavía no ha salido*.

## Operaciones

Cada operación lleva:

| Campo | Para qué |
|---|---|
| `id` | UUID v7 generado **en el celular**. Es lo que hace que reenviar sea inofensivo |
| `tipo` | Qué pasó (lista abajo) |
| `datos` | Lo necesario para aplicarla, validado con Zod |
| `persona_id`, `dispositivo_id` | Quién y desde dónde |
| `creada_en` | Hora del celular cuando se tocó. Para mostrar y para escoger el precio vigente |
| `seq` | Lo asigna el servidor. Orden oficial. Vacío mientras está pendiente |

Los identificadores de las cosas nuevas —cuenta, ronda, línea, pago— **también los
genera el celular**. Así una operación posterior puede referirse a una cuenta creada sin
señal, antes de que el servidor la conozca.

### Tipos

| Operación | Datos principales | Quién |
|---|---|---|
| `cuenta.abrir` | `cuenta_id`, nombre, tipo, número de mesa | todos |
| `cuenta.renombrar` | `cuenta_id`, nombre, tipo, mesa | todos |
| `ronda.anotar` | `cuenta_id`, `ronda_id`, líneas: `linea_id`, `producto_id`, cantidad, precio visto (o valor escrito, en productos de valor libre) | todos |
| `linea.anular` | `linea_id`, motivo | todos si la cuenta está abierta; administrador si no |
| `cuenta.cobrar` | `cuenta_id`, `pago_id`, medio, monto, recibido | todos |
| `cuenta.pasar_a_comida` | `cuenta_id`, monto | todos |
| `comida.marcar_cobrada` | `cuenta_id` | todos |
| `cuenta.deshacer_cierre` | `cuenta_id`, `pago_id` — dentro de los segundos de «Deshacer» | todos |
| `cuenta.reabrir` | `cuenta_id`, motivo | administrador |
| `cuenta.unir` | `origen_id`, `destino_id` | todos |
| `cuenta.anular` | `cuenta_id`, motivo | todos si está vacía; administrador si no |
| `producto.agotar` / `producto.reponer` | `producto_id` | todos |
| `jornada.cerrar` | efectivo contado, notas | todos |

Las operaciones de catálogo, personas y dispositivos **no** van por esta vía: exigen
señal, son de administrador y son raras. Ver «Lo que exige señal».

## El celular

### Almacenamiento

IndexedDB, con cuatro grupos de datos:

- **Confirmado**: el estado oficial que dio el servidor, más el último `seq` conocido.
- **Pendientes**: la cola de operaciones aún no aceptadas, en el orden en que se
  tocaron.
- **Catálogo y personas**: productos, precios con su historial reciente, personas
  activas con el hash de su PIN.
- **Sesión**: quién está usando el celular.

Lo que se ve en pantalla es `pendientes.reduce(aplicar, confirmado)`. Con decenas de
pendientes es instantáneo.

Al abrir por primera vez se pide `navigator.storage.persist()`, para que el navegador no
borre los datos por falta de espacio.

### Escribir

1. El toque produce la operación.
2. Se guarda en «pendientes» **en una transacción de IndexedDB** antes de cualquier otra
   cosa.
3. La pantalla se actualiza (Dexie avisa solo).
4. Si hay conexión, se envía.

Si la app se cierra entre 2 y 4, la operación ya está guardada y sale en la próxima
apertura.

### Varias pestañas

Si alguien abre la app dos veces en el mismo celular, solo una pestaña mantiene la
conexión (Web Locks API); las demás leen de IndexedDB, que es compartida.

## El protocolo

### Al conectar

```
celular → servidor   hola { ultimo_seq: 1840, dispositivo, persona }
servidor → celular   novedades { ops: [1841…1857] }          // si faltan pocas
                  o  foto { estado, seq: 1857 }               // si falta mucho o es la primera vez
celular → servidor   enviar { ops: [pendiente1, pendiente2, …] }
servidor → celular   recibido { id, seq } | rechazado { id, motivo }   // una por operación
servidor → todos     op { …, seq: 1858 }                       // a cada celular conectado
```

- La **foto** contiene solo lo vivo: cuentas abiertas, cuentas cerradas de la jornada
  actual, pasadas a comida sin cobrar, catálogo. No la historia completa.
- Los pendientes se envían en lotes de hasta 50, en orden.
- El servidor procesa cada operación así: si su `id` ya existe, responde con el `seq`
  que tenía (**idempotencia**); si no, valida permisos y datos, la aplica, la guarda,
  le asigna `seq` y la reparte.
- El celular, al recibir `recibido`, saca la operación de pendientes; al recibir la
  misma operación por difusión, la aplica a lo confirmado. Como el estado visible se
  recalcula, no hay doble conteo.

### Conexión

- Latido cada 25 segundos; si no hay respuesta en 10, se da por caída.
- Reconexión con espera creciente: 1, 2, 4, 8… hasta 30 segundos, con algo de azar. Se
  reintenta **de inmediato** con el evento `online` del navegador y al volver la app a
  primer plano.
- Si el WebSocket falla tres veces seguidas, se pasa al **respaldo HTTP** (ADR-04):
  `POST /api/operaciones` para enviar y `GET /api/operaciones?desde=1840` cada 3
  segundos en primer plano. Cada minuto se reintenta el WebSocket.

### Indicador

| Estado | Se muestra |
|---|---|
| Conectado, sin pendientes | ● verde «Todo al día» |
| Conectado, enviando | ● verde «Enviando 3…» |
| Sin conexión | ● ámbar «Sin señal · 3 por enviar» |
| Sin conexión hace más de 15 min, con pendientes | Franja ámbar visible: «Hay 12 anotaciones sin enviar desde hace 20 min. Siga trabajando; se envían solas» |
| Operación rechazada | Aviso rojo con la explicación y qué hacer |

## Conflictos

Con un solo servidor que ordena, la mayoría de «conflictos» desaparecen: anotar rondas
es sumar, y sumar en cualquier orden da lo mismo. Quedan los casos donde dos celulares
deciden cosas incompatibles sin haberse visto. Cada uno tiene una regla escrita:

| Caso | Regla |
|---|---|
| **Se anota una ronda en una cuenta que otro celular ya cobró** (el que anotó no tenía señal) | La ronda **se acepta**: las cervezas salieron. La cuenta se **reabre sola** con saldo pendiente y todos los celulares muestran un aviso: «Grupo de Juan: se anotaron 2 Rubia después del cobro. Saldo $ 8.000». Esto es RF-26 y es el caso más importante |
| Se anota en una cuenta **pasada a comida** | Igual: se acepta, y la cuenta de cocina muestra el valor nuevo con aviso. Si la cocina ya la había marcado cobrada, vuelve a quedar pendiente |
| Se anota en una cuenta que otro **unió** a otra | La ronda se redirige a la cuenta de destino. El origen guarda a dónde se unió |
| Se anota en una cuenta **anulada** | Se acepta y la cuenta se reactiva con aviso: si alguien anotó, había clientes |
| Dos celulares **anulan la misma línea** | La segunda no hace nada. No es error |
| Dos celulares **cobran la misma cuenta** | El primero que llega al servidor cobra. El segundo se **rechaza** con «Esta cuenta ya la cobró Ana a las 4:12 p. m. por Nequi». Si hubo plata recibida dos veces, se ve y se devuelve; el sistema no lo esconde |
| Dos celulares **renombran** la misma cuenta | Gana el último en llegar. Es inofensivo |
| Se anota un producto **agotado** en otro celular | Se acepta. «Agotado» es un aviso para no ofrecerlo, no una prohibición: si se vendió, es porque había |
| Una persona desactivada anotó sin señal | Se acepta y queda marcada para revisión del administrador |
| Operación inválida (datos corruptos, versión vieja de la app) | Se rechaza, queda en un registro de rechazos visible al administrador, y el celular la saca de pendientes mostrando el aviso. **Nunca se descarta en silencio** |

### Precios

Los precios casi nunca cambian, pero cuando cambian no puede pasar que el cliente oiga un
total y después aparezca otro.

- Los precios tienen **historial** (`vigente_desde`).
- Cada línea viaja con el precio que el celular mostró.
- El servidor busca el precio vigente a la hora `creada_en` de la operación. Si coincide
  con el que el celular mostró, lo usa. Si no (el celular tenía un catálogo viejo),
  **también usa el del celular** siempre que haya estado vigente en las últimas 24
  horas, y marca la línea para revisión. Si no, usa el vigente y avisa.
- La hora del celular se acota: no puede ser posterior a la llegada al servidor ni
  anterior en más de 24 horas. Un celular con la hora mal no puede escoger precios a
  conveniencia.

En los productos de **valor libre** (el mecato) no hay precio que verificar: vale el
valor escrito, con un tope de $ 50.000 por línea para atajar un cero de más.

Recomendación operativa: **cambiar precios fuera del horario de atención**.

## Lo que exige señal

Por diseño, hay cosas que solo se hacen con conexión, porque necesitan una única verdad
en el momento de hacerse y no son urgentes:

- Vincular o revocar un celular.
- Crear personas, cambiar PIN o roles.
- Cambiar precios y el catálogo.
- Ver jornadas anteriores y exportar.

Cerrar sesión con pendientes está bloqueado hasta enviarlos (RNF-16).

## Cómo se prueba

La sincronización no se prueba a mano. Pruebas obligatorias antes de usarlo en el local:

1. **Reglas puras** (Vitest): cada fila de la tabla de conflictos es una prueba.
2. **Propiedad de convergencia**: se generan al azar secuencias de operaciones de tres
   celulares, se entregan en órdenes distintos con duplicados y retrasos, y se verifica
   que todos terminan con el mismo estado y los mismos totales que el servidor.
3. **Durable Object real** (`vitest-pool-workers`): idempotencia, rechazos, foto,
   novedades.
4. **Extremo a extremo** (Playwright): tres navegadores, uno se desconecta, anota, el
   otro cobra, el primero vuelve; se verifica el aviso de saldo pendiente.
5. **Prueba de campo**: un sábado con el cuaderno en paralelo. Ver [07](07-roadmap.md).

## Precio fijado por el servidor (2026-11-01)

El estado se reconstruye aplicando el registro de operaciones cada vez que el Durable
Object arranca. Hasta el 2026-11-01 el precio de cada línea salía del catálogo vigente al
aplicar, lo que era seguro mientras los precios del catálogo base no cambiaran. Al
agregar el precio de cancha, un despliegue recalculó con el precio nuevo líneas anotadas
antes (la «Cancha 2» subió $ 3.000) y hubo que corregirlo.

Desde entonces:

- Al recibir un `ronda.anotar`, el servidor aplica la operación y **escribe en cada línea
  el `precioFijado`** con que se cobró, antes de guardarla. Lo que mande el celular en ese
  campo se descarta.
- Al reconstruir, `precioFijado` manda sobre el catálogo. Cambiar el catálogo en el código
  ya no puede alterar lo anotado.
- Para las operaciones viejas, sin precio fijado, el precio de cancha solo aplica a las
  anotadas desde `PRECIO_CANCHA_DESDE`.

**Regla:** nunca cambiar en el código un precio del catálogo base que ya se haya usado sin
revisar este punto. Los cambios de precio se hacen desde la app, que los registra como
operaciones.
