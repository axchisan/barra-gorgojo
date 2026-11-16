# 03 · Arquitectura

## Principio rector

**El celular es la fuente inmediata de verdad; el servidor es la fuente final.**

Todo lo que se anota se guarda primero en el propio celular y se muestra al instante.
Después viaja a un servidor que lo ordena, lo valida, calcula los totales oficiales y lo
reparte a los demás celulares. Si no hay señal, el celular sigue funcionando con lo que
tiene y envía lo pendiente cuando vuelva.

Ese principio sale de dos requerimientos que no se pueden negociar: la interfaz nunca
espera la red (RNF-03) y ninguna anotación se pierde (RNF-13).

## Vista general

```
   Celular de la barra      Celular de mesas       Celular de los dueños
  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
  │ PWA (React)      │    │ PWA (React)      │    │ PWA (React)      │
  │ ─ IndexedDB      │    │ ─ IndexedDB      │    │ ─ IndexedDB      │
  │   estado local   │    │   estado local   │    │   estado local   │
  │   pendientes     │    │   pendientes     │    │   pendientes     │
  │ ─ Service Worker │    │ ─ Service Worker │    │ ─ Service Worker │
  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
           │ WebSocket (o HTTP de respaldo)                │
           └───────────────────────┼───────────────────────┘
                                   ▼
                  ┌────────────────────────────────┐
                  │ Cloudflare Worker              │
                  │ ─ sirve la PWA (archivos)      │
                  │ ─ entrada, vinculación, API    │
                  └───────────────┬────────────────┘
                                  ▼
                  ┌────────────────────────────────┐
                  │ Durable Object «Barra»         │
                  │ ─ SQLite propio                │
                  │ ─ ordena operaciones (seq)     │
                  │ ─ aplica reglas y totales      │
                  │ ─ reparte a los conectados     │
                  └───────────────┬────────────────┘
                                  │ una vez al día (Cron)
                                  ▼
                  ┌────────────────────────────────┐
                  │ Cloudflare R2                  │
                  │ respaldos en JSON              │
                  └────────────────────────────────┘
```

Una sola pieza de servidor, un solo despliegue, cero servidores que mantener.

## Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** estricto | El mismo de todos los proyectos. Y aquí además permite **compartir el código de reglas** entre celular y servidor |
| Interfaz | **React 19** + **Vite** | App de una sola página detrás de una entrada, sin SEO. Ver ADR-02 |
| Estilos | ~~Tailwind CSS 4~~ **CSS propio** (`estilos.css`) con variables de la marca | Ver ADR-12 |
| Almacenamiento local | **IndexedDB** con **Dexie** | Guarda estado y pendientes; sobrevive a cerrar la app y apagar el celular. Sin `liveQuery`: ver ADR-11 |
| PWA | Service Worker propio (`public/sw.js`, sin Workbox), con tiempo límite de 1,5 s a la red | La app abre sin señal y con la red colgada. Ver ADR-12 |
| Servidor | **Cloudflare Workers** | Sin servidor que administrar, plan gratuito amplio, cuenta ya configurada |
| Estado compartido | **Durable Objects con SQLite** | Un único punto que ordena todo lo que pasa en la barra, con WebSockets y base propia. Ver ADR-01 |
| Tiempo real | **WebSocket con hibernación** | Empuja los cambios al instante y no cobra mientras nadie anota |
| Validación | **Zod solo en el Worker** (`src/servidor/esquema.ts`); el dominio además limpia en `aplicar` | El celular no carga la librería. Ver ADR-12 y [13](13-revision-tecnica.md) |
| Respaldos | **Cloudflare R2** | Sin costo de salida, ya usado en el sitio |
| Pruebas | **Vitest** (el Worker real con `unstable_startWorker` de Wrangler) y **Playwright** | Playwright simula pérdida de red y varios celulares a la vez. Ver ADR-09 |
| Paquetes | **pnpm 11** | |

## El núcleo: reglas compartidas

La pieza más importante del código no es ni la interfaz ni el servidor. Es una **función
pura** que recibe el estado y una operación, y devuelve el estado nuevo:

```ts
// `aplicar` en src/dominio/estado.ts — se ejecuta igual en el celular y en el Durable Object
export function aplicar(estado: Estado, op: Operacion): Estado
```

- En el **celular**, se aplica para mostrar al instante lo que se acaba de tocar, encima
  de lo ya confirmado.
