# 13 · Revisión técnica: el stack planeado contra el que corre (2026-11-03)

La versión 0.1 se hizo rápido para que el negocio la usara ya. Este documento compara,
pieza por pieza, lo planeado en [03](03-arquitectura.md) con lo que corre hoy (después de
las fases A a F y E2), con medidas, y dice qué conviene cambiar y cuándo.

**Cómo se midió.** Paquete: `vite build`. Rendimiento: un banco de pruebas con el
dominio real (`aplicar`, `recortar`) sobre registros sintéticos de 60 cuentas por día,
5 pedidas de 3 productos y cobro (unas 430 operaciones diarias), en un Mac M; un Android
de gama media es unas 5 a 10 veces más lento. Producción: métricas de Cloudflare
(GraphQL, `durableObjectsPeriodicGroups`). Robustez: operaciones malformadas contra
`esOperacion` y `aplicar`. Límites del plan gratuito: página de precios de Durable
Objects (unas 5 millones de filas leídas y 100.000 escritas por día; al pasarse, **las
operaciones fallan con error**, no se cobra más).

## Resumen

La base técnica es **la correcta** y aguanta bien el uso de hoy: Durable Object único con
registro de operaciones, WebSocket con hibernación, una función de reglas compartida,
React con Vite, IndexedDB. Lo que se simplificó para salir rápido no es un problema hoy,
pero hay **tres cosas que sí hay que hacer antes de que crezca el registro** y **dos que
afectan el uso diario ya**:

| # | Qué | Por qué | Cuándo |
|---|---|---|---|
| 1 | **El Service Worker abre la app esperando la red sin límite** | Con Wi-Fi «conectado sin internet» la app no abre (visto el 2026-11-03 en el celular: más de 30 s). Incumple RNF-04 | **Ya** |
| 2 | **Validar en el servidor con un esquema** (Zod u otro), solo del lado del Worker | Hoy pasan operaciones con medio de pago o tipo de cuenta inventados, y una pedida con `lineas: null` hace fallar el lote: el celular que la tenga deja de enviar todo lo demás | **Ya** |
| 3 | **Foto del estado guardada (E3) y no recalcular el registro al despertar** | El Durable Object relee el registro completo cada vez que despierta (medido: 30 a 40 veces el primer día de uso). Con el registro de un año eso se acerca al límite gratuito de filas leídas, y el estado de todos los días vive en memoria (límite 128 MB) | En los próximos meses, **antes de ~100.000 operaciones**; el plan decía 5.000 por precaución |
| 4 | **Novedades desde `seq`** en vez de la foto completa al reconectar, y el respaldo HTTP sin repetir la foto cada 5 s | Cada reconexión baja la foto entera (hoy unos 300 KB sin comprimir con un día movido); sin WebSocket, el respaldo HTTP la baja cada 5 s | Junto con 3 |
| 5 | **Dexie**: decidir si se queda | Es el 27 % del paquete (33 de 123 KB comprimidos) y se usa una mínima parte | Opcional |

## Pieza por pieza

