# 16 · Estado al 2026-11-15 y siguiente etapa

Punto de partida para la próxima sesión de trabajo. Resume qué hay en producción, qué
deuda técnica quedó, y plantea la siguiente etapa: **pedidos de los clientes por QR y
NFC, notificaciones push, rendimiento y escala, robustez y conectividad**. Las cifras del
negocio (ventas, cuentas, personas) no van aquí: están en `negocio/docs/` (regla 16).

## 1 · Qué hay en producción

Todo esto corre en producción, probado (Vitest y Playwright) y documentado:

| Tema | Qué hace | Dónde está escrito |
|---|---|---|
| Núcleo | Cuentas de grupo, persona, mesa y cancha; pedidas y chicos; repetir; petacos; «Otro»; precio de cancha; cobro con sugerencias de billetes y cambio; mostrar al cliente; el día con cierre de caja, días anteriores y CSV | 01, 02, 05 |
| Sin señal y tiempo real | Registro de operaciones, IndexedDB, WebSocket con respaldo HTTP, novedades desde `seq`, proyección por cuenta | 04, ADR-11, ADR-13 |
| Acceso | Celular vinculado con código, PIN por persona, roles, auditoría | ADR-10, ADR-14 |
| Abonos | Pagar productos, una pedida o un valor; **dividir entre N** contando quién ya pagó (se recuerda entre pagos); quién pagó, editable; deshacer un abono | 04 «Abonos» |
| Comida y áreas | Una cuenta, un saldo, dos cajas (barra y cocina); panel de comida con platos y notas; áreas por persona y por día; comida ve todo pero solo cambia lo suyo | 14, ADR-15 |
| Despacho | Bebidas pedidas desde comida y **pedido rápido a la barra** con detalles; aviso con timbre configurable (insistente hasta despachar), pantalla despierta, cancelar pedido | 02, 14 |
| Juntar cuentas | Sumar una cuenta a otra (con sus abonos), separar; a una cancha llega como adicional | 04 «Juntar cuentas» |
| Canchas | Chico o adicional al anotar y después; repetir trae el último chico | 02 |
| Editar pedidas | Agregar productos a una pedida ya anotada y cambiar un producto por otro, como edición en la auditoría (2026-11-15) | 04 «Editar una pedida» |
| Deudas | Pasar a deuda (todo, pedidas o valor); deudas a mano; pagos aparte de la caja; detalle completo de lo fiado; permiso «Administra deudas» | 15, ADR-16 |
| Pantalla | Ocultar lo del otro panel; pestañas Comida/Bebidas; totales a la vista; pedidas anuladas plegadas; todo a la vista en celular, celular girado y tablet | 02 |

Pruebas al 2026-11-14: **167 de Vitest** (dominio y Worker real) y **65 de Playwright**.

## 2 · Deuda técnica y cosas por saber

Lo que conviene saber antes de tocar el código. En orden de importancia.

1. **Una operación recién emitida puede perderse si la app se recarga en el mismo
   instante.** `sinc.emitir` la muestra y la guarda en IndexedDB de forma asíncrona; si la
   página se recarga antes de que termine la escritura (milisegundos), no queda. En el
   uso normal no pasa (nadie recarga tan rápido), pero choca con la regla 3. Arreglo
   posible: escribirla primero, de forma síncrona, en `localStorage` como respaldo y
   quitarla al confirmarse en IndexedDB.
2. **Las deudas viajan enteras.** `Estado.deudas` va completo en la foto, en `cambios` y
   en la proyección (clave `deudas`, reescrita en cada operación que la toca). Con pocos
   deudores no importa; con cientos de movimientos crece cada mensaje. Si crece: tabla
   `deudas` propia en el Durable Object y mandar solo el deudor que cambió.
3. **El paquete del navegador pesa 466 KB (140 KB comprimido)** en un solo archivo. Las
   pantallas del administrador, Deudas, Auditoría y Días anteriores se pueden cargar
   aparte (`React.lazy`) para que abrir la app en un celular viejo sea más rápido.
4. **Las pruebas del servidor necesitan la carpeta `dist`** (`wrangler` exige
   `assets.directory`). En un clon nuevo o después de reinstalar: `pnpm build` antes de
   `pnpm verificar`.