- En el **servidor**, se aplica para producir el estado oficial.

Como es **la misma función**, el total que ve quien atiende es el mismo que calcula el
servidor (RNF-31). Si alguna vez difieren —por ejemplo, porque el precio cambió mientras
el celular estaba sin señal— gana el servidor y la pantalla se corrige sola.

El detalle de operaciones y conflictos está en [04](04-sincronizacion-y-fuera-de-linea.md).

## Estructura de carpetas

```
BarraGorgojo/
├── docs/
├── src/
│   ├── dominio/                # compartido: celular y servidor. Sin dependencias de entorno
│   │   ├── operaciones.ts      # tipos y esquemas Zod de cada operación
│   │   ├── aplicar.ts          # la función pura de reglas
│   │   ├── totales.ts          # sumas, saldos, cambio
│   │   ├── precios.ts          # precio vigente a una hora dada
│   │   └── formato.ts          # $ 42.500, horas en America/Bogota
│   ├── app/                    # la PWA
│   │   ├── pantallas/          # cuentas, anotar, detalle, cobrar, cocina, dia, entrada
│   │   ├── componentes/
│   │   ├── local/              # Dexie: tablas, pendientes, proyección
│   │   ├── sincronizacion/     # conexión, reintentos, cola
│   │   └── estilos/
│   └── servidor/
│       ├── worker.ts           # punto de entrada: rutas, archivos, cron
│       ├── barra.ts            # clase del Durable Object
│       ├── bd/                 # esquema SQLite y migraciones
│       ├── acceso.ts           # vinculación, PIN, sesiones
│       └── respaldo.ts         # exportación diaria a R2
├── tests/
│   ├── unit/                   # dominio: reglas, totales, conflictos
│   ├── servidor/               # Durable Object en el entorno de Workers
│   └── e2e/                    # varios celulares, sin red, reconexión
├── wrangler.jsonc
└── vite.config.ts
```

**Así está hoy** (2026-11-03, después de F y E2); las diferencias con el plan de arriba
están en ADR-12:

```
src/
├── dominio/            # sin dependencias de navegador ni de Workers
│   ├── estado.ts       # tipos, operaciones y `aplicar`: la única función de reglas
│   ├── catalogo.ts     # tipos y reglas fijas; el catálogo base viene de #negocio
│   ├── jornada.ts      # resumen del día y CSV (E1)
│   ├── pago.ts         # billetes y sugerencias de con cuánto pagan (F1, F2)
│   ├── areas.ts        # barra y comida (docs/14, ADR-15)
│   ├── deudas.ts       # deudores, saldo, comida y pagos de deudas (docs/15, ADR-16)
│   ├── auditoria.ts    # cada operación en una frase (E4)
│   ├── base.ts · formato.ts
├── app/
│   ├── App.tsx         # solo sesión y qué pantalla se ve
│   ├── navegacion.ts   # cada pantalla es una entrada del historial; «atrás» cierra hojas
│   ├── avisos.tsx      # avisos arriba, con «Deshacer»; los rechazos se quedan
│   ├── memoria.ts      # IndexedDB con Dexie; trae lo de localStorage (0.1)
│   ├── sincronizacion.ts # cola, WebSocket con respaldo HTTP, una conexión por celular
│   ├── paquetes.ts · cuentas.ts · colores.ts · teclado.ts · ajustarNombres.ts · vibrar.ts
│   ├── push.ts         # avisos con la app cerrada: permiso, suscripción, prueba (ADR-19)
│   ├── pantallas/      # Entrada, Inicio, Anotar, Detalle, Cobrar, Cocina, ElDia, Dias (y DiaPasado),
│   │                   # Productos, EditarProducto, Platos, Personas (y MiPin), Auditoria,
│   │                   # Deudas (y DeudorDetalle)
│   └── componentes/    # TarjetaCuenta, TarjetasProducto, EditarLinea, Desglose, VistaCliente,
│                       # HojaLibre (mecato y «Otro»), HojaMixto, HojaNota (notas y plato de
│                       # otro valor), Despacho (aviso, sonido, «Despachar», cancelar),
│                       # TecladoPin, Apartados, EstadoConexion, NoExiste, AvisosPush,
│                       # CuentaPasada (una cuenta de otro día, solo para leer)
└── servidor/
    ├── worker.ts       # Worker (rutas, archivos, Cron a R2) y Durable Object `Barra`
    ├── esquema.ts      # forma de cada operación (Zod, solo en el Worker)
    ├── push.ts         # notificaciones push: cifrado, VAPID y suscripciones (ADR-19)
    └── acceso.ts       # personas, áreas, permisos, celulares, códigos, PIN y sesiones (ADR-10)
public/sw.js            # Service Worker propio: la app abre sin señal
negocio.ejemplo/        # catálogo de ejemplo (el real, en negocio/, privado)
scripts/                # preparar, recorrido, resumen-estado, migrar, admin, servidor-e2e
tests/                  # dominio (Vitest), servidor/ (Worker real, ADR-09), e2e/ (Playwright)
```