| Pieza | Planeado | Hoy | Veredicto |
|---|---|---|---|
| Interfaz | React 19 + Vite | Igual | ✅ Correcto. React es el 60 % del paquete, pero cambiarlo (Preact) ahorraría ~40 KB y no vale el riesgo |
| Estilos | Tailwind 4 | CSS propio, 7 KB comprimido | ✅ Mejor así: ya resuelve vertical, girado, tablet y teclado, y está probado (C2). Migrar no da nada |
| Memoria del celular | IndexedDB + Dexie + `liveQuery` | IndexedDB + Dexie, sin `liveQuery` (E2) | ⚠️ Correcto en lo esencial. Dexie pesa 33 KB comprimidos para dos tablas y transacciones; `idb` (~1 KB) o IndexedDB directo hacen lo mismo. Se queda si se planea consultar en el celular (reportes sin señal); si no, cambiarlo |
| Varias pestañas | Web Locks | Web Locks + `BroadcastChannel` (E2) | ✅ Como estaba planeado, probado en los aparatos reales |
| Service Worker | Workbox (`vite-plugin-pwa`) | A mano, 60 líneas | ❌ Corto y entendible, pero **le falta el tiempo límite de la red** (punto 1). Workbox lo trae hecho; arreglarlo a mano son 10 líneas. Recomendación: arreglarlo a mano (menos dependencias) |
| Validación | Zod, mismo esquema en celular y servidor | `esOperacion` (forma mínima) + limpieza dentro de `aplicar` | ❌ El dominio se defiende más de lo que parece (recorta nombres a 60, redondea cantidades, descarta más de 3.000), pero quedan huecos (punto 2). **El plan tenía razón**; el costo que se quiso evitar (peso en el celular) no aplica si la validación va **solo en el Worker** |
| Servidor | Workers + un Durable Object con SQLite | Igual | ✅ Correcto para un negocio. El costo es $ 0 y sobra capacidad |
| Datos en el servidor | Registro + proyecciones en tablas SQLite | Solo el registro; el estado se recalcula en memoria al despertar | ⚠️ Bien para hoy, no para un año (punto 3). Las proyecciones del plan son la solución completa; una foto guardada cada N operaciones es la mitad del trabajo y quita el 95 % del costo |
| Tiempo real | WebSocket con hibernación | Igual, con latido y respaldo HTTP | ✅ El servidor reenvía cada operación, no la foto: eficiente. Mejorable al reconectar (punto 4) |
| Protocolo al conectar | «novedades» si faltan pocas, foto si faltan muchas | Siempre la foto | ⚠️ Punto 4 |
| Respaldos | Cron diario a R2 | Igual, registro completo, 365 días | ✅. Falta el ensayo de restauración (E5) |
| Pruebas | Vitest + Playwright | 94 unitarias y del Worker real + 40 de extremo a extremo | ✅ Mejor que lo planeado en extremo a extremo (tamaños reales, pestañas, sin señal) |
| Fuentes | Bitter + Source Sans 3 | Del sistema | ✅ Abren sin descargar ni señal. Decisión de marca, no técnica |
| Ids | UUID v7 | UUID v4 | ✅ El orden lo da `seq`; v7 no aporta nada aquí |

## Medidas

### Paquete del celular

| | Sin comprimir | Comprimido |
|---|---|---|
| JavaScript (antes de E2) | 297 KB | 90 KB |
| JavaScript (hoy, con Dexie) | 401 KB | 123 KB |
| CSS | 36 KB | 7 KB |

Meta RNF-33: menos de 200 KB comprimido. ✅

### Cómo escala el dominio (banco sintético, ~430 operaciones por día)

| Días de registro | Operaciones | Rearmar en el servidor | Estado completo (JSON) | Memoria del estado | Foto que baja el celular | Recalcular en el celular |
|---|---|---|---|---|---|---|
| 1 | 438 | < 1 ms | 146 KB | — | 146 KB | 0,45 ms |
| 30 | 13.140 | 11 ms | 4,5 MB | 7 MB | 298 KB | 0,9 ms |
| 90 | 39.420 | 30 ms | 13 MB | 22 MB | 303 KB | 0,9 ms |
| 365 | 159.870 | 120 ms | 55 MB | 90 MB | 303 KB | 0,9 ms |

- **En el celular no hay problema**: la foto se recorta a lo vivo y las últimas 36 horas
  y queda en unos 300 KB por mucho que crezca el registro. Recalcular cuesta menos de 1 ms
  (unos 10 ms en un Android de gama media).
- **Cuidado**: si la cocina no marca «ya se cobró en comida», esas cuentas no se recortan
  nunca. En el banco, sin marcarlas, la foto pasó de 300 KB a 11 MB en un año. Conviene
  recortarlas también a los pocos días (va con el punto 3).