5. **Pruebas intermitentes conocidas.** El servidor local de las pruebas del Worker a
   veces no arranca o pierde la conexión (`retry: 1` en `vite.config.ts`); y las e2e
   comparten un servidor, así que una prueba que deja cuentas abiertas puede cambiarle las
   medidas a `espacio-movil`. Si una falla, repetirla sola antes de buscar el error.
6. **`GET /api/cuentas?ids=`** devuelve cualquier cuenta a cualquier sesión válida. Está
   bien para el personal; **no** debe quedar expuesta a los clientes cuando haya QR.
7. **El sonido del aviso necesita un toque previo** (lo exige el navegador) y no suena
   con la pantalla apagada o la app cerrada: eso lo resuelven las notificaciones push.
8. Archivos `*.tmp.mjs` sueltos en la raíz: borradores de sesiones anteriores, ignorados
   por git. Se pueden borrar.

## 3 · Siguiente etapa

### 3.1 · Notificaciones push

**Para qué:** que el aviso de despacho (y después los pedidos por QR) llegue con la app
cerrada o la pantalla apagada. Era el paso 5 de [14](14-comida-y-areas.md).

- **Web Push** estándar con llaves VAPID: el Worker firma y envía (sin servicios de
  terceros; hay librerías para Workers o se firma con WebCrypto). La llave privada va en
  `wrangler secret`; la pública en el cliente.
- **Suscripciones** por aparato y persona en una tabla del Durable Object
  (`suscripciones (dispositivo, persona, endpoint, llaves, creada)`), creadas desde el
  menú («Recibir avisos en este aparato»), y borradas si el servicio responde 404/410.
- **Disparadores:** una operación aceptada con bebidas `porDespachar` → push a quienes
  tienen barra hoy; después, pedidos por QR. Nunca datos sensibles en el texto.
- El Service Worker propio ya existe: se le agrega `push` y `notificationclick` (abre la
  pestaña «Despachar»).
- **Límites:** en iPhone solo con la app instalada (iOS 16.4 o más); en Android, Chrome
  la muestra aunque la app esté cerrada. El permiso se pide con un toque, nunca al abrir.
- Pruebas: Playwright no recibe push de verdad; probar la firma y el envío en el Worker
  (con un servidor de push falso) y el `notificationclick` con un evento simulado.

### 3.2 · Pedidos de los clientes por QR y NFC

**Para qué:** que el cliente pida desde su celular sin ir a la barra, y que llegue al
personal como los pedidos de comida a la barra.

Propuesta (para validar con el negocio, ver §4):

- **Un código por mesa o cancha**, con un token firmado que no se pueda adivinar
  (`/p/<token>`), rotable desde el administrador si alguien lo copia. El mismo enlace va
  en un QR impreso y en una **etiqueta NFC** (NTAG213/215); leer NFC no necesita app,
  escribir las etiquetas se hace desde Android (Web NFC) o con una app de NFC.
- **Página pública liviana**, separada de la app del personal: la carta (productos
  activos con precio, sin costos ni nada interno), un carrito y «Pedir». Sin PIN, sin
  datos personales; opcionalmente un nombre («los de rojo»).
- **El pedido no entra directo a la cuenta**: llega como **solicitud** que alguien del
  personal acepta (y ahí se convierte en `anotar` en la cuenta de esa mesa, con su
  `porDespachar`) o rechaza. Así un QR copiado o una broma no cargan nada a nadie
  (reglas 3, 4 y 8). Operaciones nuevas: `solicitud`, `aceptar_solicitud`,
  `rechazar_solicitud`, con sus pruebas y en `esquema.ts` y 05.
- **Seguridad:** límite de pedidos por token y por minuto en el Worker, solo en horario,
  tope de valor por pedido, y la ruta pública no ve nada más que la carta y el estado de
  sus propias solicitudes («recibido», «en camino»). Nada de `/api/cuentas` ni de la foto.
- **Avisos:** la solicitud suena como el despacho (y por push cuando exista §3.1).
- Ver también la cuenta («¿cuánto llevamos?») desde el QR es posible después, con cuidado:
  muestra lo de esa mesa a cualquiera que tenga el código.

### 3.3 · Rendimiento y escala

