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
| `datos` | Lo necesario para aplicarla, validado en el dominio (`esOperacion` y `aplicar`) |
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

**Cómo quedó (E2, 2026-11-03).** `src/app/memoria.ts`: una base IndexedDB
`barra-gorgojo` con Dexie y dos tablas, `pendientes` (en orden, única por `id`) y
`ajustes` (sesión, confirmado, base, apartados y personas). Catálogo y personas van
dentro de lo confirmado (la foto del servidor). Cada cambio es una transacción; un cambio
de base vacía la cola y la aparta en la misma transacción. La versión 0.1 guardaba todo en
`localStorage`: al abrir, lo que haya ahí se trae uniendo por `id` (lo de otra base va a
apartados) y se borra, salvo `bg.base`, que se deja y se mantiene al día para saber de qué
base es lo que escriba una pestaña vieja que siga abierta. Si IndexedDB no abre, se
sigue con `localStorage`. Pruebas: `tests/e2e/memoria.spec.ts`.

### Escribir

1. El toque produce la operación.
2. Se escribe **al instante y de forma síncrona** en un respaldo en `localStorage`
   (`barra.respaldo-pendientes`, desde el 2026-11-15).
3. Se guarda en «pendientes» **en una transacción de IndexedDB**, y a la vez la pantalla
   se actualiza (no se espera a IndexedDB: tarda milisegundos, pero la interfaz no
   espera nada). Cuando IndexedDB la tiene, sale del respaldo.
4. Cuando quedó guardada, si hay conexión, se envía.

Si la app muere entre 2 y 3 (el sistema la cierra, IndexedDB falla o está bloqueada), al
abrir se recupera del respaldo lo que no esté en «pendientes» (deuda 1 de docs/16, regla
3). Reenviar algo ya confirmado no duplica nada: el servidor es idempotente por `id`. Lo
confirmado o rechazado también sale del respaldo, y al cambiar de base se vacía (lo
pendiente se aparta, no se revive en la otra base). Prueba: `tests/e2e/recarga.spec.ts`.

**Versión nueva.** El Service Worker nuevo se activa solo, pero la pestaña sigue con el
código viejo hasta recargar. La app revisa cada 30 minutos y al volver a ella; si hay
versión nueva muestra «🔄 Versión nueva lista · Actualizar» y se actualiza con un toque,
nunca a la fuerza (`src/app/version.ts`). Sin prueba automática: el Service Worker no se
registra en `localhost`, donde corren las e2e; se revisa en los aparatos.

### Varias pestañas

Si alguien abre la app dos veces en el mismo celular, solo una pestaña mantiene la
conexión (Web Locks API); las demás leen de IndexedDB, que es compartida.

Cómo quedó: la pestaña con el candado `barra-gorgojo-conexion` tiene el WebSocket (y el
respaldo por HTTP). Las pestañas se avisan por un `BroadcastChannel`: «cambié la memoria»
(las demás la releen sin deshacer lo que ellas aún no guardaron), el estado de la
conexión y los rechazos del servidor. Lo que anota una pestaña sin candado lo envía la que
lo tiene. Al cerrarse la pestaña con el candado, otra lo toma y se conecta. Lo confirmado
lo escribe solo la pestaña con el candado. La app instalada y Chrome comparten la memoria
y el candado.

**Pestaña congelada (2026-11-15).** Visto en la tablet del local: la pestaña de Chrome
escondida tenía el candado, Chrome la congeló, y la app instalada (la que se veía) no
recibía nada mientras mostraba «Todo al día». Desde entonces la pestaña con el candado
manda un **latido** cada 5 s; si una pestaña que se ve pasa 15 s sin latido, se pone en
«conectando» y **le quita el candado** (`steal` de Web Locks). La que lo perdió deja la
conexión y vuelve a esperar su turno. Además, al congelarse (evento `freeze`) la pestaña
suelta el candado y lo pide al despertar (`resume`). Prueba: `tests/e2e/congelada.spec.ts`
(una pestaña colgada con el candado; sin el arreglo, la otra nunca recibe lo nuevo).

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

