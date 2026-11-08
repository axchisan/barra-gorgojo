# 14 · Comida y barra en una sola app: áreas, panel de comida y despacho (2026-11-08)

**Estado:** pasos 1 a 4 construidos (ADR-15). Pendiente el paso 5 (push y cola de cocina).

Pedido del negocio: que el área de comida anote como la barra (rápido, con botones), que
desde comida se puedan pedir bebidas y la barra reciba el aviso para despacharlas, que la
barra vea lo que pasa en comida, y que los pagos de las dos áreas convivan **sin
duplicarse nunca**. Quién tiene qué área está en `negocio/docs/12-areas.md` (privado).

## Principio: una cuenta, un saldo

Hoy una mesa tiene su cuenta de bebidas en la barra y, si se «pasa a comida», la cocina
la cobra aparte. Con las dos áreas en la app, **la cuenta es una sola** (mesa, persona o
grupo) y tiene líneas de barra y líneas de comida. Un solo saldo = no hay forma de cobrar
dos veces lo mismo: el servidor ya rechaza un cobro sin saldo y los abonos nunca pasan del
saldo. Cada pago guarda **quién y desde qué área** lo cobró, para el cuadre de cada caja.

«Pasar a comida» sigue funcionando para lo ya registrado (regla 4), pero deja de hacer
falta: la cocina cobra la cuenta completa (comida y bebidas) en su caja.

## Piezas

### 1 · Personas con áreas y permisos por día

- Cada persona tiene un **rol** (administrador u operador) y unas **áreas**: barra,
  comida o las dos. El administrador ve y hace todo.
- El administrador puede dar un área **por días** («esta persona en barra el sábado»):
  tabla `accesos_dia (persona, area, fecha)`. Áreas de hoy = las fijas + las del día.
- Se edita en «Personas y celulares». El servidor revisa el área en cada operación, no
  solo esconde botones (como en la fase D).
- La pantalla principal depende del área: quien es de comida entra al panel de comida;
  quien tiene las dos ve las dos pestañas, con comida primero si así se configura.

### 2 · Productos de comida

- Categoría nueva **comida** en el catálogo (se crean desde «Productos y precios», como
  hoy). Los precios iniciales los da el negocio (en `negocio/docs/08`).
- **Notas por producto** («solo carne», «más yuca»): campo `nota` en la línea (RF-17),
  con notas rápidas por producto y texto libre. Salen en la cocina, en el detalle y en el
  CSV.
- Las líneas de comida cuentan como comida en «El día» (ya existe `comida` en la línea).

### 3 · Panel de comida

- Igual que «Anotar» de la barra: botones grandes de los platos, cantidad con toques,
  nota rápida, y la cuenta (mesa, persona o grupo; se abre ahí mismo).
- También muestra las **bebidas**: lo que se anota desde comida queda **por despachar**.
- Cobrar desde comida usa la misma pantalla de cobro (todo, productos, valor, abonos).

### 4 · Bebidas pedidas desde comida → despacho en la barra

- Cada línea de bebida anotada desde comida queda «por despachar» (`despacho`
  pendiente). Operación nueva `despachar { cuenta, lineas }` cuando la barra la entrega.
- En la barra (y para el administrador): **aviso inmediato** que se queda hasta
  despacharlo, con sonido y vibración, y una lista «Por despachar» (mesa o persona, qué,
  quién lo pidió, hace cuánto). Funciona con la app abierta (la tablet de la barra lo está).
- Avisos con la app cerrada (notificaciones push del celular): segunda etapa; requiere
  permiso de notificaciones en cada celular.

### 5 · Lo que ve cada área

- La barra tiene una pestaña **Comida**: cuentas con comida abiertas, qué se pidió y si
  incluye cerveza (filtro «con cerveza»).
- Comida ve las cuentas de su área y lo que la barra despachó a sus mesas.
- (Opcional) **Cola de cocina** «Por preparar» con las notas, y «Listo».

### 6 · Pagos y cajas

- Cada pago guarda el área desde donde se cobró. «El día» y el cierre separan **caja de
  barra** y **caja de cocina** (efectivo esperado de cada una), y el total del negocio.
- Doble cobro: igual que hoy, imposible (un saldo, rechazo si no queda nada).

## Compatibilidad

Todo con operaciones nuevas o campos opcionales: el registro de hoy da el mismo estado
(reglas 0 y 4). Cambia la regla 9 de `AGENTS.md` (mesas «cobrada aquí» o «pasada a
comida»): se registra como ADR al construirlo.

## Orden propuesto

1. Áreas y permisos por persona (y por día), el administrador adicional.
2. Categoría comida, notas por producto, panel de comida.
3. Bebidas desde comida → «Por despachar» en la barra con aviso.
4. Pestaña Comida en la barra; cajas por área en «El día» y el cierre.
5. Notificaciones push y cola de cocina, si se quieren.

Cada paso con sus pruebas, ensayado en pruebas y revisado en los aparatos antes de
producción (que ya tiene datos reales).