## Acceso y seguridad

El problema de seguridad aquí no es un atacante sofisticado: es **que cualquiera con el
enlace entre a anotar o cobrar**, y que alguien del equipo diga «yo no anulé eso». El
diseño cubre las dos cosas sin hacer lenta la entrada.

### Dos llaves

1. **El celular debe estar vinculado.** La primera vez, un administrador genera desde su
   sesión un código de 6 dígitos válido por 10 minutos; se escribe en el celular nuevo y
   el servidor le entrega un **token de dispositivo** largo y aleatorio, guardado en una
   cookie `HttpOnly`, `Secure`, `SameSite=Strict`. En la base solo se guarda su hash.
2. **La persona se identifica con PIN.** En un celular vinculado, se escoge el nombre y
   se escribe un PIN de 4 dígitos. El PIN es corto a propósito: sin la primera llave no
   sirve de nada.

Un PIN de 4 dígitos solo sería débil sin la vinculación del celular, y la vinculación
sola no diría quién anotó. Juntas son rápidas y suficientes.

### Reglas

- **PIN cifrado** (AES-GCM de Web Crypto con el secreto `PINES`), no con hash, porque el
  negocio quiere que el administrador pueda verlo: ver ADR-10. Bloqueo de 5 minutos tras
  5 intentos fallidos por persona y dispositivo.
- La sesión de persona vive en el celular y viaja en cada operación; el servidor
  **verifica en cada operación** que el dispositivo no esté revocado y que la persona
  esté activa y tenga el rol que exige esa operación. Ocultar un botón no es seguridad.
- **Fuera de línea** se sigue anotando con la sesión abierta, pero **entrar o cambiar de
  persona necesita señal**: el PIN se revisa en el servidor (ADR-10). La sesión dura 60
  días, así que en la práctica solo se entra al llegar o al cambiar de persona.
- Lo que el rol no permite se **rechaza con su motivo**: queda en la tabla `rechazadas`,
  vuelve al celular, que lo saca de la cola y lo avisa en pantalla (regla 8), y el
  administrador lo ve en «Personas y celulares».
- Revocar un dispositivo corta su WebSocket al instante y rechaza su token en adelante.
- Cabeceras: CSP estricta, sin scripts de terceros. La app no carga nada de fuera.
- Ninguna clave en el repositorio: secretos con `wrangler secret`.

### Roles

Hoy hay **un solo administrador** (el desarrollador). Las demás personas del negocio son
operadores.

| Acción | Operador | Administrador |
|---|---|---|
| Abrir cuentas, anotar, repetir, cobrar, pasar a comida | ✅ | ✅ |
| Anular un producto de una cuenta **abierta** | ✅ | ✅ |
| Marcar agotado | ✅ | ✅ |
| Anular una cuenta con pedidas, reabrir una cobrada | | ✅ |
| Cerrar jornada | ✅ | ✅ |
| Precios, catálogo, personas, dispositivos | | ✅ |

## Decisiones de arquitectura

### ADR-01 · Durable Object como centro de la barra, no Postgres en Neon

**Contexto.** El stack habitual es Next.js + Neon + Vercel, y el sitio del Retén ya
corre así. Pero este sistema tiene un perfil distinto: varios celulares escribiendo a la
vez, durante 14 a 16 horas al día, todos los días, y queriendo ver los cambios de los
otros al instante.

**Problemas de seguir con Neon + Vercel:**

- **Tiempo real.** Vercel no mantiene conexiones abiertas de forma práctica; habría que
  consultar cada pocos segundos desde cada celular.
