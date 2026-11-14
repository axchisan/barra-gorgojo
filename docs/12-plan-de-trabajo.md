# 12 · Plan de trabajo — desde el 2026-11-02

Plan para pasar de la versión de emergencia a la que planteaban los documentos 00 a 08.
Sale de la auditoría `negocio/docs/09-auditoria-2026-11-02.md` (privada: tiene
datos reales del negocio). Está pensado para que **una sesión
nueva de Claude Code lo tome desde cero**: cada fase dice qué leer, qué hacer, cómo se
verifica y qué no tocar.

## Orden y por qué

| Fase | Qué | Por qué en este orden |
|---|---|---|
| **A** | Base segura: git, entorno de pruebas, partir `App.tsx`, pruebas del servidor | Sin control de versiones no hay cómo volver atrás; sin entorno de pruebas todo se prueba en producción. Partir `App.tsx` antes del rediseño hace C mucho más fácil |
| **B** | Migración a base limpia | Lo pidió el negocio. Conviene hacerla antes de cambiar la interfaz, mientras el modelo de datos es el mismo |
| **C** | Teléfono: aprovechar el espacio | Lo segundo que pidió el negocio; afecta el uso diario |
| **D** | Acceso por persona con PIN | Hoy cualquiera con la clave entra como Administrador |
| **E** | Lo que falta del plan original | Jornadas guardadas, IndexedDB, auditoría, e2e, documentación |
| **F** | Pedidos del negocio del 2026-11-03: cobro más rápido y avisos cómodos | Salieron de usar la app en producción con datos de prueba |
| **G** | Base limpia definitiva | Al terminar todas las fases: producción arranca otra vez solo con las ventas reales |

D puede adelantarse a C si el negocio lo prefiere. A y B no se saltan.

## Reglas para trabajar en producción

Lo aprendido en las sesiones de octubre y noviembre. Son obligatorias.

1. **No desplegar en horario de atención** (L-V 7 a. m.–9 p. m., S-D 9 a. m.–11 p. m.,
   hora de Colombia) salvo arreglo urgente pedido por el negocio.
2. **Antes de cada despliegue**, guardar la foto de producción (`GET /api/foto`) y anotar
   `seq` y la suma de las cuentas. **Después**, comparar. Si cambió sin que nadie anotara,
   es un error de recálculo: revertir (`wrangler rollback`) y entender por qué.
3. **Nunca cambiar en el código el precio de un producto del catálogo base que ya se
   haya usado.** Los precios se cambian desde la app. Ver [04](04-sincronizacion-y-fuera-de-linea.md)
   «Precio fijado por el servidor»: un cambio así ya recalculó cuentas viejas una vez.
4. Todo cambio de reglas (`src/dominio/estado.ts`) debe ser **compatible con el
   registro existente**: aplicar las operaciones viejas tiene que dar exactamente el mismo
   estado. Agregar una prueba que lo demuestre.
5. Probar en el navegador con Playwright antes de publicar, en 360 × 740 y en tablet.
6. `wrangler dev` no ve los archivos nuevos si se recompila con él corriendo: **reiniciarlo
   después de `vite build`** (si no, la página queda en blanco con errores 500).
7. En pruebas de navegador, la app guarda la pantalla en `history.state`: recargar vuelve a
   la misma pantalla. Para empezar limpio: `history.replaceState({ vista: { v: "inicio", pestana: "cuentas" }, d: 0 }, "")` y recargar.
8. Evitar APIs muy nuevas del navegador sin revisar compatibilidad (ya pasó con
   `findLastIndex`): la tablet y los celulares pueden ser viejos.
9. Español con tildes en todo; commits en imperativo («agrega…», «corrige…»).

---

## Fase A · Base segura

Leer: `AGENTS.md`, [03](03-arquitectura.md), `negocio/docs/09`.

### A1 · Control de versiones

- El repositorio **no tiene commits**. Revisar `.gitignore` (debe excluir `node_modules`,
  `dist`, `.wrangler`, `.dev.vars`, `.env*`, `.playwright-mcp`, **`migracion/`**, que tendrá
  datos de clientes, y **`negocio/`**).
- Commit inicial con el estado actual, que es exactamente lo que corre en producción.
  Mensaje: «agrega la versión 0.1 que está en producción».
