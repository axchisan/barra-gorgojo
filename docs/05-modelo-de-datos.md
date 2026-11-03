# 05 · Modelo de datos

Todo vive en el **SQLite del Durable Object** (ver [03](03-arquitectura.md), ADR-01).
Hay dos clases de tablas:

- **El registro de operaciones**, que es la verdad. Solo se agregan filas.
- **Las proyecciones** (cuentas, rondas, líneas, pagos), que son el resultado de
  aplicar las operaciones. Existen para consultar rápido. Se pueden reconstruir desde
  cero recorriendo el registro, y hay una prueba que lo hace.

Convenciones: nombres en español y `snake_case`, identificadores `TEXT` con UUID v7
(ordenables por tiempo), horas en milisegundos UTC (`INTEGER`) y se muestran en
`America/Bogota`, **dinero en enteros de pesos** con sufijo `_cop`.

## Registro de operaciones

```sql
CREATE TABLE operaciones (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,  -- orden oficial
  id              TEXT NOT NULL UNIQUE,               -- generado en el celular: idempotencia
  tipo            TEXT NOT NULL,
  datos           TEXT NOT NULL,                      -- JSON validado con Zod
  persona_id      TEXT NOT NULL REFERENCES personas(id),
  dispositivo_id  TEXT NOT NULL REFERENCES dispositivos(id),
  creada_en       INTEGER NOT NULL,                   -- hora del celular, acotada
  recibida_en     INTEGER NOT NULL,                   -- hora del servidor
  jornada_id      TEXT NOT NULL REFERENCES jornadas(id),
  marcas          TEXT                                -- JSON: ["precio_revisar", "persona_inactiva", …]
);

CREATE TABLE operaciones_rechazadas (
  id              TEXT PRIMARY KEY,
  tipo            TEXT,
  datos           TEXT,
  motivo          TEXT NOT NULL,
  dispositivo_id  TEXT,
  recibida_en     INTEGER NOT NULL
);
```

## Proyecciones

```sql
CREATE TABLE cuentas (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('grupo', 'persona', 'mesa', 'cancha', 'rapida')),
  mesa_numero      INTEGER,
  cancha           TEXT CHECK (cancha IN ('1', '2', 'pequena')),
  estado           TEXT NOT NULL CHECK (estado IN
                     ('abierta', 'cobrada', 'pasada_a_comida', 'unida', 'anulada')),
  unida_a          TEXT REFERENCES cuentas(id),
  total_cop        INTEGER NOT NULL DEFAULT 0,      -- suma de líneas no anuladas
  pagado_cop       INTEGER NOT NULL DEFAULT 0,      -- suma de pagos no deshechos
  comida_cobrada   INTEGER NOT NULL DEFAULT 0,      -- 1 cuando la cocina la marcó cobrada
  abierta_en       INTEGER NOT NULL,
  abierta_por      TEXT NOT NULL REFERENCES personas(id),
  ultima_actividad INTEGER NOT NULL,
  cerrada_en       INTEGER,
  reabierta        INTEGER NOT NULL DEFAULT 0,      -- 1 si se reabrió por anotaciones tardías
  jornada_id       TEXT NOT NULL REFERENCES jornadas(id),
  CHECK (tipo <> 'mesa' OR mesa_numero IS NOT NULL),
  CHECK (tipo <> 'cancha' OR cancha IS NOT NULL),
  CHECK (estado <> 'unida' OR unida_a IS NOT NULL),
  CHECK (estado <> 'pasada_a_comida' OR tipo = 'mesa')
);
CREATE INDEX cuentas_vivas ON cuentas(estado, ultima_actividad);

CREATE TABLE rondas (
  id          TEXT PRIMARY KEY,
  cuenta_id   TEXT NOT NULL REFERENCES cuentas(id),
  numero      INTEGER NOT NULL,                     -- 1, 2, 3… dentro de la cuenta
                                                    -- en pantalla: «chico 3» o «pedida 3»
  nota        TEXT,
  persona_id  TEXT NOT NULL REFERENCES personas(id),
  creada_en   INTEGER NOT NULL,
  op_seq      INTEGER NOT NULL REFERENCES operaciones(seq)
);

CREATE TABLE lineas (
  id                  TEXT PRIMARY KEY,
  ronda_id            TEXT NOT NULL REFERENCES rondas(id),
  cuenta_id           TEXT NOT NULL REFERENCES cuentas(id),  -- desnormalizado; cambia al unir
  producto_id         TEXT NOT NULL REFERENCES productos(id),
  nombre              TEXT NOT NULL,                -- copia al momento de anotar
  precio_unitario_cop INTEGER NOT NULL CHECK (precio_unitario_cop >= 0),
  cantidad            INTEGER NOT NULL CHECK (cantidad > 0),
  anulada_en          INTEGER,
  anulada_por         TEXT REFERENCES personas(id),
  motivo_anulacion    TEXT
);
CREATE INDEX lineas_cuenta ON lineas(cuenta_id);

CREATE TABLE pagos (
  id            TEXT PRIMARY KEY,
  cuenta_id     TEXT NOT NULL REFERENCES cuentas(id),
  medio         TEXT NOT NULL CHECK (medio IN
                  ('efectivo', 'nequi', 'breve', 'comida')),
  monto_cop     INTEGER NOT NULL CHECK (monto_cop > 0),
  recibido_cop  INTEGER,                            -- solo efectivo: para el cambio
  persona_id    TEXT NOT NULL REFERENCES personas(id),
  creado_en     INTEGER NOT NULL,
  deshecho_en   INTEGER,
  jornada_id    TEXT NOT NULL REFERENCES jornadas(id),
  CHECK (medio <> 'efectivo' OR recibido_cop IS NULL OR recibido_cop >= monto_cop)
);
```