- **Costo de cómputo.** Consultar cada pocos segundos mantiene la base de Neon despierta
  todo el horario de atención. El plan gratuito limita las horas de cómputo por proyecto,
  y el proyecto del sitio ya consume de esa cuota. Se gastaría con la barra abierta.
- **Ordenar escrituras concurrentes** exigiría transacciones y bloqueos cuidadosos.

**Decisión.** Un **Durable Object** por negocio: una instancia única, con su propia base
SQLite, que recibe todas las operaciones en orden, las aplica y las reparte por
WebSocket. Por diseño hay un solo escritor, así que el orden es trivial. Con la API de
hibernación, mientras nadie anota no consume tiempo de cómputo.

**Consecuencias.** Se sale del stack habitual para esta pieza; a cambio, tiempo real
verdadero y costo cero. Los datos quedan en Cloudflare, no en Neon: para reportes
cruzados con el sitio (fase 4) se exportan, no se comparten tablas.

### ADR-02 · Vite + React, no Next.js

La app vive detrás de una entrada, no necesita SEO ni renderizado en servidor, y su
requisito central es **abrir sin señal desde la pantalla de inicio**. Eso es una app de
una sola página con Service Worker. Next.js agregaría un servidor que aquí no aporta, y
correrlo en Workers exige un adaptador extra. Vite produce archivos estáticos que el
mismo Worker sirve. Se conservan React, TypeScript, Tailwind, Zod y las convenciones en
español.

### ADR-03 · Operaciones inmutables, no edición de registros

Nada se edita ni se borra: se agregan **operaciones** («anotar ronda», «anular línea»,
«cobrar»). El estado de las cuentas es el resultado de aplicarlas en orden. Esto es lo
que hace posible trabajar sin señal y reconciliar después, deja una auditoría completa
gratis («¿quién anuló esa cerveza?») y hace que reintentar un envío sea inofensivo,
porque cada operación lleva un identificador único generado en el celular.

### ADR-04 · WebSocket con HTTP de respaldo

El WebSocket es lo normal: entrega en menos de un segundo. Pero algunas redes móviles o
proxies cortan conexiones largas. Si el WebSocket no logra conectarse, el celular cae a
**HTTP**: envía pendientes con `POST` y pide novedades cada pocos segundos mientras la
app está en primer plano. El protocolo es el mismo; solo cambia el transporte.

### ADR-05 · Aplicación separada del sitio

Decisión del negocio. Además tiene sentido técnico: el sitio es público, estático y
optimizado para SEO; esta app es privada, dinámica y optimizada para trabajar sin
señal. Comparten la marca y las convenciones, no el código ni la base.

### ADR-06 · PIN por persona sobre celular vinculado, sin correo ni contraseña

Las cuentas del sitio usan correo y contraseña (Better Auth), que es lo correcto para un
panel que se usa de vez en cuando. En la barra se cambia de persona varias veces en una
noche, con las manos ocupadas: escribir un correo no es viable. Ver «Acceso y
seguridad».

### ADR-07 · Un solo Durable Object para todo el negocio

Una sola barra no necesita repartir carga: un Durable Object aguanta cientos de
operaciones por segundo, y en el peor día la barra hace unas pocas por minuto. Tener uno
solo hace que todos los celulares vean exactamente el mismo orden de los hechos. Si
algún día hubiera una segunda sede, sería un segundo objeto con otro nombre, sin cambiar
código.

### ADR-08 · Repositorio público, datos del negocio aparte (2026-11-02)

El código es público para que sirva a otros negocios como registro de barra
personalizable. Nada del negocio vive en él: el catálogo base y las personas se importan
como `#negocio` (`imports` de `package.json`) desde `negocio/catalogo.ts`, que es un
repositorio privado aparte clonado en esa carpeta e ignorado por git. El público lleva
un catálogo de ejemplo inventado en `negocio.ejemplo/`, que es también el catálogo fijo
de todas las pruebas, y `pnpm preparar` lo copia a `negocio/` en un clon nuevo.

El catálogo base del código es solo una **semilla** para una base nueva. El Durable
Object rearma el estado aplicando el registro con ese catálogo (regla 0), así que una
base escrita con él lo necesita igual para siempre. Por eso la migración a base limpia
(fase B de [12](12-plan-de-trabajo.md)) metió **todo** el catálogo en el registro como
operaciones `producto` y `orden`: desde el 2026-11-02 el catálogo base de producción
está vacío, el paquete del navegador no lleva productos ni precios del negocio y el
celular los recibe en la foto, después de entrar. Mecato y «Otro» son de valor libre por
su id (`ESPECIALES` en `src/dominio/catalogo.ts`), no por el catálogo base. Con la fase D
las personas también salen del código.