- **Decisión del 2026-11-02:** el repositorio `axchisan/barra-gorgojo` es **público**, para
  que sirva a otros negocios como registro de barra personalizable. Por eso, antes del
  primer `push`:
  - El catálogo base y las personas salen del código a `negocio/catalogo.ts` (se importa
    como `#negocio`); el público lleva un ejemplo inventado en `negocio.ejemplo/`, que es
    también el catálogo fijo de las pruebas.
  - Los documentos 08 a 11 y sus capturas (precios, ventas, dirección de producción,
    nombres) pasan a `negocio/docs/`. En los públicos, nombres por roles.
  - `negocio/` es un repositorio **privado** aparte: `axchisan/barra-gorgojo-negocio`.
- Comprobar que la compilación con `negocio/` real da el mismo paquete que antes de
  separar (solo cambian nombres minificados y orden de módulos).

**Hecho cuando:** `git log` muestra el commit, `gh repo view axchisan/barra-gorgojo` lo
muestra público sin datos del negocio y `axchisan/barra-gorgojo-negocio` privado.

### A2 · Entorno de pruebas

- Agregar `env.pruebas` en `wrangler.jsonc`: Worker `barra-gorgojo-pruebas`, su propio
  Durable Object y bucket de respaldos propio o sin Cron.
- Secretos propios (`CLAVE`, `FIRMA`) para pruebas.
- Script `pnpm desplegar:pruebas`.

**Hecho cuando:** hay una URL de pruebas funcionando que no comparte datos con producción.

### A3 · Partir `App.tsx` (1.301 líneas)

Sin cambiar comportamiento. Estructura sugerida, en español:

```
src/app/
  App.tsx                 # solo navegación y sesión
  navegacion.ts           # useNavegacion
  avisos.tsx              # aviso con «Deshacer»
  pantallas/              # Entrada, Inicio, Anotar, Detalle, Cobrar, Cocina, ElDia, Productos, EditarProducto
  componentes/            # TarjetaCuenta, TarjetasProducto, EditarLinea, Desglose, hojas (Otro, Mecato, Mixto)
  paquetes.ts             # porPaquete, describir, contarPaquetes, nombrePaquete
```

**Hecho cuando:** `pnpm verificar` en verde, el paquete compila y las capturas de
[11](11-revision-movil.md) se ven iguales.

### A4 · Pruebas del servidor y de extremo a extremo mínimas

- `@cloudflare/vitest-pool-workers`: idempotencia por `id`, operaciones de catálogo
  rechazadas a quien no es administrador, `precioFijado` escrito por el servidor e
  ignorado si lo manda el celular, foto recortada.
- Playwright (`tests/e2e/`): entrar, abrir cuenta, anotar, cobrar; dos pestañas que se
  sincronizan; anotar sin servidor y que llegue al volver.

---

## Fase B · Migración a base limpia

Leer: **`negocio/docs/10-migracion-base-limpia.md`** completo. Ahí está qué se
conserva, las piezas a construir, el procedimiento y cómo volver atrás.

Pasos:

1. B1 · `BASE` como variable de configuración y `base` en la foto.
2. B2 · Manejo en el celular del cambio de base (descartar confirmado, apartar pendientes).
3. B3 · `GET /api/admin/respaldo`.
4. B4 · `scripts/migrar.ts` + `tests/migrar.test.ts`, con la verificación de totales.
5. B5 · `POST /api/admin/importar` protegida con el secreto `MIGRACION`.
6. B6 · Ensayo completo en el entorno de pruebas (A2) con el corte real.
7. B7 · **Ejecución en producción**, fuera de horario, con el negocio avisado y los
   celulares a mano. **Pedir confirmación explícita antes de este paso.**
8. B8 · ~~Rotar `CLAVE`~~ (hecho el 2026-11-02 junto con `FIRMA`); regla de retención de 365 días en el bucket; anotar fecha y `seq`
   del corte en `negocio/docs/09`.