«Pasar a comida» se registra como un **pago con medio `comida`**. Así las sumas del día
funcionan sin casos especiales: lo cobrado en la barra es todo menos `comida`, y lo
pasado a comida se ve aparte.

### Saldo y estado

- `saldo = total_cop − pagado_cop`.
- Una cuenta queda `cobrada` (o `pasada_a_comida`) solo cuando el saldo llega a cero.
- Si después llega una ronda, el saldo sube y la cuenta vuelve a `abierta` con
  `reabierta = 1`. Así la regla de [04](04-sincronizacion-y-fuera-de-linea.md) sale sola
  de la aritmética.

## Catálogo

```sql
CREATE TABLE productos (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,                      -- «Coca-Cola 1,25 L»
  nombre_corto  TEXT NOT NULL,                      -- para el botón: «COCA 1¼»
  categoria     TEXT NOT NULL CHECK (categoria IN
                  ('cerveza', 'gaseosa', 'jugo', 'agua', 'licor', 'cigarrillo', 'otro')),
  precio_libre  INTEGER NOT NULL DEFAULT 0,         -- 1: se escribe el valor al anotar (mecato)
  color         TEXT NOT NULL,                      -- hex del botón
  orden         INTEGER NOT NULL,                   -- posición fija en la cuadrícula
  activo        INTEGER NOT NULL DEFAULT 1,
  agotado       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE precios (
  producto_id    TEXT NOT NULL REFERENCES productos(id),
  precio_cop     INTEGER NOT NULL CHECK (precio_cop >= 0),
  vigente_desde  INTEGER NOT NULL,
  definido_por   TEXT NOT NULL REFERENCES personas(id),
  PRIMARY KEY (producto_id, vigente_desde)
);
```

Productos no se borran: se desactivan. Las líneas viejas siguen apuntando a ellos.

Un producto con `precio_libre = 1` no tiene filas en `precios`: el valor lo trae cada
línea. Uno normal sin precio vigente no se puede activar; así se siembran el aguardiente
y la Club Colombia, inactivos hasta tener precio.

Los medios de pago son una lista corta en el código y en el `CHECK`. Agregar uno (el
datáfono, Bancolombia) es una migración pequeña.

## Personas, dispositivos, jornadas

