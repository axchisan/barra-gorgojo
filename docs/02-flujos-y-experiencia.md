# 02 · Flujos y experiencia

## El principio

**El sistema compite contra un cuaderno y un lapicero.** El cuaderno no carga, no pide
contraseña y no se queda sin señal. Cada pantalla tiene que ganarle en velocidad o el
equipo vuelve al papel a la segunda semana. Por eso:

- **El toque es la unidad de costo.** Cada flujo se cuenta en toques y está escrito
  abajo. Agregar un toque al flujo principal requiere justificarlo.
- **Nunca se espera la red.** Todo toque responde al instante; el envío pasa por detrás.
- **Deshacer en vez de confirmar.** Un «¿Está seguro?» cuesta un toque cada vez; un
  «Deshacer» cuesta un toque solo cuando hubo error.
- **Los botones no cambian de lugar.** La memoria muscular es lo que hace rápido al que
  atiende. El orden del catálogo es fijo y lo decide el administrador.
- **El total es lo más grande de la pantalla** en toda vista de cuenta.

## Vocabulario de la pantalla

En la pantalla se habla como en el local. Cada pedido de una cuenta se llama
**«chico»** si la cuenta es de una cancha de tejo, y **«pedida»** en todas las demás. En
el código y en los documentos técnicos se llama *ronda*. Los botones cambian solos:
«Anotar chico» / «Anotar pedida», «Repetir chico» / «Repetir pedida».

## Las pantallas

### 1 · Cuentas abiertas (inicio)

```
┌──────────────────────────────────────┐
│ Barra            ● Todo al día  Ana  │ ← estado de conexión y quién está
│ ┌──────────────────────────────────┐ │
│ │ 🔍 Buscar cuenta o mesa           │ │
│ └──────────────────────────────────┘ │
│ ┌────────────────┐┌────────────────┐ │
│ │ Grupo de Juan  ││ 🍽 Mesa 4       │ │
│ │ $ 42.500       ││ $ 11.000       │ │
│ │ 14 · hace 3 min││ 4 · hace 12 min│ │
│ └────────────────┘└────────────────┘ │
│ ┌────────────────┐┌────────────────┐ │
│ │ Don Pedro      ││ 🎯 Cancha 2     │ │
│ │ $ 6.000        ││ $ 27.000       │ │
│ │ 2 · hace 25 min││ 9 · hace 1 min │ │
│ └────────────────┘└────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │        ＋  Nueva cuenta           │ │ ← zona del pulgar
│ └──────────────────────────────────┘ │
│  Cuentas  ·  Cocina (2)  ·  El día   │
└──────────────────────────────────────┘
```

- Tarjetas grandes, en dos columnas, ordenadas por **última actividad**: la que acaba de
  pedir sube. Cada tarjeta: nombre, total, unidades y hace cuánto pidió.
- Las mesas de comida y las canchas llevan ícono y fondo distinto.
- Tocar una tarjeta abre la cuenta. **Mantener presionado** abre directo «anotar pedida» (o «anotar chico»).
- La pestaña **Cocina** muestra un contador cuando hay cuentas pasadas a comida sin
  cobrar.

### 2 · Anotar pedida o chico (la pantalla más importante)