### ADR-10 · Acceso por persona: celular vinculado + PIN cifrado (2026-11-02)

Implementación de «Acceso y seguridad» (fase D de [12](12-plan-de-trabajo.md)), con tres
decisiones del negocio:

- **El administrador puede ver los PIN.** Por eso se guardan cifrados con AES-GCM (llave
  derivada del secreto `PINES`) y no con hash de una vía. Es aceptable porque sin un
  celular vinculado el PIN no sirve, y el cifrado protege los respaldos de la base.
  Cada persona puede cambiar el suyo con el actual; el administrador puede cambiarlo o
  quitarlo (quien no tiene PIN lo crea al entrar).
- **Vincular** es con un código de 6 dígitos que genera el administrador (vale 10 minutos
  y una vez); el celular recibe una cookie `HttpOnly`, `Secure`, `SameSite=Strict` y en la
  base queda solo su hash. Más de 10 códigos equivocados en 10 minutos apagan la
  vinculación ese rato. La antigua clave del negocio (`CLAVE`) queda como **llave de
  instalación**: solo sirve desde la terminal para sacar un código
  (`POST /api/instalacion/codigo` con `x-llave`), para el primer celular.
- **«Apoyo»** es una persona más, con un PIN que se comparte con quien ayude ese día.

Las personas viven en el Durable Object (tablas `personas`, `dispositivos`, `codigos`,
`intentos`); `PERSONAS` de `negocio/catalogo.ts` es solo la semilla de una base nueva.
Permisos en el servidor (`permiso()` en `worker.ts`): catálogo y orden, anular una cuenta
con productos (con motivo) y reabrir una cobrada o anulada son del administrador; quien
cobró o anuló puede deshacerlo («Deshacer») durante 5 minutos. Quitar un celular o
desactivar a una persona avisa y corta su WebSocket al instante. Pruebas:
`tests/servidor/acceso.test.ts` y `tests/e2e/acceso.spec.ts`.

### ADR-09 · Pruebas del servidor con `unstable_startWorker`, no `vitest-pool-workers` (2026-11-02)

El plan era `@cloudflare/vitest-pool-workers`, pero su versión vigente (0.23) exige
Vitest 4 y el proyecto usa Vitest 5. En su lugar, `tests/servidor/arrancar.ts` levanta el
Worker real con `unstable_startWorker` de Wrangler (workerd, Durable Object con SQLite,
en memoria o en una carpeta temporal) y las pruebas le hablan por HTTP y WebSocket, como
un celular. Ventaja: prueba el protocolo de verdad y permite reiniciar el objeto con
otro catálogo para comprobar que recalcular el registro no cambia lo anotado. Costo:
no se puede leer el SQLite por dentro ni mover el reloj del servidor (lo de «más de 36
horas» se prueba en el dominio). Revisar cuando `vitest-pool-workers` soporte Vitest 5;
la API `unstable_` puede cambiar al actualizar Wrangler.

### ADR-11 · Memoria en IndexedDB sin `liveQuery`; una pestaña con la conexión (2026-11-03)

E2 cambió `localStorage` por IndexedDB con Dexie, como estaba previsto, pero no usa
`liveQuery`: el sincronizador ya tiene en memoria lo confirmado y la cola y avisa a React
con `useSyncExternalStore`; IndexedDB es solo dónde queda guardado. La pantalla se
actualiza al instante y la escritura va en paralelo (milisegundos); el envío espera a que
esté guardada. Entre pestañas, un `BroadcastChannel` avisa que la memoria cambió y cada
una la relee, sin deshacer lo que ella misma aún no guardó. La conexión la tiene la
pestaña con el candado de Web Locks; sin Web Locks, cada pestaña se conecta como antes (el
servidor es idempotente por `id`). La migración desde `localStorage` se hace cada vez que
aparezca algo ahí, no una sola vez, porque una pestaña con la versión 0.1 puede seguir
abierta; por eso `bg.base` se queda. Probado en la tablet y el celular reales: migraron
sus colas de `localStorage` (6 anotaciones sin enviar en el celular) y llegaron una vez.

### ADR-12 · Atajos de la versión 0.1: los que se quitaron y los que se quedan (2026-11-03)