**Cómo quedó (2026-11-03, [13](13-revision-tecnica.md) punto 4).** El celular saluda con
`hola { seq, base }` (lo último que tiene). Si es de la misma base y le faltan 500
operaciones o menos, el servidor responde `novedades { seq, cambios }`; si no (primera vez,
otra base, muy atrás), la `foto`. Cada operación reenviada a todos va como
`op { op, cambios }`. `cambios` dice **cómo quedó lo que tocó**: las cuentas completas, y
el catálogo, el orden o los cierres si cambiaron. El celular lo toma tal cual en vez de
aplicar la operación: así le llega bien aunque sea sobre una cuenta vieja que ya no
estaba en su foto, y el total es el del servidor (regla 5). El respaldo HTTP (`/api/ops`)
manda también su `seq` y recibe novedades, no la foto cada 5 s.
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
| Se anota en una cuenta que otro **unió** a otra | La ronda se redirige a la cuenta de destino. El origen guarda a dónde se unió. *(Unir cuentas, RF-06, no está hecho: esta fila aplica cuando exista)* |
| Se anota en una cuenta **anulada** | Se acepta y la cuenta se reactiva con aviso: si alguien anotó, había clientes |
| Dos celulares **anulan la misma línea** | La segunda no hace nada. No es error |
| Dos celulares **cobran la misma cuenta** | El primero que llega al servidor cobra. El segundo se **rechaza** con «Esta cuenta ya la cobró Ana a las 4:12 p. m. por Nequi». Si hubo plata recibida dos veces, se ve y se devuelve; el sistema no lo esconde |
| Dos celulares **renombran** la misma cuenta | Gana el último en llegar. Es inofensivo |
| Se anota un producto **agotado** en otro celular | Se acepta. «Agotado» es un aviso para no ofrecerlo, no una prohibición: si se vendió, es porque había |
| Una persona desactivada anotó sin señal | Se acepta y queda marcada para revisión del administrador |
| **Otra persona entra al celular** antes de que salga lo anotado sin señal | Queda a nombre de quien lo anotó, con prueba: cada operación lleva la sesión firmada de quien la anotó y el servidor la verifica (que sea válida y de ese mismo celular); se guarda también quién la envió y la auditoría lo resalta. Sin firma válida, queda a nombre de quien envía. Los permisos se revisan con quien envía (ADR-14) |
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

Pruebas de esta tabla (E6, 2026-11-03): `tests/conflictos.test.ts` (reglas, fila por
fila, y la propiedad de convergencia con 200 secuencias al azar),
`tests/servidor/barra.test.ts` «doble cobro y autoría» y `tests/e2e/conflictos.spec.ts`
(tres celulares). El doble cobro se rechaza en el servidor con el mensaje de la tabla
(`yaCobrada` en `worker.ts`).

## Abonos (2026-11-08)

Un grupo paga por partes: alguien paga su pedida o unas cervezas, alguien deja un valor,
o reparten entre varios con medios distintos.

- `cobrar` puede traer `lineas` (qué productos y cuántas unidades paga) o `monto` (un
  valor). Sin ellos, como siempre: todo lo que falta. Así el registro viejo da el mismo
  estado (reglas 0 y 4) y no hace falta subir `VERSION_PROYECCION`.
- Por productos, el abono vale lo que valen las unidades **aún no pagadas** de esas líneas
  (`porPagarPorLinea`): nada se paga dos veces. Por valor, el entero que diga.
- **Nunca más que el saldo**: un abono mayor cobra solo lo que falta. Si el abono no cubre
  todo, el pago queda `parcial` y la cuenta sigue abierta; el último cobro la cierra.
- Pasar a comida es siempre por todo lo que falta (regla 9).
- `deshacer_pago { cuenta, pago }` deshace **un** pago; `reabrir` sigue deshaciendo todos.
  Permisos en el servidor: quien lo cobró, en los 5 minutos siguientes, o el
  administrador; reabrir una cuenta con abonos de otros o viejos es del administrador.