9. B9 · **El catálogo sale del código.** En la base limpia, el catálogo vigente entra como
   operaciones `producto` y `orden` del registro (la migración ya las genera), así que el
   catálogo base del código puede quedar vacío para esa base sin cambiar ningún total.
   Desde ahí `negocio/catalogo.ts` solo hace falta para leer la base vieja. El celular ya
   recibe el catálogo en la foto, después de entrar; quitar del paquete del navegador lo
   que quede del negocio. Prueba: con catálogo base vacío, el registro migrado da el
   mismo estado.

**Hecho cuando:** producción muestra solo las cuentas cobradas del día real y el catálogo
vigente (cifras de control en `negocio/docs/09` y `10`), los celulares se pasaron solos a
la base nueva y la vieja sigue intacta.

---

## Fase C · Teléfono

Leer: **`negocio/docs/11-revision-movil.md`** completo, con sus capturas.

Hacer C1 a C5 y C7 a C11 en ese orden; C6 y C12 solo si las medidas lo justifican o el
negocio lo pide. Primero la prueba `tests/e2e/espacio-movil.spec.ts` con los umbrales, para
ver cómo se ponen en verde.

**Hecho cuando:** la prueba de espacio pasa en los cinco tamaños, la tablet se ve igual o
mejor y se probó «＋ Otro» con teclado en un Android real.

---

## Fase D · Acceso por persona

Leer: [03](03-arquitectura.md) «Acceso y seguridad» y ADR-06.

- Personas guardadas en el Durable Object, no en el código: nombre, color, rol y PIN de 4
  dígitos con hash (PBKDF2 de Web Crypto). Personas iniciales: Administrador (el
  desarrollador) y las de `negocio/catalogo.ts`; **preguntar** si hay más. Con esto
  `PERSONAS` sale del código.
- **«Administrador» deja de aparecer** en la lista pública de entrada; el administrador entra
  con su PIN.
- Vinculación de celular con código de 6 dígitos, como en [03](03-arquitectura.md). Los
  celulares ya en uso se vinculan una vez.
- El servidor verifica el rol **en cada operación**: catálogo y orden, reabrir cuentas
  cobradas, anular cuentas con valor.
- **Anular cuenta con valor** (RF-07): solo administrador, con confirmación y motivo. Para
  cuentas vacías, cualquiera. El primer día real se anularon muchas cuentas sin control
  (ver `negocio/docs/09`); esto lo previene.
- Bloqueo tras 5 PIN fallidos.

**Hecho cuando:** cada persona entra con su nombre y PIN, lo anotado registra quién fue, y
un operador no puede cambiar precios ni anular una cuenta con valor (probado en el
servidor, no solo ocultando botones).

---

## Fase E · Lo que falta del plan original

En orden sugerido; cada punto es independiente.

| # | Qué | Referencia |
|---|---|---|
| E1 | **Cerrar el día guardado**: operación `jornada.cerrar` con efectivo contado; historial de días; exportar CSV | RF-51 a RF-53 |
| E2 | **IndexedDB con Dexie** en vez de `localStorage`; Web Locks para una sola conexión por celular | [04](04-sincronizacion-y-fuera-de-linea.md) |
| E3 | Foto periódica del estado en el Durable Object para no recalcular todo el registro al despertar. Medir primero: hacer cuando pase de ~5.000 operaciones | [05](05-modelo-de-datos.md) |
| E4 | Auditoría consultable y pantalla de celulares conectados | RF-74, [06](06-infraestructura.md) |
| E5 | Ensayo de restauración trimestral desde R2 | [06](06-infraestructura.md) |
| E6 | Playwright con varios celulares y desconexión (completa A4) | [04](04-sincronizacion-y-fuera-de-linea.md) «Cómo se prueba» |
| E7 | **Poner al día la documentación**: 01 y 02 con petacos, «Otro», comida, precio en cancha, editar cantidad, ordenar; 05 con el modelo real (registro + `productos` + `orden` en el estado); 03 con un ADR de los atajos que se mantienen y los que se quitaron; README y AGENTS.md | Todos |

## Fase F · Pedidos del negocio (2026-11-03)

Salieron de probar en producción. Hacer **antes de E2** (afectan la venta de todos los días).
Cada uno con su prueba y revisado en el celular y la tablet reales, vertical y girados
(`tests/e2e/a-la-vista.spec.ts` debe seguir pasando).

