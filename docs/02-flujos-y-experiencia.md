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

En el panel de comida, la lista de cuentas muestra primero las que tienen comida (con
cuánto va de comida); las demás de la barra quedan plegadas debajo. La pestaña «Cocina»
(mesas pasadas a comida por cobrar allá) se quitó: si queda alguna, sale como aviso
plegable arriba de las cuentas.

### Chico o adicional en las canchas (2026-11-08)

Toda pedida de cancha es un **chico** por defecto. Al agregar a una cancha, junto al botón
sale **Chico | Adicional** (en el teléfono, en el lugar de «Limpiar»): «Adicional» es algo
suelto después del chivo, que no cuenta como chico. En el detalle cada pedida tiene «Es
adicional» / «Es chico» para cambiarlo después. Se numeran aparte: Chico 1, Chico 2,
Adicional 1. No suma toques al caso común.

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