- **En el servidor el costo crece con todo el registro**, en tres frentes:
  - **Filas leídas**: cada vez que despierta, relee todas las operaciones. Medido en
    producción el primer día de uso: 30 a 40 relecturas. Con 35 por día, el límite
    gratuito de 5 millones se alcanza con unas **140.000 operaciones** en el registro
    (unos 11 meses al ritmo del banco; el doble si el ritmo real es la mitad). Al pasarlo,
    la app deja de funcionar ese día.
  - **Memoria**: todo el estado histórico vive en memoria, unos 0,25 MB por día; el
    límite del Durable Object es 128 MB.
  - **Latencia**: el primer toque después de despertar espera el rearmado (120 ms en el
    Mac con un año; varias veces más en el Worker).

### Robustez de la validación

Operaciones malformadas contra `esOperacion` + `aplicar`:

| Caso | Resultado |
|---|---|
| Cuenta llamada `__proto__` o `constructor` | ✅ Ignorada; sin contaminar prototipos |
| Cantidad en texto, decimal o enorme | ✅ Se redondea; más de 3.000, se descarta |
| Precio negativo, producto vacío, orden con basura, fecha imposible, tipo de operación desconocido | ✅ Se descarta |
| Nombre de 1 MB | ⚠️ Se recorta a 60 en el estado, pero **queda completo en el registro** y en cada respaldo |
| Medio de pago inventado («bitcoin») | ❌ Se acepta: la cuenta queda cobrada con un medio que «El día» no suma |
| Tipo de cuenta inventado | ❌ Se acepta |
| `lineas: null` o una línea `null` | ❌ **Lanza error en el servidor**: el lote falla y el celular lo reintenta para siempre, sin enviar lo que anote después |

Hoy solo un celular vinculado con sesión puede enviar, así que el riesgo real es un
**error del propio código** del celular, no un ataque. Igual: la regla 8 dice que nada se
descarta en silencio, y una operación así debe quedar en `rechazadas` con su motivo, no
tumbar el lote.

### Lo visto en producción y en los aparatos

- Con el Wi-Fi conectado y sin internet (celular, 2026-11-03), recargar la app quedó
  colgado más de 30 s: es el punto 1. Las anotaciones de ese rato sí quedaron guardadas y
  salieron solas al volver la red.
- La foto de producción hoy pesa 13 KB (3 KB comprimida): en este momento no hay nada que
  optimizar en la red; los puntos 3 y 4 son para cuando haya meses de datos.

## Propuesta de orden

1. **Service Worker con tiempo límite** (abrir desde la copia si la red no responde en
   ~2 s; la versión nueva se toma en segundo plano y se usa al siguiente arranque). Prueba
   e2e con la red colgada, no cortada.
2. **Esquema en el Worker** para cada tipo de operación: lo que no cumple va a
   `rechazadas` con motivo y se avisa (regla 8); nunca lanza. El celular no carga la
   librería. Pruebas con los casos de la tabla de arriba.
3. **E3 · Foto guardada**: el Durable Object guarda el estado cada N operaciones y al
   despertar lee la foto y solo lo posterior. Las jornadas cerradas salen de la memoria
   (se consultan del registro o de proyecciones cuando se pidan). Las cuentas pasadas a
   comida se recortan a los pocos días aunque no se marquen. Prueba: el estado con foto
   es igual al de recalcular todo (regla 4).
4. **Novedades desde `seq`** al reconectar, y el respaldo HTTP responde «nada nuevo» si
   el `seq` no cambió.
5. **Dexie**: quedarse con él si se van a hacer reportes en el celular sin señal; si no,
   cambiarlo por `idb` y ahorrar 33 KB.

Los puntos 1 y 2 son cortos (horas). El 3 es el trabajo grande y el más importante para
el largo plazo. Ninguno cambia lo que se ve en pantalla ni las reglas del negocio.