| # | Qué | Detalle |
|---|---|---|
| F1 | **Billetes de Colombia en «¿Con cuánto paga?»** | Hoy salen solo 10.000, 20.000, 50.000 y 100.000 (`src/app/pantallas/Cobrar.tsx`, `billetes`). Billetes en circulación hoy: **2.000, 5.000, 10.000, 20.000, 50.000 y 100.000** (el de 1.000 ya casi no circula; monedas de 50, 100, 200, 500 y 1.000). Confirmar en la página del Banco de la República antes de fijarlo. Pasar la lista a `src/dominio` (función pura con pruebas) |
| F2 | **Sugerir con cuánto pagan** | Las opciones deben ser los valores con que de verdad pagan: redondeos al billete siguiente y combinaciones comunes. Ej.: cuenta de 37.000 → 40.000, 50.000, 100.000; 47.000 → 50.000, 100.000; 12.500 → 13.000, 15.000, 20.000, 50.000. Regla propuesta: siguiente múltiplo de 1.000, de 5.000 y de 10.000, y cada billete mayor que la cuenta; sin repetidos, ordenados, máximo 4 o 5 chips para que quepan a la vista (C2). «Exacto» se queda primero. Que el cambio salga al instante al tocar. Ningún toque nuevo en el flujo (regla 1) |
| F3 | **«Mostrar al cliente» desde Cobrar** | Hoy solo está en el menú ⋮ del detalle (RF-27). Ponerlo a la vista en la pantalla de cobrar: el cliente pide ver qué se le cobra. Pantalla limpia con productos y total grande; al cerrarla se vuelve al cobro sin perder lo escogido (medio, billete). Probar girado en el celular |
| F4 | **Avisos más cómodos** | Hoy (`src/app/avisos.tsx`) tapan la parte de abajo de la pantalla y duran 4 s (8 s con «Deshacer»). Hacerlos más pequeños y que no tapen botones de venta (ver C2), que se vayan antes (~2,5 s sin deshacer), que se puedan quitar tocándolos o deslizándolos, y que un aviso nuevo reemplace al anterior. Los rechazos del servidor (regla 8) sí se quedan hasta que se toquen |

## Fase G · Base limpia definitiva (al final)

Desde el 2026-11-03 producción se usa **para probar**: lo que hay en la base
`reten-del-gorgojo-v2` además de las ventas reales del 2026-11-02 son **datos de prueba**.
Cuando todas las fases estén terminadas y probadas en producción:

1. Pedir autorización al negocio y escoger hora fuera de atención (regla 14).
2. Respaldo y foto de la base actual.
3. Base nueva (por ejemplo `reten-del-gorgojo-v3`) con **solo** las cuentas reales del
   2026-11-02 (las mismas que se migraron en B7, con su catálogo; detalle en `negocio/docs/09`) y los productos y personas
   vigentes. Sin las cuentas de prueba ni sus cierres de día.
4. Mismo procedimiento de B: `pnpm migrar` con verificación cuenta por cuenta, ensayo
   antes en pruebas, `negocio/docs/10`. Registrar el corte en `negocio/docs/09`.
5. Revisar que los PIN y celulares vinculados sigan sirviendo (viven en tablas aparte del
   registro, no dependen de la base).

Lo de fases 3 y 4 de [07](07-roadmap.md) (inventario, reportes, fiado, integración con el
sitio) sigue igual y va después.

---

## Para iniciar la próxima sesión

**Las fases de este plan están hechas.** La siguiente etapa y cómo iniciar la sesión están
en [16 · Estado y siguiente etapa](16-siguiente-etapa.md). Las reglas de producción de
arriba siguen valiendo.

Contexto útil (de las sesiones de este plan):

- Aparatos reales (depuración USB): tablet en `negocio/docs/11`; probar en la **app
  instalada**, vertical y girada. Restaurar la rotación al terminar.
- Producción: `pnpm desplegar` (después de `pnpm build`). Antes y después, foto con
  `node scripts/admin.mjs .dev.vars.produccion foto migracion/<nombre>.json` y comparar con
  `pnpm resumen` (regla 2 de producción).
- Pruebas: `pnpm build && pnpm desplegar:pruebas`. URLs en `negocio/README.md`.
- Último estado comprobado (2026-11-14): 167 pruebas de Vitest y 65 e2e pasando. En un
  clon nuevo, `pnpm build` antes de `pnpm verificar` (las pruebas del Worker necesitan `dist`).