```sql
CREATE TABLE personas (
  id           TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  color        TEXT NOT NULL,
  rol          TEXT NOT NULL CHECK (rol IN ('administrador', 'operador')),
  pin_hash     TEXT NOT NULL,                       -- PBKDF2 con sal
  activa       INTEGER NOT NULL DEFAULT 1,
  creada_en    INTEGER NOT NULL
);

CREATE TABLE dispositivos (
  id              TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,                    -- «Celular de la barra»
  token_hash      TEXT NOT NULL UNIQUE,
  vinculado_por   TEXT NOT NULL REFERENCES personas(id),
  vinculado_en    INTEGER NOT NULL,
  ultimo_contacto INTEGER,
  version_app     TEXT,
  revocado_en     INTEGER
);

CREATE TABLE codigos_vinculacion (
  codigo_hash  TEXT PRIMARY KEY,
  creado_por   TEXT NOT NULL REFERENCES personas(id),
  vence_en     INTEGER NOT NULL,
  usado_en     INTEGER
);

CREATE TABLE intentos_pin (
  persona_id      TEXT NOT NULL,
  dispositivo_id  TEXT NOT NULL,
  fallidos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER,
  PRIMARY KEY (persona_id, dispositivo_id)
);

CREATE TABLE jornadas (
  id                  TEXT PRIMARY KEY,
  fecha               TEXT NOT NULL UNIQUE,         -- 2026-10-04, en hora de Colombia
  abierta_en          INTEGER NOT NULL,
  cerrada_en          INTEGER,
  cerrada_por         TEXT REFERENCES personas(id),
  efectivo_contado_cop INTEGER,
  notas               TEXT
);
```

### La jornada

- Se abre **sola** con la primera operación del día.
- El día cambia a las **5:00 a. m.** hora de Colombia, no a medianoche: el local cierra
  a las 11 p. m., pero una cuenta que se cobra a las 12:30 a. m. pertenece a la noche
  anterior, no al día siguiente.
- Cerrar la jornada no bloquea nada: si a las 11:30 p. m. llega un último cobro, entra
  en esa jornada y el cierre muestra la diferencia.
- Una cuenta abierta al cambiar de jornada **sigue abierta**; su venta cuenta en la
  jornada en que se anotó cada ronda.

## Reglas que hace cumplir la base

Además de las del código, la base rechaza:

- Precios o cantidades negativas o con decimales (son `INTEGER`).
- Una mesa sin número.
- Una cuenta unida sin destino.
- Pasar a comida algo que no es mesa.
- Cambio negativo en efectivo.
- Dos operaciones con el mismo `id`.

## Lo que se guarda en el celular

Copia parcial, en IndexedDB:

| Tabla local | Contenido |
|---|---|
| `confirmado` | Cuentas vivas y de la jornada con sus rondas, líneas y pagos; último `seq` |
| `pendientes` | Operaciones sin confirmar, en orden |
| `catalogo` | Productos activos y precios de las últimas 48 horas |
| `personas` | Personas activas con `pin_hash` (para entrar sin señal) |
| `sesion` | Persona actual y dispositivo |

Nada de jornadas anteriores: eso se consulta con señal.

## Respaldo

El Cron diario exporta a R2 un JSON con **el registro de operaciones de la jornada** y
una foto de las proyecciones. Con el registro completo se puede reconstruir todo, así
que el respaldo es pequeño y suficiente. Ver [06](06-infraestructura.md).

## Cómo quedó la jornada (E1, 2026-11-02)

No hay tabla `jornadas`: el cierre es una operación más del registro,
`cerrar_jornada { fecha, contado, notas? }`, y el estado guarda en `jornadas[fecha]` cada
cierre con quién, cuándo, lo contado y el efectivo esperado al aplicarla. El resumen de un
día (vendido, por medio de pago, comida, por producto) lo calcula
`src/dominio/jornada.ts` con las cuentas; el celular lo hace con lo que tiene (36 horas)
y el servidor, para los días anteriores y el CSV, con el estado completo
(`/api/admin/jornadas` y `/api/admin/jornadas/csv?fecha=`).