La 0.1 salió con atajos ([07](07-roadmap.md) «Versión 0.1»). Después de las fases A a F y
E2, así quedan.

**Se quitaron:**

| Atajo | Cómo se quitó |
|---|---|
| Una clave del negocio para entrar | Celular vinculado y PIN por persona (fase D, ADR-10) |
| Memoria en `localStorage` | IndexedDB con Dexie y una conexión por celular (E2, ADR-11) |
| Catálogo y personas en el código | Catálogo en el registro (B9, ADR-08); personas en el Durable Object (fase D) |
| Cuadre sin guardar | Cierre del día como operación, días anteriores y CSV (E1) |
| Sin respaldo propio | Cron diario a R2 con el registro completo, 365 días (B8) |
| Sin pruebas de extremo a extremo | Playwright: varios celulares, sin señal, tamaños reales, pestañas (A4, C, F, E2) |

**Se quedan, a propósito:**

| Atajo | Por qué | Hasta cuándo |
|---|---|---|
| ~~El estado se recalcula del registro al despertar~~ | Quitado el 2026-11-03 con E3: proyección por cuenta (ADR-13) | — |
| ~~Sin Zod~~ | Quitado el 2026-11-03: Zod valida en el Worker cada operación que llega (ver [13](13-revision-tecnica.md), punto 2) | — |
| Sin Tailwind: CSS propio con variables | Ya resuelve vertical, girado, tablet y teclado (fases C y C2) y está probado; migrarlo no da nada al negocio | No se planea |
| Service Worker a mano, sin Workbox | Es corto (`public/sw.js`): abre sin señal, con tiempo límite a la red (punto 1 de [13](13-revision-tecnica.md)) y cada despliegue estrena caché | Si hiciera falta precache fino o sincronización en segundo plano |
| Fuentes del sistema, no Bitter ni Source Sans 3 | Abren sin descargar nada y sin señal; se leen bien al sol | Si el negocio pide la identidad del sitio |
| Ids UUID v4 y nombre de la persona en cada operación | El orden lo da `seq`; el nombre basta para la auditoría de un local | E4 (auditoría) puede pedir el id del celular |
| Sin unir cuentas, cambiar tipo, notas en la pedida ni «agotado» por cualquiera (RF-05, 06, 17, 61) | El negocio no los ha pedido en el uso real | Cuando los pida |

### ADR-13 · Proyección por cuenta en el servidor y «cambios» en cada operación (2026-11-03)

Medido en [13](13-revision-tecnica.md): el Durable Object releía el registro completo cada
vez que despertaba (30 a 40 veces el primer día) y guardaba todo el historial en memoria.
Con un año de registro eso llega al límite gratuito de filas leídas, y al pasarlo la app
falla ese día.

**Decisión.** El servidor guarda, en la misma transacción que cada operación, una
proyección: la cuenta tocada como quedó (una fila JSON por cuenta), los días en que tuvo
movimiento y lo general (catálogo, orden, cierres, `seq`). Al despertar carga lo general y
las cuentas vigentes; una cuenta vieja se trae cuando alguien opera sobre ella, y un
cierre del día trae todas las cuentas de esa fecha, para que el efectivo esperado sea
idéntico a recalcular todo. «Días anteriores» y el CSV leen de la proyección día por día.
La proyección se puede borrar: si no coincide con el registro (`VERSION_PROYECCION` u otro
`seq`), se reconstruye una vez.

**Por qué una fila JSON por cuenta y no tablas de rondas, líneas y pagos** (lo del diseño
original): el dominio ya trabaja con la `Cuenta` entera y `aplicar` es la única función de
reglas (regla 5); partirla en tablas duplicaría las reglas en SQL. Los reportes que hagan
falta (fase 3) se calculan con las mismas funciones del dominio sobre las cuentas del día.

**«Cambios» en cada operación.** Con la foto recortada, el celular no tiene las cuentas
viejas: una operación reenviada sobre una de ellas no se veía hasta la siguiente foto. Ahora
el servidor manda con cada operación cómo quedó lo que tocó, y al reconectar manda solo
las novedades desde el `seq` del celular.

**Regla para quien cambie `aplicar`:** si el cambio hace que lo ya guardado deje de
coincidir con recalcular el registro, subir `VERSION_PROYECCION` en `worker.ts`.