- «El día», el cierre y el CSV ya suman pagos por día y medio: cada abono cuenta el día en
  que entró.
- Quién pagó (opcional): `cobrar` puede traer `pagador` (texto libre, hasta 40). Queda en
  el pago, se ve en el detalle, en «Mostrar al cliente» y en la auditoría. El doble cobro (tabla de conflictos) sigue igual: sin saldo, se rechaza.

Pruebas: `tests/abonos.test.ts`, `tests/servidor/barra.test.ts` «abonos en el servidor» y
`tests/e2e/abonos.spec.ts`.

En el detalle, cada abono muestra de qué chico o pedida es cada producto que pagó y
tiene «✎ ¿Quién?» para poner o corregir quién pagó (operación `pagador`: no cambia el
valor; lo último que llega es lo que queda).

### Dividir entre varios (2026-11-08)

En «Cobrar → Valor», «👥 Dividir entre varios»: entre cuántas personas y cuántas ya
pagaron (empieza con los abonos que hay). A cada una le toca lo que falta entre las que
faltan, redondeado a los cien (el último paga solo lo que queda: nunca más que el saldo).
Cada abono guarda `entre` en el pago, así el siguiente, aquí o en otro celular, ve
«Faltan 4» sin volver a contar.

## Comida, despacho y cajas (2026-11-08)

Ver `docs/14`. Una cuenta tiene líneas de barra y de comida y **un solo saldo**: la barra
y la cocina cobran la misma cuenta, y el segundo cobro sin saldo se rechaza como siempre.
Cada pago guarda su `area` (la caja); lo registrado antes cuenta como de la barra.

- Una bebida anotada desde comida queda `porDespachar` **en el estado**, no en un mensaje:
  el aviso de la barra sale de ahí, así que aparece al abrir la app aunque la tablet
  estuviera apagada, y se queda hasta que alguien de la barra la despache. `despachar`
  repetido no cambia nada.
- El servidor revisa el área en cada operación: anotar platos exige comida; despachar,
  barra; anotar, cobrar o cerrar en un área que la persona no tiene hoy se rechaza (regla
  8). Las áreas de hoy son las fijas más las dadas para ese día; el administrador, todas.
- Quien solo tiene comida **ve y cobra** toda la cuenta, pero solo cambia o anula los
  platos y las bebidas que pidió comida mientras no se despachen (`puedeEditarLinea`);
  lo de la barra lo ve sin tocarlo. La barra cambia todo.

## Editar una pedida (2026-11-15)

En el detalle (vista Pedidas o Chicos), cada pedida tiene «＋ Agregar» y cada producto,
además de cambiar la cantidad o anularlo, «⇄ Cambiar por otro producto». Son
operaciones nuevas, nada se borra (regla 4):

- `agregar`: los productos entran en **esa** pedida (no en una nueva), marcados como
  agregados con quién y cuándo. Precio fijado por el servidor, área, despacho y permisos
  como en `anotar`. A una cuenta cobrada la reabre, como anotar.
- `cambiar_producto`: el producto anterior queda anulado como «cambiado por …» y el nuevo
  entra justo después, en la misma pedida y con la misma cantidad (y conserva el «por
  despachar» si lo tenía).
- La auditoría las muestra como **edición de la pedida**, resaltadas: «Editó la pedida 2:
  cambió 2 Águila por Poker (+$ 0)», «Editó la pedida 1: agregó 1 Gaseosa».

| Conflicto | Regla |
|---|---|
| Agregar a una pedida que ya no existe | Se rechaza: «Esa pedida ya no existe» |
| Cambiar un producto ya anulado (otro celular) | Se rechaza: «Ese producto ya no está en la pedida» |
| Cambiar un producto ya pagado con un abono por productos | Se rechaza: hay que deshacer el abono primero |
| Cambiar a mecato u «Otro» (valor libre) | Se rechaza: se anula y se anota de nuevo |
| Desde comida, cambiar algo de la barra | Se rechaza, como anular (solo lo suyo) |