```
┌──────────────────────────────────────┐
│ ← Grupo de Juan          $ 42.500    │
│ ┌──────────────────────────────────┐ │
│ │ ↻ Repetir: 2 Rubia, 1 Light, …   │ │
│ └──────────────────────────────────┘ │
│ ┌──────────┐┌──────────┐┌──────────┐ │
│ │ RUBIA   2││  LIGHT  1││IMPORTADA │ │
│ │  4.000   ││  4.500   ││  6.000   │ │
│ └──────────┘└──────────┘└──────────┘ │
│ ┌──────────┐┌──────────┐┌──────────┐ │
│ │  LAGER   ││  ROJA   1││  NEGRA   │ │
│ │  4.000   ││  3.500   ││    —     │ │
│ └──────────┘└──────────┘└──────────┘ │
│ ── Gaseosas y jugos ──────────────── │
│ ┌──────────┐┌──────────┐┌──────────┐ │
│ │ GASEOSA  ││  JUGO    ││  AGUA    │ │
│ │  3.000   ││  3.000   ││  2.500   │ │
│ └──────────┘└──────────┘└──────────┘ │
│              … (desplaza)            │
│ ┌──────────────────────────────────┐ │
│ │  Anotar 4 · $ 16.000             │ │ ← fijo abajo
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- **Cada toque suma uno** y vibra. El contador aparece en la esquina del botón.
- Para restar: tocar el contador (o mantener presionado el botón). Se resta uno.
- Los botones llevan el **color de la marca** de cada cerveza (la rubia amarilla, la roja
  roja, etc.), porque el ojo encuentra antes el color que la palabra. Los colores
  se escogen en el catálogo de cada negocio.
- Las cervezas van primero, siempre arriba, sin tener que desplazarse. Las demás
  categorías debajo.
- **Repetir** precarga la última pedida de la cuenta; se ajusta y se anota. En las
  canchas es el caso normal: cada chico suele traer la misma ronda.
- **Mecato** es de valor libre: al tocarlo se abre una hoja con valores ($ 1.000,
  1.500, 2.000, 2.500, 3.000 y 5.000) y «Otro valor». Cada valor tocado suma una línea.
- **«＋ Otro»** es lo que no está en el catálogo: se escribe el nombre y el valor, y se
  marca si es **barra** o **comida** (un almuerzo anotado en la barra). Lo de comida se
  suma aparte en el total, en el cobro y en el día (RF-31).
- En las cuentas de **cancha** cada producto cobra su **precio de cancha**, si lo tiene; el
  botón lo muestra (RF-32).
- Debajo de las cervezas: gaseosas, jugos y agua; luego cigarrillos y mecato; al final
  lo que casi no se pide (licor por botella).
- Un producto desactivado por el administrador no aparece (no hay «agotado» atenuado:
  ver RF-61 en [01](01-requerimientos.md)).
- Al anotar: vuelve a la cuenta (o a inicio, según de dónde vino) con un aviso
  «Anotado · Deshacer» durante 6 segundos.
- **Avisos** (F4): salen arriba, sobre la barra superior, que solo tiene título y persona;
  así no tapan los botones de venta, que están abajo. Son pequeños, duran 2,5 s (6 s si
  tienen «Deshacer»), se quitan tocándolos o deslizándolos, y uno nuevo reemplaza al
  anterior. Lo que el servidor no aceptó (regla 8) sale en rojo y se queda hasta que se
  toque; si mientras tanto llega otro aviso, el rechazo vuelve cuando ese se va.

### 3 · Nueva cuenta

Es **la misma pantalla de anotar pedida**, con un campo arriba:

```
│ [👥|👤|🍽|🎯] [Nombre_____________] │   grupo o persona
│ [👥|👤|🍽|🎯] [N.º de mesa________] │   mesa
│ [👥|👤|🍽|🎯] [ 1 | 2 | Peq. ]      │   cancha
│ [Nombre (opcional): los de rojo   ] │   mesa y cancha: nombre debajo
```

Desde la fase C (2026-11-02) el tipo y lo que el tipo pide van en **una sola fila**, para
que los productos empiecen arriba en un teléfono pequeño. Los toques son los mismos.

- Si no escribe nombre, la cuenta queda como «Cuenta 12» y se puede renombrar.
- Al tocar «Mesa» aparece en la misma fila el campo numérico para el número.
- Al tocar «Cancha» aparecen en la misma fila tres botones: **1**, **2** y **Peq.** Si ya hay una
  cuenta abierta en esa cancha, se ofrece abrirla en vez de crear otra; si el grupo paga
  por separado, se crea igual una segunda («Cancha 2 · los de rojo»).
- El tipo por defecto es «Grupo».
- El botón de abajo dice **«Abrir y anotar»** y, debajo, **«3 · $ 12.000»**.
- Las cervezas se anotan por **Unidad · Medio · Petaco** (una fila); **Mixto** abre la
  hoja del petaco mixto. Fuera de «Unidad», la cuadrícula de cervezas se marca en amarillo,
  porque un toque suma 15 o 30.
- Abajo a la izquierda: **«Cobrar ya»**, para la venta rápida (RF-25).

### 4 · Detalle de la cuenta

```
┌──────────────────────────────────────┐
│ ← Grupo de Juan              ⋮       │
│                                      │
│            $ 42.500                  │
│        8 cervezas · 3 pedidas        │
│                                      │
│ [ Resumen ]  Pedidas                 │
│  4 Rubia          × 4.000   16.000   │
│  3 Light          × 4.500   13.500   │
│  1 Importada      × 6.000    6.000   │
│  1 Gaseosa litro  × 7.000    7.000   │
│                                      │
│ ┌────────────────┐┌────────────────┐ │
│ │  ＋ Pedida      ││ ↻ Repetir      │ │
│ └────────────────┘└────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │           Cobrar                 │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- **Resumen** agrupa por producto: es lo que el cliente quiere ver al pagar.
- **Pedidas** (o **Chicos**) muestra cada una con hora y quién la anotó: es lo que resuelve el
  «yo no pedí esa».
- Tocar un producto abre **«Cambiar cantidad»** (RF-33): más o menos unidades, marcarlo
  como barra o comida (RF-34), o **anularlo**. Queda quién y cuánto era; la línea anulada
  se ve tachada, no desaparece. Cada cambio tiene «Deshacer».
- Menú ⋮: cambiar nombre, mostrar al cliente y anular cuenta (vacía, cualquiera; con
  productos, el administrador con motivo). Cambiar el tipo y unir cuentas (RF-05, RF-06)
  no están hechos.

### 5 · Cobrar