### ADR-14 · Autoría probada con la sesión firmada de quien anotó (2026-11-03)

ADR-10 decía «quién la hizo lo dice la sesión, no el celular»: así nadie puede poner otro
nombre. Pero si Ana anota sin señal y Beto entra al mismo celular antes de que salga, lo
de Ana llegaba a nombre de Beto, y la auditoría (E4) quedaba mal.

**Decisión.** Cada operación lleva, solo en el celular y en el envío, la sesión firmada de
quien la anotó (`firma`, el mismo token que ya guarda el celular). El servidor la
verifica: si es válida y de ese mismo celular, la operación queda a nombre de esa persona
y se guarda `enviadaPor` con quien la envió; la auditoría lo resalta. Si no, queda a nombre
de quien envía, como antes. **Los permisos se revisan siempre con quien envía**, y la
firma no se guarda en el registro ni en los respaldos (ni en la descarga de apartados).
Atribuirle algo a otra persona exige tener su sesión de ese celular, no solo su nombre.


### ADR-15 · Comida y barra en la misma cuenta, con áreas por persona (2026-11-08)

La cocina empieza a anotar en la app (docs/14). Dos cuentas separadas por mesa (una de
barra, otra de comida) abrían la puerta a cobrar dos veces o a no cobrar.

**Decisión.** Una cuenta, un saldo, con líneas de barra y de comida. `anotar`, `cobrar` y
`cerrar_jornada` llevan el `area` desde donde se hicieron; cada pago la guarda y «El día»
cuadra dos cajas (barra y cocina). Las bebidas pedidas desde comida quedan «por
despachar» en el estado hasta una operación `despachar`, y de ahí sale el aviso de la
barra: no depende de que la tablet estuviera prendida. Las personas tienen áreas fijas
(columna `areas`) y accesos por día (`accesos_dia`); el servidor los revisa en cada
operación, y avisa a los celulares conectados cuando cambian. Todo son campos opcionales
y una operación nueva: el registro viejo da el mismo estado (sin subir
`VERSION_PROYECCION`). Cambia la regla 9: «pasar a comida» se conserva para la barra.
Las notificaciones con la app cerrada (push) quedan para después.

### ADR-16 · Deudas en el estado general, con pagos aparte de la caja (2026-11-08)

El negocio fía y necesita llevar quién debe. **Decisión.** Un medio de cobro nuevo,
`deuda`, salda la cuenta sin plata en caja y carga el valor a una persona en
`Estado.deudas` (estado general, como productos y cierres: se guarda en la proyección con
la clave `deudas` y viaja en `cambios`). Los cargos se guardan al aplicarse, no se
calculan de las cuentas, porque el celular recorta las cuentas viejas. Los pagos de
deudas se registran en la deuda y no entran al efectivo esperado del cierre (lo pidió el
negocio: lo fiado es venta del día en que se fió). Todo es campo opcional u operación
nueva: el registro viejo da el mismo estado. Ver docs/15.

### ADR-17 · Lo que ve cada persona y horario de acceso (2026-11-15)

El negocio necesita que una empleada no vea las ventas del día ni las deudas de otros días,
y que solo pueda entrar en un horario que decide la administración (docs/17). Hasta ahora
el servidor mandaba la misma foto a todos y el celular escondía pantallas: eso no es
seguridad, porque la foto traía todas las deudas y los cierres de caja.

**Decisión.**

- Dos permisos sueltos nuevos, `dia` e `historial`, y una columna `horario` (JSON con
  franjas semanales y días especiales, en hora de Colombia) en `personas`. El
  administrador ve todo y no tiene horario.
- **El servidor recorta lo que manda** (`src/dominio/vista.ts`, puro y probado): foto,
  novedades y cada operación repartida por WebSocket, por persona. Quien ve menos recibe
  siempre la foto (nunca novedades desde su `seq`) y de las operaciones ajenas solo `id`,
  `seq` y tipo. Al entrar otra persona en el celular se descarta lo confirmado (no los
  pendientes).
- **El horario se revisa en el servidor**: al entrar (antes del PIN), en cada pedido y en
  cada mensaje del WebSocket. Una **alarma del Durable Object** suena al fin de la franja
  más próxima de quienes están conectados y los saca. El celular también sale solo a la
  hora (`fin`), por si no tiene señal.