## Precio de los adicionales (2026-11-15)

**El caso.** En una cancha, un «Adicional» (cervezas sueltas después del chivo) se había
anotado como «Otro · Cerveza $ 12.000»: 4 Águila a precio **normal**. Al corregirlo con
«Cambiar por otro producto» y la cantidad, la app las cobró a precio de **cancha**
(4 × $ 3.200 = $ 12.800): el precio de cancha se aplicaba a todo lo de la cuenta. El
negocio aclaró la regla: **lo adicional va a precio normal por defecto**, y se puede
escoger precio de cancha al anotar o después.

**La regla.** Cada pedida de cancha tiene su precio (`Ronda.precio`: `cancha` o
`normal`), y todo lo que entra en ella (`anotar`, `agregar`, `cambiar_producto`) se cobra
con ese precio:

- Al **anotar**, el chico va a precio de cancha y el adicional a precio normal. Con
  «Adicional» escogido, arriba del botón sale «Precio normal · cambiar» para cobrarlo a
  precio de cancha (no agrega toques al caso común). El celular manda `precio`; si no lo
  manda (versión anterior), el servidor pone el de siempre para su tipo.
- **Después**, en el detalle, cada adicional con algún producto que tenga precio de
  cancha muestra «🎯 Precio cancha» / «Precio normal» (en los chicos, solo si se les
  cambió el precio de siempre): tocarlo es la operación
  `precio_ronda`, que le cambia el precio a sus productos (con «Deshacer»).
- **«Pasar a adicional» / «Pasar a chico»** (`marcar_ronda`) ahora también lleva el precio
  que le toca (adicional: normal; chico: cancha) y lo aplica.
- No cambian: lo anulado, lo de valor libre («Otro», mecato), lo ya pagado con un abono
  por productos, ni nada de una cuenta **ya cobrada** (se reabre primero; el servidor lo
  rechaza con el porqué).
- Los precios nuevos los calcula **el servidor** con su catálogo y los guarda en la
  operación (`precios: { línea: valor }`), como `precioFijado`: recalcular el registro
  nunca depende del catálogo (regla 0). Lo que mande el celular en `precios` se descarta.

**Compatibilidad (regla 0).** Las pedidas anotadas antes no tienen `precio`: siguen a
precio de cancha, y como todas sus líneas tienen `precioFijado`, el registro viejo da el
mismo estado. Un `marcar_ronda` viejo (sin `precio`) solo cambia el nombre, como antes.
Sin subir `VERSION_PROYECCION`. Para corregir el caso de la cancha basta tocar «Precio
cancha» en esa pedida (pasa a «Precio normal»: 4 × $ 3.000 = $ 12.000).

| Conflicto | Regla |
|---|---|
| Cambiar el precio de una pedida de una cuenta ya cobrada | Se rechaza: «… ya se cobró: reábrala para cambiarle el precio» |
| Cambiar el precio desde comida | Se rechaza: lo hace la barra |
| Un producto de la pedida se pagó con un abono por productos | Ese producto conserva su precio; los demás cambian |
| Agregar o cambiar producto en una pedida a precio normal | Lo nuevo entra a precio normal |
| Anotar un adicional desde una versión anterior de la app | Precio normal (lo pone el servidor) |

Pruebas: `tests/precio-ronda.test.ts` y `tests/servidor/empleados.test.ts`.

## Rechazar un pedido a la barra (2026-11-15)

Pedido por el negocio: si comida pide a la barra algo que se acabó (una gaseosa), la barra
tiene que poder **devolver el pedido diciendo por qué**. En «Despachar», cada pedido tiene
«🚫 No se puede»: se escogen los productos que no hay (de entrada, todos; los demás siguen
por despachar) y el motivo («Se acabó», «No hay fría», «No hay en ese tamaño» u otro
escrito). Es la operación `rechazar_despacho` (`cuenta, lineas?, motivo`): esas líneas
quedan **anuladas como rechazadas** (`Linea.rechazada`: quién, cuándo, motivo) y salen de
la cuenta; nada se borra (regla 4) y la auditoría lo muestra resaltado.

