# Barra del Gorgojo

Sistema de cuentas de la barra y la comida del **Retén del Gorgojo** (Guavatá,
Santander). Reemplaza el cuaderno: se abre una cuenta por grupo, persona, mesa o cancha de
tejo, se anotan las pedidas con pocos toques, se ve el total al instante y se cobra al
final, todo o por partes. Funciona en cualquier celular, **sin internet si hace falta**, y todos los
celulares ven lo mismo.

## Estado

**En uso** desde el 2026-10-04; en el local desde el 2026-11-01. Al **2026-11-15**:
fases A a G del [plan de trabajo](docs/12-plan-de-trabajo.md) hechas, más comida y
áreas, despacho, abonos, juntar cuentas, deudas y editar pedidas. **Para trabajar en el código, empezar
por [18 · Roadmap desde el 2026-11-15](docs/18-roadmap-2026-11.md)** (y la deuda técnica en
[16](docs/16-siguiente-etapa.md)).

- **Barra:** cuentas de grupo, persona, mesa y cancha; pedidas y chicos (y adicionales)
  con un toque por producto; repetir; petacos; «Otro»; precio de cancha.
- **Comida:** panel propio con platos y notas, la misma cuenta que la barra (un saldo, dos
  cajas); bebidas pedidas desde comida y pedido rápido a la barra, con aviso sonoro hasta
  despacharlas.
- **Cobro:** efectivo con sugerencias de billetes y cambio, Nequi o Breve, mostrar al
  cliente; abonos por productos, pedida o valor; dividir entre varios; juntar cuentas;
  pasar a deuda.
- **Corregir:** cambiar la cantidad, anular, agregar a una pedida ya anotada o cambiar un
  producto por otro; todo queda en la auditoría, nada se borra.
- **Deudas:** quién debe y cuánto, el detalle de lo fiado, pagos aparte de la caja.
- **Administración:** el día con cierre por caja, días anteriores y CSV; auditoría;
  personas con PIN, áreas y permisos; productos y platos desde la app.
- Tiempo real entre celulares y trabajo sin señal.

Qué está hecho de cada requerimiento: [01](docs/01-requerimientos.md).

```bash
pnpm install
pnpm dev          # compila y levanta en http://localhost:8787 (llave de instalación local: prueba)
pnpm verificar    # tipos + pruebas del dominio y del servidor (Worker real)
pnpm test:e2e     # Playwright: varios celulares y sin señal, con el catálogo de ejemplo
pnpm recorrido <carpeta>   # captura y HTML de todas las pantallas (con pnpm dev corriendo)
pnpm resumen <respaldo|foto.json>    # cuentas, sumas y catálogo, para comparar antes y después
pnpm ensayo-restauracion   # baja el último respaldo de R2 y lo restaura en local, comprobado (cada trimestre)
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
entrar (ADR-08). Las personas viven en el Durable Object desde la fase D; las del
archivo son solo la semilla de una base nueva.

## En una línea por tema

| Tema | Decisión |
|---|---|
| Qué es | Una app web instalable (PWA) aparte del sitio público, para uso interno |
| Quién la usa | Varias personas a la vez, cada una desde su celular |
| Sin internet | Se anota y se cobra igual; se sincroniza sola al volver la señal |
| Tiempo real | Lo que anota un celular aparece en los otros en uno o dos segundos |
| Cobro | Al final, todo o por partes. Efectivo, Nequi o Breve, con cuadre de caja por área al cerrar el día; o a deuda |
| Comida y barra | **Una sola cuenta** por mesa o grupo, con un saldo: la cobra cualquiera de las dos cajas y cada pago guarda la suya (ADR-15) |
| Deudas | Lo fiado es venta del día en que se fió; los pagos de deudas van aparte de la caja (ADR-16) |
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
| [12 · Plan de trabajo](docs/12-plan-de-trabajo.md) | **Fases A–G en orden, seguimiento, reglas para producción y cómo iniciar la sesión** |
| [13 · Revisión técnica](docs/13-revision-tecnica.md) | El stack planeado contra el que corre, con medidas, y qué cambiar y cuándo |
| [14 · Comida y áreas](docs/14-comida-y-areas.md) | Una cuenta para barra y comida, áreas por persona, despacho de bebidas, dos cajas |
| [15 · Deudas](docs/15-deudas.md) | Fiado: pasar a deuda, deudas a mano, pagos aparte de la caja, permiso |
| [16 · Estado y siguiente etapa](docs/16-siguiente-etapa.md) | Qué había el 2026-11-15, deuda técnica, push, QR y NFC, rendimiento, robustez |
| [17 · Accesos de empleados](docs/17-accesos-de-empleados.md) | Permisos de vista (el día, otros días) y horario de acceso por persona |
| [18 · Roadmap desde el 2026-11-15](docs/18-roadmap-2026-11.md) | **El plan por fases**: urgente, pruebas, portátil, robustez, push, QR/NFC con el sitio web, impresora térmica, gestión |
| [19 · Plan de pruebas](docs/19-plan-de-pruebas.md) | Casillas para probar en el celular, la tablet y el portátil |

Los documentos 08 a 11 (datos del negocio, auditoría, migración y revisión en teléfono
con capturas) tienen datos reales y viven en `negocio/docs/`.

## Cómo leer esto

**00** para entender el problema, **02** para ver cómo se usa y **04** para entender
por qué funciona sin internet. Los demás son de consulta.

**Para trabajar en el código hoy: 16**, y las reglas de producción de 12.

Los datos generales del negocio (dirección, horarios, formas de pago) salen de
`../ElrentendelGorgojo/docs/11-ficha-del-negocio.md`. **El catálogo y los precios de las
bebidas salen de `negocio/docs/08-datos-pendientes.md`** hasta que el sistema exista;
desde entonces, del propio sistema.

## Licencia

[MIT](LICENSE). El código es libre; los datos de cada negocio (`negocio/`) no hacen parte del repositorio.
