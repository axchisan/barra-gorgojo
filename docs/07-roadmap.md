# 07 · Roadmap

> **Desde el 2026-11-02 el orden de trabajo lo manda [12 · Plan de trabajo](12-plan-de-trabajo.md)**,
> que parte de la auditoría (`negocio/docs/09`, privada). Este documento queda como el
> roadmap original de producto (fases 1 a 4).

## Versión 0.1 · En uso — 2026-10-04

Se publicó una versión funcional antes de completar la fase 1, porque el negocio la
necesitaba ya. Funciona el flujo completo del día; **estos atajos quedan por pulir**:

| Atajo de la 0.1 | Lo previsto | Dónde |
|---|---|---|
| Entrada con **una clave del negocio** + escoger nombre. El celular recuerda la clave | Vinculación de celular con código y PIN por persona | [03](03-arquitectura.md) «Acceso y seguridad» |
| Memoria del celular en `localStorage` | IndexedDB con Dexie y Web Locks | [04](04-sincronizacion-y-fuera-de-linea.md) |
| Catálogo y personas **en el código** (`src/dominio/catalogo.ts`); cambiar un precio es desplegar | Catálogo con historial de precios administrable desde la app | [05](05-modelo-de-datos.md) |
| El servidor guarda solo el registro de operaciones y recalcula el estado en memoria al despertar | Proyecciones en tablas SQLite | [05](05-modelo-de-datos.md) |
| Cuadre de caja calculado en pantalla, sin guardar la jornada | Jornadas cerradas y guardadas, historial y CSV | RF-51 a RF-53 |
| Sin respaldo diario a R2 (el SQLite del Durable Object tiene recuperación a 30 días) | Cron diario a R2 | [06](06-infraestructura.md) |
| Fuentes del sistema; sin pruebas de extremo a extremo automatizadas | Bitter y Source Sans 3; Playwright con varios celulares | |

Verificado antes de publicar: 10 pruebas de reglas (precios, reintentos sin duplicar,
anular, doble cobro, reapertura por anotación tardía, mesas y cocina, convergencia), y a
mano en el navegador: dos pestañas sincronizadas al instante, y una pedida anotada con
el servidor apagado que llegó sola al volver.

## Fase 0 · Documentación y datos — ✅

| Entregable | Estado |
|---|---|
| Visión, requerimientos, flujos, arquitectura, sincronización, modelo de datos, infraestructura | ✅ |
| Catálogo y precios iniciales | ✅ falta solo aguardiente y cajetillas, que se siembran inactivos |
| Respuestas a las preguntas de 08 (privado) | ✅ quedan solo detalles que no bloquean |
| Prototipo navegable de la pantalla «anotar pedida» para probar con los dueños | ⬜ |

**Antes de programar la fase 1**, el prototipo de «anotar pedida» se prueba en el celular
de quien atiende la barra, con rondas reales dictadas en voz alta. Si no le gana al
cuaderno en esa prueba, se rediseña. Es más barato equivocarse en el prototipo que en
el sistema.

## Fase 1 · Núcleo usable

El mínimo para reemplazar el cuaderno un día normal, **con y sin señal**.

| Entregable | Requerimientos |
|---|---|
| Proyecto: Vite + React + Worker + Durable Object, `pnpm verificar`, entorno de pruebas desplegado | |
| Dominio compartido: operaciones, `aplicar`, totales, precios, con pruebas de cada regla | RNF-31 |
| Catálogo sembrado con los precios confirmados | RF-60, RF-61, RF-63 |
| Vinculación de celulares, personas con PIN, roles | RF-70 a RF-73 |
| Cuentas abiertas, nueva cuenta, anotar ronda, repetir, detalle | RF-01 a RF-05, RF-10 a RF-16, RF-20 |
| Cobro con cambio, deshacer, venta rápida | RF-21, RF-22, RF-24, RF-25 |
| Mesas: cobrar aquí o pasar a comida, lista de cocina | RF-23, RF-40 a RF-42 |
| Canchas, «chico» y «pedida», mecato de valor libre | RF-02, RF-18 |
| **Cerrar el día con cuadre de efectivo** | RF-51 |
| «Cómo va el día» | RF-50 |
| Almacenamiento local, cola, WebSocket, respaldo HTTP, indicador | RNF-10 a RNF-16 |
| Conflictos, incluida la reapertura por anotaciones tardías | RF-26 |
| PWA instalable, abre sin señal | RNF-04, RNF-24 |
| Respaldo diario a R2 | RNF-34 |

