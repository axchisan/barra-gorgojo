# 06 · Infraestructura

## Servicios

| Pieza | Servicio | Plan | Para qué |
|---|---|---|---|
| App, API y tiempo real | **Cloudflare Workers** + **Durable Objects (SQLite)** | Gratuito | Todo el sistema en un solo Worker |
| Respaldos | **Cloudflare R2** | Gratuito (10 GB) | Bucket propio: `barra-gorgojo-respaldos` |
| Tarea diaria | **Cron Triggers** de Workers | Gratuito | Respaldo y mantenimiento |
| Código | **GitHub**, repo `axchisan/barra-gorgojo` (público); datos del negocio en un repo privado aparte, clonado en `negocio/` | | |
| Dominio | `*.workers.dev` al empezar; `barra.elretendelgorgojo.com` después | | Ver «Dominio» |

Cuenta de Cloudflare: la personal del desarrollador, ya autenticada en su máquina. La
pregunta sobre la titularidad está en `negocio/docs/08` (privado).

**No se toca nada existente**: ni el bucket `axchisan-media`, ni el bucket
`elretendelgorgojo-media` del sitio, ni los proyectos de Neon y Vercel.

## Límites del plan gratuito y consumo estimado

Límites diarios de Durable Objects con SQLite en el plan gratuito de Workers
(consultados el 2026-10-04 en la documentación de Cloudflare; verificarlos de nuevo al
implementar):

| Recurso | Límite diario | Consumo estimado en un día lleno | Holgura |
|---|---|---|---|
| Solicitudes | 100.000 | ~2.000 | 50× |
| Filas escritas | 100.000 | ~5.000 | 20× |
| Filas leídas | 5.000.000 | ~50.000 | 100× |
| Duración | 13.000 GB-s | Bajo: hibernación con WebSocket | amplia |
| Almacenamiento total | 5 GB | ~50 MB al año | amplia |

Cómo se estimó el día lleno: 300 rondas y cobros, 4 celulares conectados 16 horas, un
latido cada 25 segundos por celular. Los mensajes entrantes por WebSocket se cuentan a
razón de 20 por solicitud, y un objeto inactivo con la API de hibernación no cobra
duración.

**Costo esperado: $ 0.** Si algún día se pasara del gratuito, el plan pago de Workers
cuesta 5 dólares al mes y sobra por mucho.

## Entornos

| Entorno | Worker | Datos | Uso |
|---|---|---|---|
| Local | `wrangler dev` | SQLite local, se borra cuando se quiera | Desarrollo |
| Pruebas | `barra-gorgojo-pruebas` (`--env pruebas`) | Durable Object propio (desde el ensayo de migración, base `reten-del-gorgojo-v2` con copia de los datos reales). Respaldos en `barra-gorgojo-pruebas-respaldos`, **sin Cron** | Probar en celulares reales antes de pasar al local, ensayar migraciones y capacitar |
| Producción | `barra-gorgojo` | El real | El negocio |

Los dos entornos remotos tienen **Durable Objects separados**: imposible que una prueba
anote en la caja real. Las personas y dispositivos también son por entorno (la misma
lección de las cuentas por rama del sitio).

Cada entorno tiene sus secretos (`CLAVE`, `FIRMA`). Los de pruebas se guardan en
`.dev.vars.pruebas` (ignorado por git), que también usa `pnpm dev:pruebas` en local:

```bash
wrangler secret put CLAVE --env pruebas
wrangler secret put FIRMA --env pruebas
```

Las direcciones de cada entorno están en el repositorio privado del negocio
(`negocio/README.md`).

## Despliegue

```bash
pnpm verificar            # lint + tipos + pruebas
pnpm desplegar:pruebas    # wrangler deploy --env pruebas
pnpm desplegar            # wrangler deploy (producción)
```

- Las migraciones del SQLite del Durable Object corren **dentro del objeto** al
  arrancar, versionadas y en orden; nunca destructivas sin un respaldo del día.
- **Nunca desplegar a producción en horario de atención** salvo arreglo urgente. Un
  despliegue reinicia el Durable Object y corta los WebSockets por un instante; los
  celulares reconectan solos y no se pierde nada, pero no hay razón para hacerlo un
  sábado a las 4 p. m.
- La app sabe su versión. Si el servidor exige una versión mínima mayor, el celular
  muestra «Actualizar» **solo cuando no tiene pendientes**, para no perder nada en la
  recarga.

## Dominio

Para empezar, la dirección `barra-gorgojo.<subdominio>.workers.dev` es suficiente: se
instala una vez en la pantalla de inicio de cada celular y nadie la vuelve a escribir.

Cuando se compre `elretendelgorgojo.com`, hay dos caminos para `barra.`:

1. **Llevar el DNS del dominio a Cloudflare** (gratis) y apuntar el sitio a Vercel
   desde allí. Permite usar `barra.elretendelgorgojo.com` como dominio propio del Worker
   con un clic. Recomendado.
2. Dejar el DNS en otro proveedor y seguir con `workers.dev`.

Cambiar de dirección después obliga a reinstalar la app en cada celular y a vincularlos
de nuevo, porque la memoria local es por dirección. **Conviene decidirlo antes de la
puesta en marcha**, no después.

## Respaldos

Tres capas, de la más inmediata a la más lejana:

1. **Recuperación a un punto en el tiempo** del SQLite de Durable Objects: Cloudflare
   permite devolver el objeto a cualquier momento de los últimos 30 días.
2. **Exportación diaria a R2** a las 5:30 a. m. (después del corte de jornada): el
   registro de operaciones del día y una foto de las proyecciones, en JSON comprimido.
   Se conservan 365 días con una regla de ciclo de vida del bucket (`respaldos-365-dias`,
   activa desde el 2026-11-02). El respaldo es de la base vigente (`vars.BASE`).
3. **Exportación manual a CSV** desde la app (fase 2), que el negocio puede guardar
   donde quiera.

Y una cuarta, involuntaria: cada celular tiene la copia de la jornada en curso. Si el
servidor desapareciera un sábado a mediodía, el día no se pierde.

**Prueba de restauración**: una vez por trimestre se reconstruye el entorno de pruebas
desde un respaldo de R2. Un respaldo que nunca se restauró no es un respaldo.

## Observabilidad

- **Workers Logs** para errores y operaciones rechazadas, y `wrangler tail` en vivo.
- Pantalla de administrador con: celulares conectados, última vez que se vio cada uno,
  versión de la app, pendientes reportados por cada celular y operaciones rechazadas.
- El Cron diario revisa que haya habido respaldo el día anterior y deja un aviso en la
  pantalla de administrador si no.

## Lo que cada celular necesita

- Android 8 o posterior con Chrome actualizado, o iPhone con iOS 16.4 o posterior.
- La app **instalada en la pantalla de inicio**. En iPhone esto no es opcional: Safari
  puede borrar los datos de sitios no instalados que no se usan en siete días.
- Recomendado: **un celular o tableta fijo en la barra, siempre conectado al cargador**,
  que es el que lleva el peso del día. Los demás celulares son de apoyo.
