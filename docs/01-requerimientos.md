# 01 · Requerimientos

Prioridad: **M** = obligatorio para la primera versión usable (fase 1) · **D** = deseable,
fase 2 · **F** = futuro, fase 3 o después. Las fases están en [07](07-roadmap.md).

## Funcionales

### Cuentas

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-01 | Abrir una cuenta con un **nombre libre** («Grupo de Juan», «Don Pedro»). Si no se escribe nombre, se asigna uno automático («Cuenta 12») que se puede cambiar después | M |
| RF-02 | Cada cuenta tiene un **tipo**: grupo, persona, **mesa de comida** (con número) o **cancha de tejo** (1, 2 o pequeña). El tipo se ve con un ícono y el número, para que se distinga de un vistazo | M |
| RF-03 | Ver todas las **cuentas abiertas** en una sola pantalla, con nombre, total y hace cuánto fue la última ronda, ordenadas por actividad reciente | M |
| RF-04 | **Buscar** una cuenta escribiendo parte del nombre o el número de mesa | M |
| RF-05 | Cambiar el nombre o el tipo de una cuenta | M |
| RF-06 | **Unir dos cuentas** («pásele lo de Pedro a la cuenta de Juan»). La cuenta de origen queda cerrada como unida y sus rondas pasan a la de destino | D |
| RF-07 | Anular una cuenta abierta por error. Si ya tiene rondas, solo un administrador | D |
| RF-08 | Sugerir nombres de clientes frecuentes al escribir | F |

### Rondas («pedidas» y «chicos»)

En el código y en estos documentos, cada pedido de una cuenta es una **ronda**. En la
pantalla se dice como en el local: **«chico»** en las cuentas de cancha (cada chico de
tejo trae su ronda) y **«pedida»** en las demás.

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-10 | Anotar una **ronda** («pedida») en una cuenta tocando los productos: cada toque suma uno, con contador visible sobre el botón | M |
| RF-11 | Restar un producto de la ronda antes de anotarla | M |
| RF-12 | La ronda se confirma con un solo botón que muestra cantidad y valor: «Anotar 5 · $ 15.000» | M |
| RF-13 | **Repetir la última ronda** de una cuenta con un toque, y ajustarla antes de anotar | M |
| RF-14 | Cada ronda guarda **quién la anotó, desde qué celular y a qué hora** | M |
| RF-15 | Abrir cuenta y anotar la primera ronda en la **misma pantalla**, sin pasos intermedios | M |
| RF-16 | **Anular un producto** ya anotado (se equivocó, el cliente lo devolvió). Queda registrado quién lo anuló; nunca se borra | M |
| RF-17 | Nota libre opcional en una ronda («sin hielo», «para llevar») | D |
| RF-18 | Productos de **valor libre** (el mecato): al tocarlos se escoge un valor rápido o se escribe uno | M |
| RF-19 | Cancha con varios equipos que pagan por separado: por ahora se abren cuentas aparte («Cancha 2 · los de rojo»). Un selector «¿quién paga este chico?» queda para después | F |

### Cobro

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-20 | Ver el **detalle de la cuenta** de dos maneras: por ronda (cuándo y quién) y resumida por producto («6 Rubia × $ 4.000 = $ 24.000») | M |
| RF-21 | **Cobrar** la cuenta completa escogiendo el medio: efectivo, Nequi o Breve | M |
| RF-22 | En efectivo, botones de billete rápido (exacto, 10, 20, 50, 100 mil) y **cálculo del cambio** | M |
| RF-23 | **Pasar a la cuenta de comida** una cuenta de mesa: se cierra en la barra con el valor, marcada para que la cocina la cobre. Ver «La regla de las mesas» abajo | M |
| RF-24 | Deshacer un cobro durante los segundos siguientes, sin diálogos de confirmación | M |
| RF-25 | **Venta rápida**: alguien compra y paga en el momento, sin cuenta con nombre. Es abrir, anotar y cobrar en un solo recorrido | M |
| RF-26 | Si llegan rondas a una cuenta ya cobrada (porque otro celular anotó sin señal), la cuenta **se reabre sola con saldo pendiente** y avisa en todos los celulares | M |
| RF-27 | Modo **«mostrar al cliente»**: pantalla limpia con el resumen y el total en letra grande, para girar el celular y enseñarlo | D |
| RF-28 | Pago en varias partes (dividir la cuenta o abonos) | F |
| RF-29 | Fiado: cuenta a nombre de un cliente conocido que se paga otro día | F |

### La regla de las mesas de comida

Hoy no hay regla fija: las bebidas de una mesa a veces se cobran en la barra y a veces
en la cuenta de comida. El sistema no cambia esa costumbre, pero la deja **escrita**:

1. Las bebidas de una mesa **se anotan siempre en la barra**, en una cuenta de tipo
   mesa («Mesa 4»). Es la única forma de que el registro exista.
2. Al final, esa cuenta se cierra de **una sola** de dos maneras:
   - **Cobrada en la barra**, como cualquier otra cuenta.
   - **Pasada a comida**: la barra no la cobra; queda el valor para que la cocina lo
     sume a la cuenta de la mesa.
3. Una cuenta pasada a comida aparece en la **lista de la cocina** (RF-41) hasta que
   alguien de la cocina la marque como cobrada.
