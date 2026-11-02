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
│ Nombre (opcional)  [Grupo de Juan_ ] │
│ [Grupo] [Persona] [🍽 Mesa…] [🎯 Cancha]│
```

- Si no escribe nombre, la cuenta queda como «Cuenta 12» y se puede renombrar.
- Al tocar «Mesa» aparece un teclado numérico grande para el número.
- Al tocar «Cancha» aparecen tres botones: **1**, **2** y **Pequeña**. Si ya hay una
  cuenta abierta en esa cancha, se ofrece abrirla en vez de crear otra; si el grupo paga
  por separado, se crea igual una segunda («Cancha 2 · los de rojo»).
- El tipo por defecto es «Grupo».
- El botón de abajo dice **«Abrir y anotar 3 · $ 12.000»**.
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
