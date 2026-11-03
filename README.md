# Barra del Gorgojo

Sistema de cuentas para el área de cerveza y bebidas del **Retén del Gorgojo**
(Guavatá, Santander). Reemplaza el cuaderno: se abre una cuenta por grupo, persona o
mesa o cancha de tejo, se anotan las pedidas con pocos toques, se ve el total al instante y se cobra al
final. Funciona en cualquier celular, **sin internet si hace falta**, y todos los
celulares ven lo mismo.

## Estado

**Versión 0.1 en uso** desde el 2026-10-04.

> **Trabajo en curso:** pulir la versión de emergencia hasta lo planeado. Empezar por
> [12 · Plan de trabajo](docs/12-plan-de-trabajo.md).

Cuentas, pedidas y chicos, repetir, mecato de valor libre, cobro con cambio, mesas que
se pasan a comida, lista de cocina, «el día» con cuadre de caja, tiempo real entre
celulares y trabajo sin señal. Lo que se simplificó para salir rápido está en
[07 · Roadmap](docs/07-roadmap.md), sección «Versión 0.1».

```bash
pnpm install
pnpm dev          # compila y levanta en http://localhost:8787 (clave local: prueba)
pnpm verificar    # tipos + pruebas del dominio y del servidor (Worker real)
pnpm test:e2e     # Playwright: varios celulares y sin señal, con el catálogo de ejemplo
pnpm recorrido <carpeta>   # captura y HTML de todas las pantallas (con pnpm dev corriendo)
pnpm resumen <respaldo|foto.json>    # cuentas, sumas y catálogo, para comparar antes y después
pnpm migrar <corte.json> <regla.json> # depura un registro para una base limpia (docs/04 «Cambio de base»)
node scripts/admin.mjs <claves> respaldo|foto|importar <archivo>   # rutas de administración
pnpm desplegar:pruebas   # compila y publica en el entorno de pruebas
pnpm desplegar    # compila y publica en producción (ver reglas en docs/12)
```

**Acceso** (ADR-10): cada celular se vincula una vez con un código de 6 dígitos que da el
administrador en «Personas y celulares», y cada persona entra con su PIN de 4 números.
Secretos del Worker (`wrangler secret put …`): `FIRMA` (sesiones), `PINES` (cifra los
PIN) y `CLAVE`, que ya no es una clave para entrar sino la **llave de instalación**: solo
sirve para sacar desde la terminal el código del primer celular:

```bash
curl -X POST https://…/api/instalacion/codigo -H "x-llave: $CLAVE"
```

## Datos del negocio

Este repositorio es **público** y no lleva datos de ningún negocio: ni precios reales, ni
personas, ni cifras de venta, ni direcciones de producción. Eso vive en la carpeta
`negocio/`, ignorada por git (en el caso del Retén del Gorgojo, es un repositorio privado
aparte clonado ahí).

| Archivo | Qué es |
|---|---|
| `negocio/catalogo.ts` | Catálogo base y personas. Se importa como `#negocio` (ver `imports` en `package.json`) |
| `negocio.ejemplo/catalogo.ts` | Catálogo de ejemplo, inventado. Es también el catálogo fijo de las pruebas |
| `negocio/docs/` | Documentos con datos del negocio: precios, auditorías, migraciones, capturas |

En un clon nuevo, `pnpm install` (o `pnpm preparar`) copia el ejemplo a
`negocio/catalogo.ts` si no existe. Después, los precios se cambian **desde la app**, no
en el archivo: el registro se recalcula con el catálogo base (regla 0 de `AGENTS.md`).

El catálogo de `negocio/catalogo.ts` es solo la semilla de una base nueva: en cuanto el
administrador cambia algo desde la app, queda en el registro. En el Retén del Gorgojo
está vacío: todo el catálogo vive en la base de datos y llega al celular después de
entrar (ADR-08). Las personas salen del código con la fase D de
[12 · Plan de trabajo](docs/12-plan-de-trabajo.md).

## En una línea por tema

| Tema | Decisión |
|---|---|
| Qué es | Una app web instalable (PWA) aparte del sitio público, para uso interno |
| Quién la usa | Varias personas a la vez, cada una desde su celular |
| Sin internet | Se anota y se cobra igual; se sincroniza sola al volver la señal |
| Tiempo real | Lo que anota un celular aparece en los otros en uno o dos segundos |
| Cobro | Al final, la cuenta completa. Efectivo, Nequi o Breve, con cuadre de caja al cerrar el día |
| Bebidas de mesas de comida | Se anotan en la barra como cuenta de mesa; al final se cobran **en la barra o se pasan a la cuenta de comida**, y queda registrado cuál de las dos |
| Infraestructura | Cloudflare Workers + Durable Objects (SQLite). Costo esperado: $ 0 |

## Documentación

| Documento | Contenido |
|---|---|
| [00 · Visión y problema](docs/00-vision-y-problema.md) | Qué pasa hoy con el cuaderno, qué debe resolver el sistema y qué no |
| [01 · Requerimientos](docs/01-requerimientos.md) | Funcionales y no funcionales, con identificadores y prioridad |
| [02 · Flujos y experiencia](docs/02-flujos-y-experiencia.md) | Pantallas, recorridos contados en toques, reglas de diseño |
| [03 · Arquitectura](docs/03-arquitectura.md) | Stack, componentes, seguridad y ADR con sus porqués |
| [04 · Sincronización y fuera de línea](docs/04-sincronizacion-y-fuera-de-linea.md) | El corazón técnico: operaciones, protocolo y conflictos |
| [05 · Modelo de datos](docs/05-modelo-de-datos.md) | Tablas, operaciones y reglas |
| [06 · Infraestructura](docs/06-infraestructura.md) | Servicios, entornos, respaldos, costos y límites |
| [07 · Roadmap](docs/07-roadmap.md) | Fases, entregables, adopción y riesgos |
| [12 · Plan de trabajo](docs/12-plan-de-trabajo.md) | **Fases A–E en orden, reglas para producción y cómo iniciar la sesión** |

Los documentos 08 a 11 (datos del negocio, auditoría, migración y revisión en teléfono
con capturas) tienen datos reales y viven en `negocio/docs/`.

## Cómo leer esto

**00** para entender el problema, **02** para ver cómo se usa y **04** para entender
por qué funciona sin internet. **Para trabajar en el código hoy: 12** (y, si se tiene
acceso, `negocio/docs/09`). Los demás son de consulta.

Los datos generales del negocio (dirección, horarios, formas de pago) salen de
`../ElrentendelGorgojo/docs/11-ficha-del-negocio.md`. **El catálogo y los precios de las
bebidas salen de `negocio/docs/08-datos-pendientes.md`** hasta que el sistema exista;
desde entonces, del propio sistema.

## Licencia

[MIT](LICENSE). El código es libre; los datos de cada negocio (`negocio/`) no hacen parte del repositorio.