4. Al cerrar el día, lo pasado a comida se suma aparte: es plata de bebidas que entró por
   la caja de la cocina.

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-40 | Las cuentas de mesa abiertas se distinguen visualmente y muestran el número de la mesa | M |
| RF-41 | **Lista para la cocina**: las cuentas pasadas a comida, con mesa, detalle y valor, y un botón «Ya se cobró en comida» | M |
| RF-42 | Una cuenta de mesa no se puede cerrar sin escoger entre «cobrar aquí» y «pasar a comida» | M |

### Jornada y reportes

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-50 | Ver **cómo va el día**: total vendido, cuentas abiertas y su valor, cobrado por medio de pago | M |
| RF-51 | **Cerrar la jornada**: efectivo esperado contra efectivo contado, total por medio de pago, pasado a comida, unidades por producto. Avisa si quedan cuentas abiertas. Hoy no se hace y el negocio lo quiere | M |
| RF-52 | Ver jornadas anteriores | D |
| RF-53 | Exportar ventas a CSV para hoja de cálculo | D |
| RF-54 | Reportes semanales y mensuales: qué se vende, qué días, a qué horas | F |
| RF-55 | Inventario de nevera y bodega descontado con las ventas, y aviso de reposición | F |

### Catálogo

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-60 | Catálogo de productos con nombre, nombre corto para el botón, categoría, precio y color | M |
| RF-61 | Marcar un producto **agotado**: se ve atenuado y no se puede anotar. Lo puede hacer cualquier usuario | M |
| RF-62 | Cambiar precios, agregar productos y ordenar los botones. Solo administrador | M |
| RF-63 | Los productos más vendidos aparecen primero en la cuadrícula (orden fijo definido por el administrador, no automático, para que los botones no cambien de lugar) | M |

### Usuarios y dispositivos

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-70 | Entrada con **nombre y PIN de 4 dígitos**. Cambiar de persona en el mismo celular en dos toques | M |
| RF-71 | Un celular nuevo solo entra si un administrador lo **vincula** con un código temporal | M |
| RF-72 | Revocar un celular perdido o de alguien que ya no trabaja ahí | M |
| RF-73 | Dos roles: **administrador** (todo) y **operador** (anotar, cobrar, anular productos de cuentas abiertas, agotados) | M |
| RF-74 | Registro de auditoría consultable: quién anotó, anuló, cobró o reabrió qué | D |

## No funcionales

### Velocidad — el requerimiento que manda

| ID | Requerimiento | Meta |
|---|---|---|
| RNF-01 | Anotar una ronda en una cuenta abierta | **3 toques, menos de 5 segundos** |
| RNF-02 | Abrir cuenta nueva y anotar la primera ronda | 4 toques sin nombre; escribir el nombre es opcional |
| RNF-03 | Respuesta de la interfaz a cada toque | Menos de 100 ms. **Nunca espera al servidor** |
| RNF-04 | Abrir la app ya instalada | Menos de 1 s hasta la lista de cuentas, con o sin señal |
| RNF-05 | Sin diálogos de confirmación en el flujo normal | Se usa «deshacer» en vez de «¿está seguro?». Solo se confirma anular cuentas y cerrar jornada |

### Fuera de línea y sincronización

| ID | Requerimiento | Meta |
|---|---|---|
| RNF-10 | Sin señal se puede **abrir cuentas, anotar, anular y cobrar** | Una jornada completa sin conexión |
| RNF-11 | Lo anotado sin señal se envía solo al volver la conexión, sin que nadie haga nada | |
| RNF-12 | Con señal, lo que anota un celular aparece en los demás | En menos de 2 s |
| RNF-13 | **Ninguna anotación se pierde**: ni por cerrar la app, ni por apagar el celular, ni por reintentos | Cero pérdidas |
| RNF-14 | **Ninguna anotación se duplica** por reintentos de red | Cero duplicados |
| RNF-15 | Siempre visible el estado: en línea, sin conexión y cuántas anotaciones esperan enviarse | |
| RNF-16 | Antes de cerrar sesión o revocar un celular con anotaciones pendientes, se avisa y se bloquea hasta enviarlas | |

### Uso

| ID | Requerimiento |
|---|---|
| RNF-20 | Usable **con una mano**, con el pulgar. Botones principales de al menos 56 px de alto |
| RNF-21 | **Legible al sol** y de noche bajo luz amarilla: contraste mínimo 7:1 en totales y botones |
| RNF-22 | Español de Colombia, textos cortos, sin palabras técnicas («sincronizar» no aparece: se dice «enviando» o «todo al día») |
| RNF-23 | Funciona en Android con Chrome desde la versión 8 de Android, y en iPhone con iOS 16.4 o posterior |
| RNF-24 | Instalable en la pantalla de inicio (PWA) |
| RNF-25 | Capacitación de media hora como máximo |

### Técnicos

| ID | Requerimiento |
|---|---|
| RNF-30 | Precios en **enteros de pesos**, nunca decimales |
| RNF-31 | El total autoritativo lo calcula el servidor; el cliente usa **la misma función** para mostrarlo al instante |
| RNF-32 | Las líneas guardan copia del nombre y el precio con que se anotaron |
| RNF-33 | Paquete inicial de la app menor a 200 KB comprimido |
| RNF-34 | Respaldo diario fuera del sistema principal, conservado al menos 90 días |
| RNF-35 | Costo de operación: $ 0 dentro de las cuotas gratuitas |
| RNF-36 | Hora de Colombia (`America/Bogota`) en todo lo que se muestra y en el corte de jornada |