**Criterio de salida:**

- Prueba de convergencia y prueba de varios celulares con desconexión pasando.
- **Prueba de campo**: un sábado completo con el sistema **y el cuaderno en paralelo**.
  Al final del día se comparan los dos. Se acepta si el sistema no perdió nada y el
  equipo no tuvo que esperarlo.

## Fase 2 · Operación completa

| Entregable | Requerimientos |
|---|---|
| Jornadas anteriores y exportación CSV | RF-52, RF-53 |
| Unir cuentas, anular cuentas, reabrir | RF-06, RF-07 |
| Notas en las rondas | RF-17 |
| Modo «mostrar al cliente» | RF-27 |
| Auditoría consultable y pantalla de estado de celulares | RF-74 |
| Administración del catálogo, personas y dispositivos desde la app | RF-62 |

**Criterio de salida:** cuatro semanas sin cuaderno.

## Fase 3 · Datos para decidir

| Entregable | Requerimientos |
|---|---|
| Reportes por semana y mes: productos, días y horas fuertes | RF-54 |
| Inventario de nevera y bodega, con descuento automático por venta y aviso de reposición | RF-55 |
| Nombres frecuentes sugeridos | RF-08 |

El inventario va aquí y no antes porque necesita algo que hoy no existe: **saber cuánto
se vende de cada cosa**. Después de dos meses de fase 1 ese dato ya está.

## Fase 4 · Integraciones, según necesidad

- Pago en varias partes y fiado (RF-28, RF-29), si el negocio lo pide.
- Canchas con equipos y «¿quién paga este chico?» (RF-19).
- Mecato como lista desplegable de productos con su precio (decisión ya tomada; solo es cargar el catálogo y una pantalla de selección).
- Ventas de la barra en el tablero del panel del sitio web.
- Sistema de cuentas de la cocina con el mismo motor, si la barra funciona y la cocina
  lo quiere. La arquitectura lo permite: otra categoría de productos y otra pantalla.
- Precios de bebidas del sitio público leídos desde la barra, para que no se
  desactualicen.

## Plan de adopción

El riesgo principal no es técnico: es que el equipo vuelva al cuaderno. El plan:

1. **Prototipo con los dueños** (fase 0). Ellos deciden si el flujo sirve.
2. **Entorno de pruebas para practicar** una semana antes, con datos de juguete. Cada
   persona anota y cobra diez cuentas inventadas.
3. **Capacitación de media hora** por persona, en su propio celular, que ya queda
   vinculado e instalado.
4. **Primer sábado en paralelo** con el cuaderno.
5. **Dos fines de semana más** con el cuaderno solo de respaldo.
6. **Se guarda el cuaderno.** Queda en un cajón para el caso extremo de que todos los
   celulares fallen a la vez.

Una persona del equipo queda como **referente** para dudas del día a día, para que no
todo dependa del desarrollador.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El equipo vuelve al cuaderno | Prototipo antes de construir; flujos contados en toques; adopción gradual |
| Celular sin batería a mitad del día | Celular fijo de la barra en el cargador; los datos están también en los demás celulares y en el servidor |
| Celular con la hora mal | El servidor acota la hora y ordena por su propio `seq`; la hora del celular solo se usa para mostrar y escoger precio |
| Datos locales borrados con anotaciones sin enviar | `storage.persist()`, app instalada, aviso visible de pendientes viejos, bloqueo de cierre de sesión con pendientes |
| Celular perdido o robado | Revocación inmediata; el PIN protege la sesión |
| Cuenta de Cloudflare personal del desarrollador | Ver pregunta de titularidad en `negocio/docs/08`; respaldos exportables que no dependen de la cuenta |
| Cambio de precios a mitad del día | Historial de precios y regla de [04](04-sincronizacion-y-fuera-de-linea.md); recomendación de cambiarlos fuera de horario |
| Un solo administrador | Las acciones del día a día no lo necesitan. Para lo urgente fuera de casa (vincular un celular, reabrir una cuenta) se puede vincular el celular del desarrollador de forma remota, y si hace falta, dar el rol a una segunda persona más adelante |
| Despliegue que rompe algo un sábado | No desplegar en horario de atención; entorno de pruebas; versión mínima sin forzar recargas con pendientes |