---

## Seguimiento

| Paso | Estado | Fecha | Nota |
|---|---|---|---|
| A1 Git | ✅ | 2026-11-02 | Repo público `axchisan/barra-gorgojo` sin datos del negocio; privado `axchisan/barra-gorgojo-negocio` en `negocio/`. Paquete de producción comprobado igual al de antes de separar |
| A2 Entorno de pruebas | ✅ | 2026-11-02 | Worker `barra-gorgojo-pruebas` con DO y bucket propios, sin Cron; secretos en `.dev.vars.pruebas`. URL en `negocio/README.md` |
| A3 Partir App.tsx | ✅ | 2026-11-02 | 1.301 líneas → 9 pantallas, 8 componentes y 6 módulos de apoyo. `scripts/recorrido.mjs` (30 pantallas × teléfono y tablet, hora fija): HTML y PNG idénticos byte a byte antes y después |
| A4 Pruebas servidor y e2e mínimas | ✅ | 2026-11-02 | 14 pruebas del Worker real (`tests/servidor`, ADR-09: `unstable_startWorker` porque `vitest-pool-workers` no soporta Vitest 5), incluida «recalcular con otro catálogo no cambia lo anotado»; comprobado que fallan si se rompe cada regla. 3 e2e en `tests/e2e` (cobrar, dos celulares, sin señal) |
| B1–B6 Preparar migración | ✅ | 2026-11-02 | Base en `vars.BASE` y en la foto; envíos con base y pendientes apartados; respaldo a demanda; `pnpm migrar` con verificación; importar con secreto `MIGRACION`. Ensayo completo en pruebas, con restauración, celular sin señal y vuelta atrás: ver `negocio/docs/10` «Ensayo» |
| B9 Catálogo fuera del código | ✅ | 2026-11-02 | Mecato y «Otro» libres por su id (`ESPECIALES`), compatible con el registro viejo; prueba del servidor con catálogo base vacío. Catálogo base de producción vacío y desplegado: foto igual antes y después, sin productos del negocio en el paquete del navegador |
| B7 Migrar producción | ✅ | 2026-11-02 | Autorizada por el negocio (sin uso ese día: excepción a la regla 14). Código nuevo sin cambiar de base, después base `reten-del-gorgojo-v2` verificada cuenta por cuenta contra el corte; importar apagado. Cifras en `negocio/docs/09` |
| B8 Clave, retención, registro | ✅ | 2026-11-02 | `CLAVE` y `FIRMA` rotadas; regla `respaldos-365-dias` en el bucket; corte anotado en `negocio/docs/09` |
| C Teléfono | ✅ | 2026-11-02 | C1–C5 y C7–C12 en producción. Revisado en la tablet y el celular reales, en las apps instaladas: teclado (✓/Enter, barras escondidas al escribir, nada tapado), gesto «atrás» que cierra hojas y menús, y el diseño no salta al abrir el teclado. El celular girado en la app quedó comprobado el 2026-11-03 |
| D Acceso por persona | ✅ | 2026-11-02 | En producción (ADR-10): celular vinculado con código, PIN cifrado (el administrador lo ve), bloqueo a los 5 intentos, permisos revisados en el servidor, anular con motivo, rechazos avisados. Personas en `negocio/catalogo.ts`. Secreto `PINES` puesto; celular del administrador vinculado |
| C2 · Auditoría «todo a la vista» | ✅ | 2026-11-02 | Hecha: ver `negocio/docs/11` «C2». `tests/e2e/a-la-vista.spec.ts` exige todo a la vista en los cuatro tamaños reales. Pedido del negocio (2026-11-02), después de D: en cada vista, sobre todo las de venta (anotar, detalle, cobrar, el día), las acciones deben verse sin deslizar y con tamaño adecuado según aparato y orientación; en el celular girado hoy hay que deslizar en cobrar y otros paneles. Auditar, documentar en `negocio/docs/11` y ajustar |
| E1 Cerrar el día | ✅ | 2026-11-03 | Operación `cerrar_jornada` (cualquiera; se puede repetir), días anteriores y CSV para el administrador. Ver 02 y 05. En producción el 2026-11-03 (autorizado; producción con datos de prueba) |
| F1 Billetes de Colombia | ✅ | 2026-11-03 | `src/dominio/pago.ts` (`BILLETES`, `billetesMayores`) con pruebas; familia de 2.000 a 100.000 confirmada en banrep.gov.co. Cobrar ya la usa |
| F2 Sugerir con cuánto pagan | ✅ | 2026-11-03 | `sugerirPago`: redondeo hacia arriba a 1.000, 5.000 y 10.000, siguiente múltiplo de 50.000 y 100.000 y billetes mayores; máximo 4 después de «Exacto». Pruebas con los ejemplos del negocio y de 100 a 300.000. Cabe a la vista en los cuatro tamaños (`a-la-vista`, `espacio-movil`) |
| F3 Mostrar al cliente en Cobrar | ✅ | 2026-11-03 | `VistaCliente` compartida con el detalle; en Cobrar, bajo el total (celular vertical) o en la barra (pantallas anchas); muestra con cuánto paga y el cambio. Se vuelve tocando o con «atrás» sin perder medio ni billete (`tests/e2e/cobrar.spec.ts`). De paso: `useAtrasCierra` perdía el siguiente «atrás» después de cerrar una capa tocando; el cambio girado va a la columna izquierda; en tablet los 5 chips en una fila. Revisado en pruebas en el celular y la tablet reales, vertical y girados (pestaña de Chrome, no la app instalada) |
| F4 Avisos más cómodos | ✅ | 2026-11-03 | Arriba, sobre la barra superior (abajo están los botones de venta); compactos; 2,5 s, o 6 s con «Deshacer»; se quitan tocándolos o deslizándolos; uno reemplaza al otro; rechazos en rojo hasta tocarlos. `tests/e2e/avisos.spec.ts` (7 pruebas, también «no tapa la venta» en los cuatro tamaños). Revisado con toques reales por CDP en pruebas: tablet vertical y girada, celular girado. y celular vertical (después de que volviera su internet) |
| E2 IndexedDB | ✅ | 2026-11-03 | `src/app/memoria.ts` (Dexie: `pendientes` y `ajustes`), migración desde `localStorage` uniendo por `id`, respaldo en `localStorage` si IndexedDB no abre; Web Locks + `BroadcastChannel`: una pestaña con la conexión, relevo al cerrarla (ADR-11). `tests/e2e/memoria.spec.ts`. En pruebas, en los aparatos reales: migraron solas (el celular con 6 anotaciones sin enviar, llegaron una vez), dos pestañas con un solo candado y relevo |
| F y E2 en producción | ✅ | 2026-11-03 | Autorizado (sin uso a esa hora; producción con datos de prueba). Foto antes y después igual: `seq` 106, 7 cuentas, $ 108.500. Revisado en las apps instaladas: tablet vertical y horizontal y celular vertical; las dos migraron solas de `localStorage` a IndexedDB. Una cuenta «Revisión F» anotada y cobrada (`seq` 109). Celular girado en la app instalada: gira (768 × 301, diseño horizontal) al girarlo a mano; forzarlo por adb no sirve con la rotación automática apagada. Queda resuelto el pendiente de C |
| 13·1 App abre con la red colgada | ✅ | 2026-11-03 | Service Worker con 1,5 s de espera a la red; ver [13](13-revision-tecnica.md) |
| 13·2 Validación en el servidor | ✅ | 2026-11-03 | Zod en el Worker; lo dañado se rechaza con motivo sin tumbar el lote |
| E3 Foto del estado | ✅ | 2026-11-03 | Adelantada por [13](13-revision-tecnica.md) punto 3: proyección por cuenta (ADR-13); al despertar solo lo vigente |
| 13·4 Novedades desde `seq` | ✅ | 2026-11-03 | Al reconectar y en el respaldo HTTP, solo lo nuevo; cada operación llega con cómo quedó lo que tocó |
| E4 Auditoría | ✅ | 2026-11-03 | Pantalla «Auditoría» del administrador: el día en frases (`src/dominio/auditoria.ts`), lo delicado resaltado, filtro por persona, rechazos del día; índice por hora de la operación. «Personas y celulares» muestra conectados, versión y pendientes. Pruebas de dominio, servidor y e2e |
| Dominio propio | ✅ | 2026-11-03 | DNS del dominio del desarrollador pasado a Cloudflare (20 registros idénticos, solo DNS; servicios revisados). Producción y pruebas con dominio propio (en `negocio/despliegue.json`); `workers.dev` encendido hasta G. Probado en el celular real por el dominio de pruebas. En producción con E4, E3 y 13·1–4: fotos iguales (`seq` 109) |
| E5 Ensayo de restauración | ✅ | 2026-11-03 | `pnpm ensayo-restauracion`: último respaldo de R2 restaurado en un Worker local vacío y comprobado (operaciones, estado y foto de la proyección). Primer ensayo con el respaldo de producción del día: cuadró. Deja copia local del respaldo. Repetir cada trimestre |
| E6 e2e completo | ✅ | 2026-11-03 | Tabla de conflictos de 04 fila por fila y propiedad de convergencia (200 secuencias al azar con duplicados y reintentos); tres celulares en e2e (anotar sin señal mientras otro cobra; doble cobro). De paso: el doble cobro se rechaza con quién la cobró (antes se ignoraba en silencio) y la autoría de lo anotado sin señal se prueba con la sesión firmada (ADR-14) |
| E7 Documentación al día | ✅ | 2026-11-03 | Comprobada contra el código. 01: estado de cada requerimiento y RF-30 a RF-36 (petacos, «Otro», precio de cancha, cantidad, comida, sugerencias, a la vista). 02: «Otro», cancha, cambiar cantidad, menú de la persona, productos y personas. 03: árbol real, stack real y ADR-12 (atajos quitados y los que se quedan: sin Zod, Tailwind ni Workbox, estado recalculado). 05: modelo real (registro, tablas, 13 operaciones, `Estado`), el diseño original aparte. 06: secretos, respaldo completo, observabilidad. 07, README y AGENTS.md |
| G Base limpia definitiva | ✅ | 2026-11-04 | Autorizada. Base `reten-del-gorgojo-v3` con solo las 13 cuentas reales (las de B7) y el catálogo vigente; ensayada antes en pruebas y en la tablet; `pnpm importar-base` con verificación; importar apagado. Celulares y PIN se crean otra vez en la dirección propia (viven dentro de cada base). La dirección vieja lleva a la nueva. Detalle en `negocio/docs/09` |
| Abonos (urgente) | ✅ | 2026-11-08 | Pedido del negocio: pagar por partes. Abono por productos (pedida o unidades) o por valor, dividir entre 2–5, varios medios, deshacer un abono; detalle con abonos y productos pagados. Compatible con el registro (sin subir `VERSION_PROYECCION`). En producción el mismo día (arreglo urgente, excepción a la regla 14): foto igual antes y después (`seq` 124). Ver 04 «Abonos» |
| Comida y áreas | ✅ | 2026-11-08 | [14](14-comida-y-areas.md), ADR-15: una cuenta para barra y comida (un saldo, dos cajas), áreas por persona y por día, panel de comida con platos y notas, bebidas por despachar con aviso, crear la carta de una vez, comida solo cambia lo suyo. Juntar cuentas, chicos y adicionales en canchas, pedidas anuladas plegadas, totales a la vista, pedido rápido a la barra con detalles, dividir entre N contando quién ya pagó, poner quién pagó cada abono. En producción por partes, cada una con foto igual antes y después |
| Deudas | ✅ | 2026-11-08 | [15](15-deudas.md), ADR-16: pasar a deuda (todo, pedidas o valor), deudas a mano, pagos aparte de la caja (regla del negocio), panel de deudas; permiso «Administra deudas» sin ser administrador |
| Ajustes del 14 | ✅ | 2026-11-14 | Ocultar lo del otro panel desde la cabecera; detalle completo de lo fiado (cuentas viejas pedidas al servidor, `GET /api/cuentas`); sonido del aviso configurable (insistente por defecto, timbre de campana o ding-dong, pantalla despierta); cancelar un pedido a la barra. Arreglados de paso: pestaña «Bebidas» fuera de la pantalla en el celular girado y cabecera desbordada en celulares de 390 px. Siguiente etapa: [16](16-siguiente-etapa.md) |