A quien tiene comida le sale un **aviso rojo** «🚫 La barra no pudo despachar: 2 Colombiana
· Mesa 4 — «Se acabó»» que se queda hasta «Entendido». Sale del estado (rechazos de las
últimas 3 horas que ese aparato no ha visto), así que no se pierde con la app cerrada; no
le sale a quien rechazó. En el detalle, el producto anulado dice «🚫 Se acabó».

| Conflicto | Regla |
|---|---|
| Rechazar desde comida | Se rechaza: lo hace la barra (comida cancela lo suyo con «Cancelar pedido») |
| Sin motivo | Se rechaza: «Escriba por qué no se puede despachar» |
| Otro aparato ya lo despachó o lo canceló | Se rechaza: «Ese pedido ya no está por despachar» |
| Una parte sí hay | Solo lo escogido se rechaza; lo demás sigue por despachar |

**Rechazar no es cancelar** (2026-11-15): quien pidió cancela lo suyo con «Cancelar pedido»
(operaciones `anular`) aunque también tenga la barra; «No se puede» es para los pedidos de
otros. Si al cancelar la cuenta queda sin productos vivos ni pagos, el celular emite también
`anular_cuenta` con motivo «Pedido cancelado» (una cuenta vacía la anula cualquiera), para
que no quede abierta en $ 0.

Pruebas: `tests/rechazo.test.ts`, `tests/servidor/empleados.test.ts`, `tests/e2e/rechazo.spec.ts`,
`tests/e2e/pedidos-barra.spec.ts`.
Para los pedidos de los clientes por QR, la misma idea: [18](18-roadmap-2026-11.md) fase 5.

## Cambio de plata (2026-11-15)

Un cliente pide que le cambien plata: la pasa por Nequi (o Breve) y se le da un billete de
la caja. En el negocio se anota como un «Otro» en su cuenta y se cobra junto con lo que
consumió. Sin más, ese valor contaba como venta y el efectivo esperado de la caja quedaba
alto, porque el billete salió sin que la app lo supiera.

- `cambio_linea { cuenta, linea, valor, caja? }` marca (o desmarca) un «Otro» como cambio
  de plata; la línea guarda `cambio: { caja, por, en }`. Solo para productos con nombre
  libre («Otro»), con los mismos permisos que `comida_linea`. Se puede marcar con la
  cuenta ya cobrada (desde «Editar», como barra o comida).
- La cuenta no cambia: su total y su saldo siguen igual (el cliente sí debía esa plata).
- No suma a lo vendido ni a «Por producto»; en «El día» sale aparte («💱 Cambio»).
- Cada pago se reparte en barra, comida **y cambio** (`repartirPagos`): lo que entró por
  Nequi sigue completo en la caja, pero la parte del cambio no es venta.
- `efectivoDeJornada` resta el valor del cambio en la caja marcada, en la jornada de la
  pedida en que se anotó (cuando salió el billete). Sin cambios marcados en el registro,
  el resultado es el mismo de antes: no cambia la proyección (regla 0).

## Lo que ve cada persona (2026-11-15)

Desde los accesos de empleados ([17](17-accesos-de-empleados.md), ADR-17) el servidor ya
no manda lo mismo a todos: la foto, las novedades y cada operación repartida van
recortadas según los permisos de la persona (`src/dominio/vista.ts`). Quien ve menos
recibe siempre la foto al conectarse, y de las operaciones ajenas solo `id`, `seq` y tipo
(el celular toma los cambios que manda el servidor). Al entrar otra persona en el mismo
celular, lo confirmado se descarta y llega la foto de la nueva; los pendientes se
conservan. Fuera de su horario, el servidor solo acepta lo anotado dentro de él o hasta
15 minutos después (regla 3); lo demás se rechaza con su porqué (regla 8).

