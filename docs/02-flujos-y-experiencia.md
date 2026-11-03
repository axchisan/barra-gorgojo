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
- **Mecato** es de valor libre: al tocarlo aparece una fila de valores ($ 1.000 a
  $ 3.000) y «Otro valor». Cada valor tocado suma una línea.
- Debajo de las cervezas: gaseosas, jugos y agua; luego cigarrillos y mecato; al final
  lo que casi no se pide (licor por botella).
- Los agotados se ven atenuados y no responden.
- Al anotar: vuelve a la cuenta (o a inicio, según de dónde vino) con un aviso
  «Anotado · Deshacer» durante 6 segundos.

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
- Tocar una línea en esa lista permite **anular** ese producto (con motivo opcional). La
  línea anulada se ve tachada; no desaparece.
- Menú ⋮: renombrar, cambiar tipo, unir con otra cuenta, mostrar al cliente, anular
  cuenta.

### 5 · Cobrar

```
┌──────────────────────────────────────┐
│ ← Cobrar Grupo de Juan               │
│            $ 42.500                  │
│                                      │
│   [ Efectivo ] [ Nequi ] [ Breve ]   │
│                                      │
│ Recibido:                            │
│ [ Exacto ] [ 50.000 ] [ 100.000 ]    │
│ [ Otro valor ______ ]                │
│                                      │
│        Cambio: $ 7.500               │ ← grande
│                                      │
│ ┌──────────────────────────────────┐ │
│ │      Cobrar $ 42.500             │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

- Efectivo viene seleccionado. Los billetes sugeridos son los que superan el total.
- En una cuenta de **mesa**, en vez de cobrar directo aparecen dos botones del mismo
  tamaño: **«Cobrar aquí»** y **«Pasar a comida»**. No hay opción por defecto, a
  propósito: obliga a decidir (RF-42).
- Después de cobrar: «Cobrada · Deshacer» por 10 segundos.

### 6 · Cocina

Lista de cuentas **pasadas a comida** y aún sin cobrar allá: mesa, detalle resumido,
valor y un botón «Ya se cobró en comida». Es la pantalla que puede tener abierta quien
cobra en la cocina, o que se le muestra cuando va a cobrar la mesa.

### 7 · El día

Total vendido, cobrado por medio de pago, pasado a comida, cuentas abiertas y su valor,
unidades por producto. Desde aquí, **cerrar el día**: pide el efectivo contado y muestra
la diferencia con el esperado. Hoy no se hace cuadre de caja; el negocio lo quiere, así
que entra desde la primera versión.

### 8 · Entrada

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