- **Regla 3 sobre la regla de horario**: fuera de su horario se acepta lo anotado dentro
  de él o hasta 15 minutos después; lo demás se rechaza con su porqué (regla 8). Las
  operaciones no cambian de forma: el registro viejo da el mismo estado (sin subir
  `VERSION_PROYECCION`).
- Al desplegar, los operadores que ya existían reciben `dia` e `historial` (nadie pierde
  nada sin que se decida); las personas nuevas empiezan sin ellos y con el horario de
  empleado (domingos de 8:00 a. m. a 3:00 p. m.).

**Costo aceptado.** Quien ve menos baja la foto completa al reconectar (pocos KB). La
foto ya no es una sola para todos: se arma por vista (con caché por combinación de
permisos al repartir).

### ADR-18 · Una puerta pública para los pedidos por QR (2026-11-15)

Hasta ahora toda la API exigía celular vinculado y sesión. Los pedidos de los clientes
por QR (docs/20) necesitan que alguien sin cuenta pida desde su celular.

**Decisión.**

- Rutas `/api/publico/*` **sin sesión**, que solo aceptan el **código del lugar** (16 bytes
  al azar, rotable) y solo ven la carta y el estado de las solicitudes de ese código.
  Nunca cuentas, la foto ni datos internos. Con CORS abierto (para el sitio web).
- El pedido **no toca ninguna cuenta**: el servidor escribe una operación `solicitud` en el
  registro (persona «Cliente · Mesa 4»); el personal la acepta o la rechaza con operaciones
  propias, y al aceptar el celular anota la pedida con las reglas de siempre. Así la regla
  5 (una sola función de reglas) y los permisos no cambian.
- Lugares, ritmo de pedidos y el interruptor van en tablas del Durable Object (como las
  personas), no en el registro. El interruptor arranca **apagado**.
- Límites en el servidor: ritmo por código, topes de líneas, unidades y valor, sin valor
  libre, cuerpo pequeño.
- La página del cliente es una entrada aparte de Vite (`cliente.html`, 5 KB propios; React
  queda en un archivo compartido que la app del personal también guarda sin señal), servida
  por el Worker en `/m/<código>`. El Service Worker del personal no la toca.

**Costo aceptado.** Una superficie pública nueva: por eso el interruptor, los límites y
que nada entre a una cuenta sin una persona del negocio.

### ADR-19 · Notificaciones push propias, sin servicios de terceros (2026-11-16)

El timbre del despacho solo suena con la app abierta y a la vista; con la pantalla apagada
el pedido se perdía (docs/14 paso 5, docs/16 §3.1).

**Decisión.**

- **Web Push estándar** desde el Durable Object: el mensaje se cifra (RFC 8291,
  `aes128gcm`) y la petición se firma con VAPID (RFC 8292) usando solo WebCrypto
  (`src/servidor/push.ts`, sin dependencias). Nada pasa por Firebase ni OneSignal: el
  servicio de push del navegador solo ve el mensaje cifrado.
- La llave VAPID es **un secreto por entorno** (`VAPID`, JWK privada P-256, generada con
  `scripts/vapid.mjs` directo a `wrangler secret put`); la pública sale de ella. Sin el
  secreto, push queda apagado y la app lo dice.
- **Suscripciones en una tabla del Durable Object** (`suscripciones`), una por aparato, con
  la persona que está en él. No van en el registro: no son operaciones del negocio. Se
  borran al quitar el aparato, al «Dejar de recibir» o cuando el servicio responde 404/410.
- Solo se manda a servicios de push conocidos (FCM, Mozilla, Apple, Windows) por `https`:
  el `endpoint` lo pone el navegador, pero el Worker no le hace peticiones a cualquier
  dirección.
- **Disparador**: una operación aceptada que deja bebidas por despachar → aviso a quienes
  tienen barra hoy y están en su horario, menos el aparato que lo pidió. Se manda con
  `ctx.waitUntil`, después de responder: la respuesta al celular no espera al push.
- El Service Worker propio muestra el aviso (no si la app está a la vista: ya suena el
  timbre) y al tocarlo abre «Despachar».

**Costo aceptado.** En iPhone solo funciona con la app instalada; cambiar la llave VAPID
obliga a reactivar los avisos en cada aparato. Playwright no recibe push de verdad: el
cifrado se prueba descifrando como el navegador (`tests/push.test.ts`) y el envío con un
servicio de push falso y el Worker real (`tests/servidor/push.test.ts`).
