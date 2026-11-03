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

Abrir Claude Code en `Documents/Dev/Apps/BarraGorgojo` y pegar:

> Vamos a seguir con la Barra del Gorgojo. Lee `AGENTS.md` y `docs/12-plan-de-trabajo.md`
> (sobre todo la tabla de seguimiento y las fases F y G). Sigue con la **fase F** en orden
> (F1 a F4) y después E2. Producción hoy tiene datos de prueba: se puede probar ahí, pero
> pregúntame antes de cada despliegue a producción y antes de la fase G. Revisa cada cambio
> en el celular y la tablet reales si están conectados por USB. Al terminar cada paso,
> actualiza el estado en la tabla de seguimiento de 12.

Contexto útil para esa sesión:

- Aparatos reales (depuración USB): tablet en `negocio/docs/11`; probar en la **app
  instalada**, vertical y girada. Restaurar la rotación al terminar.
- Producción: `pnpm desplegar` (después de `pnpm build`). Antes y después, foto con
  `node scripts/admin.mjs .dev.vars.produccion foto migracion/<nombre>.json` y comparar con
  `pnpm resumen` (regla 2 de producción).
- Pruebas: `pnpm build && pnpm desplegar:pruebas`. URLs en `negocio/README.md`.
- Último estado comprobado: 87 pruebas de Vitest y 29 e2e pasando.

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
| C Teléfono | ✅ | 2026-11-02 | C1–C5 y C7–C12 en producción. Revisado en la tablet y el celular reales, en las apps instaladas: teclado (✓/Enter, barras escondidas al escribir, nada tapado), gesto «atrás» que cierra hojas y menús, y el diseño no salta al abrir el teclado. Pendiente menor: el celular girado en la app, cuando Android instale la app actualizada (manifiesto con `orientation: any`) |
| D Acceso por persona | ✅ | 2026-11-02 | En producción (ADR-10): celular vinculado con código, PIN cifrado (el administrador lo ve), bloqueo a los 5 intentos, permisos revisados en el servidor, anular con motivo, rechazos avisados. Personas en `negocio/catalogo.ts`. Secreto `PINES` puesto; celular del administrador vinculado |
| C2 · Auditoría «todo a la vista» | ✅ | 2026-11-02 | Hecha: ver `negocio/docs/11` «C2». `tests/e2e/a-la-vista.spec.ts` exige todo a la vista en los cuatro tamaños reales. Pedido del negocio (2026-11-02), después de D: en cada vista, sobre todo las de venta (anotar, detalle, cobrar, el día), las acciones deben verse sin deslizar y con tamaño adecuado según aparato y orientación; en el celular girado hoy hay que deslizar en cobrar y otros paneles. Auditar, documentar en `negocio/docs/11` y ajustar |
| E1 Cerrar el día | ✅ | 2026-11-03 | Operación `cerrar_jornada` (cualquiera; se puede repetir), días anteriores y CSV para el administrador. Ver 02 y 05. En producción el 2026-11-03 (autorizado; producción con datos de prueba) |
| F1 Billetes de Colombia | ⬜ | | |
| F2 Sugerir con cuánto pagan | ⬜ | | |
| F3 Mostrar al cliente en Cobrar | ⬜ | | |
| F4 Avisos más cómodos | ⬜ | | |
| E2 IndexedDB | ⬜ | | |
| E3 Foto del estado | ⬜ | | |
| E4 Auditoría | ⬜ | | |
| E5 Ensayo de restauración | ⬜ | | |
| E6 e2e completo | ⬜ | | |
| E7 Documentación al día | ⬜ | | |
| G Base limpia definitiva | ⬜ | | Al final de todo, con autorización. Producción tiene datos de prueba desde el 2026-11-03 |