## Juntar cuentas (2026-11-08)

Para cobrar dos cuentas como una («Juntar con otra cuenta» en el menú ⋮ del detalle).
`juntar { cuenta, desde }` pasa a `cuenta` las pedidas (numeradas a continuación, con «de
…»), los productos y **los abonos** de `desde`, que queda sin nada y cerrada como
«juntada». Como el dinero y los productos se mueven juntos, el saldo de las dos es el
mismo antes y después: nada se cobra dos veces ni se pierde. Pruebas en
`tests/juntar.test.ts` y en el servidor.

| Conflicto | Regla |
|---|---|
| Otro celular sin señal cobra la de origen ya juntada | Se rechaza: «… se juntó con …: cóbrela allá» (regla 8) |
| Dos celulares juntan la misma cuenta | La segunda se rechaza: «ya se juntó con …» |
| Otro celular anota en la de origen ya juntada | Se anota ahí: la cuenta revive con la alerta de «se anotó después» |
| Separar después de un cobro o abono en la de destino | Se rechaza: el pago ya pudo incluir lo juntado |

**Juntar una cuenta ya cobrada** (2026-11-15, pedido del negocio para el seguimiento: se
cerraron cuentas que eran de una abierta). La de origen puede estar cobrada: pasa con sus
pedidas **y sus pagos**, así que lo que falta en la de destino no cambia; separar la
devuelve cobrada. La de destino sigue teniendo que estar abierta; una anulada o pasada a
comida no se junta. Antes el servidor rechazaba ese caso, así que el registro viejo da el
mismo estado. En el menú de una cuenta cobrada: «Juntar con una cuenta abierta».

Al juntar una cuenta que no es cancha con una cancha, sus pedidas llegan como
**adicionales** (no son chicos); desde `JUNTAR_ADICIONAL_DESDE`, para que lo juntado antes
quede igual (regla 0).

`separar` devuelve todo a la de origen con sus números de pedida. Si la de origen ya
tenía otras juntas, al juntarla todo pasa como suyo.

**Cómo se ve lo juntado** (2026-11-16, pedido del dueño: juntó «Raúl» con «Raul» y nada
decía qué pedida había llegado). En «Pedidas» del detalle, cada pedida que vino de otra
cuenta lleva un borde morado tenue y la línea «🔗 Se unió de *nombre* (tipo) · quién, hora»
(de `juntadas`); el nombre ya no va pegado al título de la pedida. Solo pantalla: el
estado no cambia.

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

## Cambio de base (2026-11-02)

Para pasar producción a una base limpia (o volver atrás) se cambia el nombre de la
instancia del Durable Object (`vars.BASE` en `wrangler.jsonc`). Lo anotado contra una
base **nunca** debe aplicarse en otra: podría revivir cuentas descartadas. Por eso:

- La **foto** y la respuesta de **entrar** dicen su `base`. El celular guarda la que
  conoce en `bg.base`; uno de la versión 0.1, que no la guardaba, es de la original
  (`BASE_ORIGINAL` en `src/dominio/base.ts`).
- Cada **envío de operaciones** (WebSocket y HTTP) dice para qué base es. El servidor no
  aplica las de otra base (las que no lo dicen son de la original): responde con su foto
  (HTTP 409) y deja un aviso en el registro del Worker.
- El celular que recibe una foto de otra base descarta lo confirmado y **aparta** sus
  pendientes en `bg.pendientes-base-anterior`. No se reenvían nunca; la pantalla de inicio
  lo avisa y el administrador los descarga para revisarlos a mano (regla 8).
- Rutas solo del administrador: `GET /api/admin/respaldo` (el mismo JSON del respaldo
  diario, con `base`) y `POST /api/admin/importar`, que además exige la cabecera
  `x-migracion` con el secreto `MIGRACION` y solo carga en una base vacía (si no, 409).

Pruebas: `tests/servidor/barra.test.ts` («cambio de base») y
`tests/e2e/cambio-de-base.spec.ts`.