- Cargar aparte las pantallas pesadas (§2, punto 3) y medir el arranque en el celular
  más viejo del negocio (meta de RNF-04: menos de 1 s con la app instalada).
- Tabla propia para deudas (§2, punto 2) y, si el registro crece mucho, paginar los días
  anteriores y la auditoría (ya tienen índice por hora).
- Revisar el tamaño de la foto y de `cambios`: hoy la foto lleva lo vigente (36 h);
  medirla con un día fuerte real.
- Un solo Durable Object por negocio basta de sobra para el volumen de un local; escalar a
  varios negocios sería un Durable Object por negocio (ya está así por `BASE`).

### 3.4 · Robustez y conectividad

- Arreglar la pérdida en recarga instantánea (§2, punto 1), con prueba e2e.
- Estabilizar las pruebas intermitentes (§2, punto 5): limpiar las cuentas al final de
  cada e2e o darle a `espacio-movil` su propia base.
- Avisar de una versión nueva del Service Worker sin recargar a la fuerza con
  pendientes (hoy se actualiza al recargar).
- **Integración continua:** hoy no hay ningún flujo de GitHub Actions; las pruebas solo
  corren en el Mac. Un flujo con `pnpm build`, `pnpm verificar` y `pnpm test:e2e` en cada
  push (con el catálogo de ejemplo, sin `negocio/`) atraparía errores antes de desplegar.
- Observabilidad: alertas si el Worker empieza a rechazar operaciones o a fallar
  (Workers Logs / Analytics) y un aviso al administrador.
- Respaldo semanal por correo en producción (listo, desactivado por decisión del negocio
  el 2026-11-08) y ensayo de restauración trimestral (`pnpm ensayo-restauracion`; el
  próximo hacia febrero de 2027).

### 3.5 · Pendientes de producto ya conocidos

- Cola de cocina «Por preparar» con las notas y «Listo» ([14](14-comida-y-areas.md) §5).
- Reportes por semana y mes (RF-54) e inventario (RF-55), en [07](07-roadmap.md) fase 3.
- Nombres frecuentes al escribir (RF-08) y «¿quién paga este chico?» (RF-19).

## 4 · Preguntas para el negocio antes de los QR

1. ¿Los clientes solo piden, o también quieren ver cuánto llevan?
2. ¿Quién acepta las solicitudes: la barra, comida, o el área según lo pedido?
3. ¿Se puede pedir comida por QR, o solo bebidas?
4. ¿Un código por mesa y por cancha, o también uno general en la barra?
5. ¿En qué horario se aceptan pedidos por QR?

## 5 · Orden propuesto

1. **Robustez primero** (§3.4, puntos de la pérdida en recarga y las pruebas): es la base
   para todo lo demás.
2. **Notificaciones push** (§3.1): sirven ya para el despacho y luego para los QR.
3. **Rendimiento** (§3.3): cargar aparte y medir.
4. **QR y NFC** (§3.2), después de responder §4. Es lo más grande: abre una puerta pública.

Cada paso con sus pruebas, ensayado en pruebas y revisado en los aparatos antes de
producción, con foto antes y después (reglas de [12](12-plan-de-trabajo.md)).

## Para iniciar la próxima sesión

Abrir Claude Code en `Documents/Dev/Apps/BarraGorgojo` y pegar:

> Vamos a seguir con la Barra del Gorgojo. Lee `AGENTS.md`, `docs/16-siguiente-etapa.md`
> y las «Reglas para trabajar en producción» de `docs/12-plan-de-trabajo.md`. Producción
> tiene datos reales: no probar ahí, usar el entorno de pruebas. Pregúntame antes de cada
> despliegue a producción. Empecemos por el orden de 16 §5.

Comandos útiles:

```bash
pnpm install && pnpm build   # en un clon nuevo: build antes de las pruebas del Worker
pnpm verificar               # tipos + Vitest (dominio y Worker real)
pnpm test:e2e                # Playwright (la primera vez: pnpm exec playwright install chromium)
pnpm desplegar:pruebas       # entorno de pruebas
node scripts/admin.mjs .dev.vars.produccion foto migracion/<nombre>.json   # foto antes y después
pnpm desplegar               # producción, solo con permiso
```