```
┌──────────────────────────────────────┐
│ ← Cobrar Grupo de Juan               │
│            $ 42.500                  │
│                                      │
│   [ Efectivo ] [ Nequi ] [ Breve ]   │
│                                      │
│ Recibido:                            │
│ [ Exacto ] [ 43.000 ] [ 45.000 ]     │
│ [ 50.000 ] [ 100.000 ]               │
│ [ Otro valor ______ ]                │
│                                      │
│        Cambio: $ 7.500               │ ← grande
│                                      │
│ ┌──────────────────────────────────┐ │
│ │      Cobrar $ 42.500             │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- Efectivo viene seleccionado. Después de «Exacto» salen hasta cuatro valores con que de
  verdad pagan (`sugerirPago` en `src/dominio/pago.ts`): la cuenta redondeada hacia arriba
  al mil, a los cinco mil y a los diez mil, el siguiente múltiplo de 50.000 y de 100.000, y
  los billetes en circulación mayores que la cuenta; sin repetidos y de menor a mayor.
  Ej.: 37.000 → 40.000, 50.000, 100.000. Tocar uno muestra el cambio al instante; no
  agrega ningún toque al flujo.
- **«Mostrar al cliente»** (RF-27) está a la vista: bajo el total en el celular vertical y
  en la barra superior en pantallas anchas (celular girado, tablet). Muestra productos,
  total grande y, si ya escogió billete, con cuánto paga y el cambio. Tocar la pantalla o
  «atrás» vuelve al cobro con el medio y el billete escogidos.
- Girado, el cambio sale en la columna izquierda, bajo los medios de pago, para que no
  lo tapen los billetes.
- **Abonos (2026-11-08).** Debajo del total, «**Todo** · Productos · Valor». «Todo» es el
  cobro de siempre, por defecto, sin toques nuevos. «**Productos**»: cada pedida con sus
  productos por pagar; tocar la pedida la toma entera, tocar un producto lo toma, y − / +
  escogen cuántas unidades. «**Valor**»: un valor libre, o «Entre 2 / 3 / 4 / 5», que
  pone la parte de cada uno (redondeada hacia arriba a los cien). El botón dice «Abonar
  $ X». Después de un abono la pantalla se queda con lo que falta, para el siguiente que
  pague; cuando no falta nada, la cuenta queda cobrada. Cada quien escoge su medio. El
  aviso «Deshacer» deshace solo ese abono. En el detalle: «Abonado $ X · falta $ Y», la
  lista de abonos (con «Deshacer» para el administrador o para quien lo cobró hace menos
  de 5 minutos) y los productos ya pagados con ✓. La tarjeta dice «con abono». «Mostrar al
  cliente» muestra la cuenta, lo abonado y lo que falta. En el celular, «Mostrar al
  cliente» pasó a la barra de arriba («Ver cliente») para dejar la fila a «qué se cobra».
- En una cuenta de **mesa**, en vez de cobrar directo aparecen dos botones del mismo
  tamaño: **«Cobrar aquí»** y **«Pasar a comida»**. No hay opción por defecto, a
  propósito: obliga a decidir (RF-42).
- Después de cobrar: «Cobrada · Deshacer» por 6 segundos.

### 6 · Cocina

Lista de cuentas **pasadas a comida** y aún sin cobrar allá: mesa, detalle resumido,
valor y un botón «Ya se cobró en comida». Es la pantalla que puede tener abierta quien
cobra en la cocina, o que se le muestra cuando va a cobrar la mesa.

### 7 · El día

Total vendido, cobrado por medio de pago, pasado a comida, cuentas abiertas y su valor,
unidades por producto. Desde aquí, **cerrar el día**: pide el efectivo contado y muestra
la diferencia con el esperado. Hoy no se hace cuadre de caja; el negocio lo quiere, así
que entra desde la primera versión.

### 8 · Menú de la persona

Tocar el nombre arriba a la derecha: **Cambiar mi PIN**, **Cambiar de persona** y, para el
administrador, **Productos y precios** y **Personas y celulares**.

### 9 · Productos y precios (administrador)

- **Editar**: nombre, nombre corto del botón, categoría, precio, precio de cancha, colores
  del botón (con vista previa) y si está activo. «＋ Nuevo producto» crea uno.
- **Ordenar**: ◀ ▶ mueven cada botón; el orden es el mismo en todos los celulares y no
  cambia solo (RF-63).
- Los cambios son operaciones del registro: el precio nuevo rige para lo que se anote
  después; lo anotado conserva el suyo (RNF-32).

### 10 · Personas y celulares (administrador)

Personas con su rol y su PIN (el administrador lo ve, ADR-10): agregar, activar o
desactivar y quitar el PIN (la persona crea uno nuevo al entrar). Celulares: vincular uno
con un código de 6 números y quitar uno perdido (RF-72).

### 10 b · Accesos de empleados (administrador, 2026-11-15)

En «Personas y celulares», al tocar la persona: «📊 Ve el día de ventas», «🗂 Ve deudas y
cuentas de otros días» y «⏰ Horario de acceso» (Siempre · Domingos 8 a. m.–3 p. m. · Sin
acceso; franjas por semana y días especiales). Quien no ve el día no tiene la pestaña «El
día»; quien no ve el historial ve en Deudas «Fiado hoy». Fuera de su horario la entrada
dice cuándo puede entrar, y al terminar la franja la app vuelve sola a la entrada con
«⏰ Terminó su horario». Ver [17](17-accesos-de-empleados.md).

### 11 · Auditoría (administrador, E4)

Desde el menú de la persona. Un día a la vez (◀ ▶, empieza en hoy): cada operación en una
frase con hora, quién y cuenta, de la más reciente a la más vieja («Anotó 3 Rubia ·
$ 12.000», «Anuló la cuenta con $ 8.000 · motivo: …», «Reabrió la cuenta»). Lo que
conviene revisar sale resaltado y se puede ver solo eso: anulaciones, reaperturas, cambios
de cantidad o de precio, cierres con diferencia. Filtro por persona. Arriba, lo que el
servidor no aceptó ese día. En «Personas y celulares», cada celular dice si está conectado
ahora, quién lo usa, su versión de la app y si le queda algo por enviar.

### 12 · Entrada

- Celular nuevo: pide el **código de vinculación** de 6 dígitos que genera un
  administrador desde su celular. Se hace una vez por aparato.
- Celular ya vinculado: muestra las personas como botones grandes con su inicial y
  color; se toca la persona y se escribe el PIN de 4 dígitos.
- La sesión dura toda la jornada. **Cambiar de persona**: tocar el nombre arriba, tocar
  otra persona, PIN. Tres toques más el PIN.

## Los recorridos, contados

| Situación | Toques |
|---|---|
| El Grupo de Juan pide otra pedida distinta (2 Rubia, 1 Light) | Mantener tarjeta → Rubia → Rubia → Light → Anotar = **5** |
| El Grupo de Juan pide **lo mismo** otra vez | Mantener tarjeta → Repetir → Anotar = **3** |
| Llega un señor y pide 2 Rubia, paga al final | Nueva → Rubia → Rubia → Abrir y anotar = **4** (más el nombre si se quiere) |
| Alguien compra una gaseosa y paga ya, con billete de 10 mil | Nueva → Gaseosa → Cobrar ya → 10.000 → Cobrar = **5** |
| La Mesa 4 pide 3 Coca-Cola personales | Nueva → Mesa → 4 → Coca ×3 → Abrir y anotar = **7** |
| Cobrar al Grupo de Juan con Nequi | Tarjeta → Cobrar → Nequi → Cobrar = **4** |
| La Mesa 4 se va y paga todo en la cocina | Tarjeta → Cobrar → Pasar a comida = **3** |
| La Cancha 2 terminó otro chico y pide lo mismo | Mantener tarjeta → Repetir → Anotar = **3** |
| Un paquete de mecato de 2 mil a la cuenta de Don Pedro | Mantener tarjeta → Mecato → $ 2.000 → Anotar = **4** |

### Panel de comida (2026-11-08)

Igual que anotar en la barra, con dos pestañas en la cabecera, **🍽 Comida | 🍺 Bebidas**
(cada una con cuántos lleva la pedida): en el panel de comida abre en Comida, con los
platos en botones grandes; en el de la barra, en Bebidas. Quien solo tiene barra no ve
las pestañas. La cuenta nueva empieza en «Mesa». La carta se crea de una vez en
«Productos y precios → Crear platos» (un plato en varios precios = un botón por precio). El caso común no suma toques. Una **nota** («solo carne») suma dos
toques (✎ nota → la nota → Agregar) y solo cuando la hay. El plato de otro valor: «Otro
valor» → valor → Agregar. Las bebidas anotadas aquí le llegan a la barra con aviso
(sonido, vibración y franja arriba) hasta que se despachan; la pestaña «Despachar» sale
solo cuando hay algo pendiente, para no quitar espacio.

**Ocultar lo del otro panel** (2026-11-14): en la franja de arriba, a la derecha, un solo
botón. En Barra, «🍽 Ocultar» esconde las cuentas de solo comida; en Comida, «🍺 Ocultar»
esconde las de solo barra. Lo que mezcla las dos cosas (comida con bebidas) siempre se ve.
Cada aparato recuerda su preferencia por panel (Comida empieza ocultando lo de la barra);
debajo de las cuentas se avisa «N cuentas … ocultas · Mostrar». En el celular, el botón y
el cambio de panel van solo con ícono para que quepa todo. La pestaña «Cocina»
(mesas pasadas a comida por cobrar allá) se quitó: si queda alguna, sale como aviso
plegable arriba de las cuentas.

### Chico o adicional en las canchas (2026-11-08)

Toda pedida de cancha es un **chico** por defecto. Al agregar a una cancha, junto al botón
sale **Chico | Adicional** (en el teléfono, en el lugar de «Limpiar»): «Adicional» es algo
suelto después del chivo, que no cuenta como chico. En el detalle cada pedida tiene «Es
adicional» / «Es chico» para cambiarlo después. Se numeran aparte: Chico 1, Chico 2,
Adicional 1. No suma toques al caso común. En el detalle (2026-11-15) se distinguen de
lejos: etiqueta de color **🎯 CHICO 5** (verde) o **＋ ADICIONAL 3** (ámbar) y el borde
de la tarjeta del mismo color; el botón dice lo que hace: «Pasar a adicional» / «Pasar a
chico» (antes «Es chico», que se leía como el estado y confundía). «Repetir» trae el último **chico**; un
adicional solo si la cancha no tiene ningún chico.

Una pedida con todo anulado (por «Deshacer» o a mano) no se cuenta ni se numera, y en el
detalle queda plegada al final en «▸ Pedidas anuladas (n)». Sigue en la auditoría.

**Precio de los adicionales (2026-11-15).** El adicional va a **precio normal** y el chico
a precio de cancha (docs/04). Con «Adicional» escogido sale, arriba del botón, una
etiqueta «Precio normal · cambiar»: tocarla lo cobra a precio de cancha. Los botones de
productos muestran el precio que va a cobrar. En el detalle, cada **adicional** con
productos de precio de cancha tiene el chip «🎯 Precio cancha» / «Precio normal» para
cambiarlo después (con «Deshacer»); en los chicos solo sale si alguien les cambió el
precio de siempre, para no recargar la pantalla. **No agrega toques al caso común** (anotar un chico o
un adicional normal sigue igual); solo el caso raro (adicional a precio de cancha) lleva
un toque más.

### Opciones de un producto: sabores y marcas (2026-11-15)

Pedido por el negocio: la gaseosa general se sigue anotando con **un toque** (lo eficiente
cuando no importa el sabor), pero a veces hay que anotar «dos Colombianas».

- **Un toque** en un producto anota el general, como siempre (no cambia el caso común).
- **Mantenerlo presionado** (medio segundo, sin mover el dedo) abre la hoja «¿cuál?» con
  sus opciones: cada toque suma uno, el contador quita, «Listo · N» cierra. En el
  computador, **clic derecho** (o la tecla de menú). Vibra al abrir.
  Probado en los aparatos del local (2026-11-14): al abrirse la hoja bajo el dedo, Chrome
  en Android seleccionaba su título y sacaba «Copiar · Seleccionar todo» y la búsqueda de
  Google. Desde entonces **en toda la app no se selecciona texto** con el dedo, salvo en los
  campos donde se escribe (`tests/e2e/presionar.spec.ts` lo prueba con toques reales).
- El botón de un producto con opciones lleva una pestañita **⋯** en el borde de abajo, y su contador suma
  el general y las opciones. El «−» quita primero del general y después de la última opción.
- Sirve para cualquier producto que no sea «Otro»: gaseosas de cada tamaño, mecato
  (marcas con su precio), cervezas (también en petacos).
- Al anotar, la línea guarda el nombre de la opción («Colombiana (pequeña)») y su precio.

**Administración** («Productos y precios» → el producto general): sección «Opciones al
mantener presionado» con cada opción (tocarla la edita: nombre, botón, precio, precio de
cancha, color, visible, sección), ▲▼ para ordenarlas, «＋ Nueva opción» (empieza con el
precio y el color del general) y «＋ Varias de una vez»: en las gaseosas trae marcadas las
más comunes de Colombia (Postobón y Coca-Cola, `src/app/sugerencias.ts`), con el precio
del general para todas; también se escriben otras separadas por comas. En cualquier
producto, «Es opción de» lo vuelve opción de otro (o lo saca, «tiene su propio botón»).
Las opciones no salen en la lista de productos: se ven dentro de su general («⋯ 11
opciones»). Un solo nivel: una opción no tiene opciones.

### Pedido rápido a la barra (2026-11-08)

En el panel de comida, «🔔 Pedir a la barra» abre el panel de bebidas con **Detalles**
(«para el limón») y a qué cuenta va: una nueva (por defecto, con el detalle de nombre) o
una abierta, con un toque. Llega a la barra como las bebidas de las mesas (aviso con
sonido y «Despachar»), con el detalle en grande. Lo pedido queda en una cuenta: se cobra
como cualquier otra.

### Productos gratis: los vasos (2026-11-15)

Un producto puede costar **$ 0** (en «Productos y precios», precio 0): el botón dice
«gratis», se anota y se cuenta pero no suma plata. Para los vasos: comida los pide para la
mesa como cualquier bebida (le suenan a la barra para llevarlos) sin cobrar nada. Antes el
servidor ignoraba un producto en 0, y no había ninguno así en el registro.

### Notas de comida (2026-11-15)

Visto en producción: casi todas las notas de picadas dicen qué carnes lleva («Res, cerdo y
chorizo», «Carne de res y gallina», «Con sola res») y se escribían a mano.

- **«✎ nota»** en cada plato: chips que se combinan con toques (las notas rápidas del
  producto, que pone el administrador: en las picadas, las carnes) más **las notas que se
  escribieron hace poco para ese tipo de plato** (todas las «Picada…» comparten; las más
  usadas primero, hasta 8). Lo que alguien escribió una vez queda a un toque para el
  siguiente. Hasta 120 letras.
- **«📝 Nota»** (larga) en la cuadrícula de comida: la nota de toda la pedida, hasta 300
  letras («la de 50 sin yuca y la de 30 para llevar…»). Se ve arriba de los botones antes
  de anotar, y después en la pedida, la cuenta y la auditoría.

Prueba: `tests/e2e/notas.spec.ts` (teléfono 360 × 740).

### Mesa sin número, domicilios y apartados (2026-11-15)

Pedido por comida (se usa en los teléfonos):

- **El número de mesa es opcional.** Sin él, la cuenta queda «Mesa · 1:15 p. m.» (o con el
  nombre que escriban). Antes no dejaba anotar.
- **🛵 Domicilio**: quinto tipo de cuenta, con el nombre del cliente, la dirección o
  referencia y la **hora de entrega** (opcionales). La tarjeta dice «🛵 Domicilio · …».
  La tarjeta va **en su lugar de siempre** (la lista aparte de arriba se quitó el mismo
  día: incomodaba) con una marca sutil: «En preparación · 12:30» (en rojo si se atrasó).
  En el detalle, una línea: en qué va, la hora (tocarla la cambia) y un botón al siguiente
  paso (📥 Recibido → 🍳 En preparación → 🛵 En camino → ✅ Entregado; «Deshacer» devuelve).
  **Recordatorio**: si pasa la hora sin entregarse, aviso rojo «⏰ Domicilio atrasado»
  arriba de cualquier pantalla (para quien tiene comida) y timbre al atrasarse y cada 5
  minutos. Operación `domicilio` (`cuenta, estado?, entrega?`); los domicilios abiertos
  antes quedan «Recibido» sin cambiar lo guardado. Prueba:
  `tests/e2e/domicilios.spec.ts`.
- **⏰ Apartar para más tarde**: al anotar (cuenta nueva o ya abierta), un chip que marca la
  pedida como apartada, con hora opcional («una picada para las 2»). En el inicio, arriba
  de las cuentas, sale **«⏰ Apartados»** por hora (los sin hora al final): quién, qué y
  «Entregado» (con «Deshacer»). Los atrasados, en rojo. La tarjeta dice «⏰ Apartado · 2:00
  p. m.» y en el detalle la pedida tiene «⏰ Apartado · Entregado». No suma toques al caso
  común: el chip solo se toca cuando es un apartado.

- **🔔 Avisar a la barra** (en comida, prendido de entrada; el chip sale solo cuando la
  pedida lleva alguna bebida, para no ocupar espacio con platos): las bebidas que anota comida
  le suenan a la barra para despacharlas. Si comida misma la lleva, se apaga («🔕 Sin
  avisar: la llevo yo») y la bebida queda despachada por quien la anotó: no suena, no queda
  pendiente y la cuenta sigue en la lista de comida.
- El chip de apartar, el de avisar a la barra y la lista «⏰ Apartados» salen **solo en el
  panel de comida**: en la barra no ocupan espacio (la tarjeta sí dice «⏰ Apartado»).

La pedida apartada cuenta en la cuenta como cualquier otra (se cobra igual). Pruebas:
`tests/apartados.test.ts`, `tests/e2e/apartados.spec.ts` (teléfono 360 × 740).

### No se puede despachar (2026-11-15)

En «Despachar», la barra tiene «🚫 No se puede» junto a «Despachado»: una hoja con los
productos del pedido (todos marcados; se desmarca lo que sí hay) y el motivo en un toque
(«Se acabó», «No hay fría», «No hay en ese tamaño», «Otro…»). A comida le llega un aviso
rojo con el motivo hasta «Entendido». Ver docs/04 «Rechazar un pedido a la barra».

### Sonido del aviso y cancelar el pedido (2026-11-14)

El aviso de bebidas por despachar suena como una campana limpia (tonos puros con
armónicos suaves que se desvanecen, un eco corto para darle cuerpo y un limitador para que
suene fuerte sin rajarse; 2026-11-14 reemplazó el pitido de ondas cuadradas). Timbre a
escoger: **Campana** (tres notas que suben) o **Ding-dong**. Se configura en cada aparato desde el menú, «🔔 Sonido de los
avisos»: **Insistente** (cada 4 s hasta que despachen; por defecto), **Cada minuto**,
**Una vez** o **Sin sonido**, con «Probar sonido». Mientras haya algo por despachar, la
pantalla no se apaga sola (Wake Lock), para que el aviso no se pierda.

Un pedido a la barra que aún no se despacha se puede **cancelar** desde «Despachar» o
desde la pedida en el detalle de la cuenta: anula esas bebidas, con confirmación porque
no se deshace.

### Lo que se vio en producción con un pedido a la barra (2026-11-15)

Prueba del dueño: desde la persona que tiene barra y comida pidió desde comida una Coca-Cola
grande y una Águila, y salieron tres falencias, arregladas el mismo día:

- **Le sonaba su propio pedido.** El aviso y el timbre son para los demás: lo anotado en un
  aparato no le suena a ese mismo aparato (`src/app/propios.ts`), aunque tenga la barra.
  Se cuenta por aparato y no por persona, para que la tablet de la barra sí suene aunque
  esté abierta con el mismo nombre. En «Despachar» sí lo ve.
- **No podía cancelarlo**: como tenía la barra, le salía «No se puede» (el rechazo de la
  barra) en vez de «Cancelar pedido». Ahora quien pidió (en ese aparato o con su nombre)
  ve «Cancelar pedido»; la barra, para los pedidos de otros, «No se puede».
- **La cuenta quedaba abierta en $ 0.** Si al cancelar la cuenta no tiene nada más (ni
  productos vivos ni pagos), se anula también («Pedido cancelado»), con aviso.

Y para que no haya confusiones, «Despachar» trae más detalle: **una tarjeta por pedida**
(no por cuenta) con la hora exacta y hace cuánto, la nota de la pedida, las notas de cada
producto, cuál pedida es y quién la pidió. Abajo, **«Últimas 2 horas»**: lo despachado
(quién y a qué hora) y lo que no se pudo (motivo); la pestaña sigue visible mientras haya
algo de esas 2 horas, para comida también. En el detalle de la cuenta, cada bebida
despachada dice «✓ despachado · Yair · 3:50 p. m.».

**Cobrar por área**: cuando una cuenta tiene por pagar cosas de barra y de comida, el cobro
muestra «🍺 Solo barra $ X» y «🍽 Solo comida $ Y»: un toque escoge todos los productos de
esa área (de todas las pedidas) y se cobra como abono por productos. Antes había que
tocarlos uno por uno. Prueba: `tests/e2e/pedidos-barra.spec.ts`.

### El día para hacer cuentas (2026-11-15)

Rehecho con la venta real de ese día (77 cuentas, 22 con comida y barra juntas, cobradas
enteras en una sola caja). Lo que costaba al hacer cuentas era saber **cuánto de comida se
pagó por Nequi** y **cuánto le pasa una caja a la otra**. Ahora, de arriba abajo:

1. **Vendido hoy**, partido en 🍺 barra y 🍽 comida, y cuántas cuentas faltan por cobrar.
2. **Cuadre de caja** (arriba, C10): el efectivo que debe haber en la caja escogida, lo que
   entró por Nequi, Breve y fiado, el contado y «Cerrar el día».
3. **¿Cómo pagaron?**: una tabla por medio (efectivo, Nequi, Breve, fiado) con columnas
   barra, comida y total, más «Cobrado» y «Por cobrar». Cada pago de una cuenta mixta se
   reparte: el pago por productos, exacto; los demás, según lo que le faltaba a cada área
   (`cuentasDelDia` y `repartirPagos` en `src/dominio/jornada.ts`). Tocar una fila filtra
   las cuentas.
4. **Entre cajas**: «Efectivo: la barra le pasa a la cocina $ 305.000», con lo que cada caja
   cobró de la otra; igual para Nequi y Breve si hubo.
5. **Cuentas del día**: filtros (Todas, Efectivo, Nequi, Breve, Fiado, Por cobrar, Con
   comida, Anuladas), buscador y, en cada cuenta, la hora, lo de barra y lo de comida, y
   cada pago con medio, valor, quién cobró y en qué caja (y a nombre de quién quedó lo
   fiado). Con un filtro, arriba sale la suma («9 cuentas · $ 604.500 · 🍺 … · 🍽 …»). Tocar
   una cuenta la abre.
6. **Por producto**, comida y barra por separado.

En el portátil y la tablet girada va en dos columnas. Pruebas: `tests/cuentas-del-dia.test.ts`,
`tests/e2e/el-dia.spec.ts`.

### Editar una pedida (2026-11-15)

En el detalle, vista Pedidas o Chicos: **«＋ Agregar»** en la cabecera de la pedida abre
los productos (toques suman, «−» quita) y «Agregar N · $ X» los pone en esa pedida.
Tocar un producto abre su hoja con **«⇄ Cambiar por otro producto»**: un toque en el
nuevo y queda. Lo agregado se marca «＋», el reemplazo «⇄» y lo cambiado sale tachado
con «→ nuevo». No toca el flujo de anotar. De paso se arregló que, al cerrarse dos hojas
a la vez, el siguiente «←» no salía de la pantalla.

### Totales a la vista (2026-11-08)

En el panel de la pedida (tablet o celular girado) cada producto lleva su valor y al pie
va el total: cuántos productos y cuánto vale; si es una cuenta ya abierta, en cuánto
queda. En el detalle, cada pedida dice cuántos productos lleva junto a lo que vale.

## Reglas visuales

- **Modo claro**, alto contraste, igual que el sitio: se usa con sol y bajo luz
  amarilla. Fondo crema, texto marrón oscuro, botón principal rojo. Paleta y
  tipografías de `../ElrentendelGorgojo/docs/04-identidad-visual.md`.
- Totales en `Bitter` 700. Interfaz en `Source Sans 3`. Cifras tabulares para que los
  números no bailen al cambiar.
- Precio siempre con separador de miles: `$ 42.500`.
- La barra de estado de conexión usa color **y** palabra: verde «Todo al día», ámbar
  «Sin señal · 3 por enviar», nunca solo un punto de color.
- Vibración corta en cada toque de producto (si el celular lo permite).
- Sin animaciones decorativas. Las transiciones existen solo para que se entienda a
  dónde se fue algo, y duran menos de 150 ms.

## Teclado y gestos (2026-11-02)

Revisado con el teclado real en la tablet y en un celular, en las apps instaladas:

- **✓ / Enter hace lo esperable.** En «＋ Otro», del nombre pasa al valor (el teclado
  cambia solo a números) y del valor agrega y cierra la hoja. En los demás campos
  (nombre de la cuenta, mesa, buscar, «Otro valor» al cobrar, efectivo contado) baja el
  teclado.
- **Mientras se escribe no hay barras fijas** (pie y pestañas) encima del teclado:
  vuelven al bajarlo. En horizontal el panel lateral de anotar se queda.
- **«Atrás»** primero baja el teclado (lo hace Android), después cierra la hoja o el
  menú abierto, y después sí vuelve a la pantalla anterior. Las hojas también tienen ✕.
- **El diseño no salta al abrir el teclado.** La forma de la pantalla (vertical,
  horizontal, baja) se decide sin teclado; en la tablet vertical el teclado deja el área
  más ancha que alta y antes eso cambiaba al diseño horizontal mientras se escribía.
- El campo que recibe el foco se desplaza a la vista si el teclado lo tapa.

Pruebas: `tests/e2e/teclado.spec.ts`.

## Teclado físico: la app en el portátil (2026-11-15)

Para cuando solo hay un portátil a la mano (docs/18 fase 2). **No cambia nada en el
celular**: los atajos solo actúan con teclado de verdad y nunca mientras se escribe en un
campo (salvo `Esc` y `Ctrl/⌘ + Enter`). `?` muestra la lista en la app.

| Dónde | Tecla | Qué hace |
|---|---|---|
| Todo | `Esc` | Atrás o cerrar la hoja; en un campo, sale del campo. En el inicio no se sale de la app |
| Todo | `?` | Los atajos |
| Cuentas | `/` · `N` · `1`…`9` | Buscar · nueva cuenta · abrir la cuenta 1…9 de la lista |
| Cuenta | `A` · `R` · `C` | Anotar · repetir · cobrar |
| Anotar | letras | Busca el producto por su botón o su nombre, sin tildes («agu» → Águila); se resalta y abajo se ve lo escrito |
| Anotar | números y letras | Esa cantidad: «4rub» + `Enter` = 4 Rubia |
| Anotar | `Enter` · `Retroceso` · `Esc` | Sumar el resaltado · borrar una letra · borrar lo escrito |
| Anotar | `Ctrl/⌘ + Enter` | Anotar (o «Abrir y anotar») |
| Cobrar | `E` · `N` · `B` · `D` | Efectivo, Nequi, Breve, deuda |
| Cobrar | números | Con cuánto paga, en efectivo (calcula el cambio) |
| Cobrar | `Ctrl/⌘ + Enter` | Cobrar. Ninguna tecla sola cobra, para no cobrar sin querer |

Anotar una ronda en el portátil: `A`, «4agu», `Enter`, `Ctrl+Enter`.

**Dos columnas en el portátil.** Con pantalla de 1300 px o más y sin pantalla táctil, el
inicio va en dos columnas: la lista de cuentas y, a la derecha, la cuenta abierta (tocarla o
su número del 1 al 9). Anotar y cobrar siguen a pantalla completa; al volver, la cuenta
sigue en el panel. `Esc` (o ←) lo cierra. La tablet de la barra y los teléfonos (táctiles)
quedan igual. Prueba: `tests/e2e/teclado-fisico.spec.ts`.

## Entrada por persona (fase D, 2026-11-02)

- **Una vez por celular:** se escribe el código de 6 números que da el administrador
  («Personas y celulares» → «Vincular un celular») y, si se quiere, un nombre para el
  celular («Tablet de la barra»).
- **Al llegar o al cambiar de persona:** se toca el nombre y se escribe el PIN en un
  teclado grande de la propia app (al cuarto número entra solo). La primera vez, la
  persona crea su PIN escribiéndolo dos veces. El administrador no aparece en la lista:
  entra por «Soy el administrador».
- Son 5 toques para entrar (nombre + 4 números), **fuera del flujo de anotar**: anotar
  una ronda sigue en 3 toques (regla 1). La sesión dura 60 días.
- **Anular una cuenta con productos** es solo del administrador y pide el motivo; una
  cuenta vacía la anula cualquiera. «Reabrir» una cuenta cobrada solo lo ve el
  administrador; el «Deshacer» del aviso sigue sirviendo 5 minutos a quien cobró.
- Si el servidor no acepta algo (por ejemplo, un cambio de precio de quien no es
  administrador), se avisa «No se hizo: …» y no queda pendiente.

## Todo a la vista (2026-11-02)

En las vistas de venta lo necesario para terminar la acción se ve sin deslizar, en el
celular y la tablet, en vertical y girados (`tests/e2e/a-la-vista.spec.ts`). En el
celular girado, anotar, detalle y cobrar usan dos columnas: lo que se elige a la
izquierda y el total con los botones a la derecha. «Cambiar cantidad» se abre como hoja.

## Cerrar el día (E1, 2026-11-02)

En «El día», al escribir el efectivo contado aparece **«Cerrar el día»**. Queda registrado
quién cerró, a qué hora, lo contado y lo que debía haber en ese momento; la pantalla
muestra si cuadró, sobraba o faltaba. Cerrar no bloquea nada: si después entra otro
cobro, la pantalla lo dice y se puede cerrar otra vez. El administrador ve los **días
anteriores** (vendido, por medio de pago, cierre) y baja el **CSV** de cada día: una fila
por producto vendido, para la hoja de cálculo.
