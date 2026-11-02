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
| Estilos | **Tailwind CSS 4** | Mismo sistema que el sitio; tokens de la marca reaprovechados |
| Almacenamiento local | **IndexedDB** con **Dexie** | Guarda estado y pendientes; sobrevive a cerrar la app y apagar el celular. `liveQuery` actualiza la interfaz sola |
| PWA | Service Worker propio con **Workbox** (`vite-plugin-pwa`) | La app abre sin señal, desde la pantalla de inicio |
| Servidor | **Cloudflare Workers** | Sin servidor que administrar, plan gratuito amplio, cuenta ya configurada |
| Estado compartido | **Durable Objects con SQLite** | Un único punto que ordena todo lo que pasa en la barra, con WebSockets y base propia. Ver ADR-01 |
| Tiempo real | **WebSocket con hibernación** | Empuja los cambios al instante y no cobra mientras nadie anota |
| Validación | **Zod** | Mismo esquema en celular y servidor |
| Respaldos | **Cloudflare R2** | Sin costo de salida, ya usado en el sitio |
| Pruebas | **Vitest** (+ `@cloudflare/vitest-pool-workers`) y **Playwright** | Playwright simula pérdida de red y varios celulares a la vez |
| Paquetes | **pnpm 11** | |

## El núcleo: reglas compartidas

La pieza más importante del código no es ni la interfaz ni el servidor. Es una **función
pura** que recibe el estado y una operación, y devuelve el estado nuevo:

```ts
// src/dominio/aplicar.ts — se ejecuta igual en el celular y en el Durable Object
export function aplicar(estado: EstadoBarra, op: Operacion): EstadoBarra
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

- **PIN con hash** (PBKDF2 de Web Crypto, disponible en Workers sin dependencias) y
  bloqueo de 5 minutos tras 5 intentos fallidos por persona y dispositivo.
- La sesión de persona vive en el celular y viaja en cada operación; el servidor
  **verifica en cada operación** que el dispositivo no esté revocado y que la persona
  esté activa y tenga el rol que exige esa operación. Ocultar un botón no es seguridad.
- **Fuera de línea**, el celular ya no puede preguntar al servidor si el PIN es
  correcto. Por eso guarda el hash del PIN de las personas de ese negocio y verifica
  local. Al volver la señal, el servidor revalida todo: si la persona fue desactivada
  mientras tanto, sus operaciones se aceptan (la venta ocurrió) pero quedan marcadas.
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
