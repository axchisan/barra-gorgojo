# AGENTS.md — Barra del Gorgojo

Instrucciones para cualquier agente o persona que trabaje en este repositorio.

## Contexto

Sistema interno de cuentas para la barra (cerveza y bebidas) del **Retén del Gorgojo**,
restaurante y sitio de tejo en Guavatá, Santander. Reemplaza el cuaderno. Varias
personas anotan a la vez desde sus celulares, con o sin señal.

Es un proyecto **separado** del sitio web (`../ElrentendelGorgojo`). Comparten marca y
convenciones, no código ni base de datos.

Lee `docs/00-vision-y-problema.md` antes de cualquier decisión de producto y
`docs/04-sincronizacion-y-fuera-de-linea.md` antes de tocar datos o red.

## Estado

**Versión 0.1 en producción** desde el 2026-10-04, usada de verdad desde el 2026-11-01.
Se construyó con atajos para salir rápido. **El trabajo actual sigue
`docs/12-plan-de-trabajo.md`**, que sale de la auditoría `negocio/docs/09-auditoria-2026-11-02.md` (privada).
Antes de tocar producción, leer las «Reglas para trabajar en producción» de 12.

## Reglas no negociables

0. **Nunca cambiar en el código el precio de un producto del catálogo base ya usado**, y
   todo cambio en `src/dominio/estado.ts` debe dar el mismo estado al aplicar el registro
   viejo. Ver `docs/04` «Precio fijado por el servidor». En producción el catálogo base
   está vacío desde el 2026-11-02 (todo el catálogo vive en el registro, ADR-08); la regla
   sigue valiendo para cualquier negocio que siembre su catálogo en el código.

1. **Más rápido que el cuaderno o no sirve.** Anotar una ronda: 3 toques en el caso
   común. Cualquier cambio que agregue un toque al flujo principal se justifica por
   escrito en `docs/02-flujos-y-experiencia.md`.
2. **La interfaz nunca espera la red.** Toda operación se guarda en IndexedDB y se
   muestra antes de enviarse.
3. **Ninguna anotación se pierde ni se duplica.** Operaciones inmutables con `id`
   generado en el celular; el servidor es idempotente por `id`.
4. **Nada se edita ni se borra:** se corrige con una operación nueva (anular, deshacer,
   reabrir). Nunca `DELETE` ni `UPDATE` sobre el registro de operaciones.
5. **Una sola función de reglas** (`src/dominio/aplicar.ts`), pura y compartida entre
   celular y servidor. El total oficial es el del servidor.
6. **Cada regla de conflicto de `docs/04` tiene su prueba.** Si se agrega una regla, se
   agrega su prueba en el mismo commit.
7. **Precios en enteros de pesos colombianos.** Nunca `float`, nunca decimales. Las
   líneas guardan copia del nombre y el precio.
8. **Nunca descartar en silencio** una operación rechazada: se registra y se avisa.
9. **Las bebidas de mesas de comida** se anotan en la barra y la cuenta se cierra como
   «cobrada aquí» o «pasada a comida», nunca sin escoger.
10. **Usable con una mano y legible al sol.** Botones principales de 56 px o más,
    contraste 7:1 en totales. Solo modo claro.
11. **Nunca inventar datos del negocio.** Catálogo y precios salen de
    `negocio/docs/08-datos-pendientes.md`; lo demás, de
    `../ElrentendelGorgojo/docs/11-ficha-del-negocio.md`.
12. **Español de Colombia con tildes correctas** en todo: interfaz, código,
    comentarios, archivos, commits. En la interfaz, palabras del oficio, no técnicas:
    lo que el código llama **ronda** en pantalla se dice **«chico»** en cuentas de
    cancha y **«pedida»** en las demás.
13. **Nada de credenciales en el repositorio.** Secretos con `wrangler secret`.
14. **No desplegar a producción en horario de atención** (L-V 7 a. m.–9 p. m., S-D
    9 a. m.–11 p. m.) salvo arreglo urgente.
15. **No tocar recursos ajenos**: buckets `axchisan-media` y `elretendelgorgojo-media`,
    proyectos de Neon y Vercel.
16. **El repositorio es público.** Nada del negocio fuera de `negocio/` (repositorio
    privado aparte, ignorado por git): ni precios reales, ni nombres de personas, ni
    cifras, ni direcciones de producción, ni capturas con datos. Las pruebas usan
    `negocio.ejemplo/`.

## Stack

Vite · React 19 · TypeScript estricto · Tailwind 4 · Dexie (IndexedDB) · Workbox ·
Cloudflare Workers · Durable Objects con SQLite · R2 · Zod · Vitest · Playwright ·
pnpm 11. Detalles y porqués en `docs/03-arquitectura.md`.

## Convenciones

- Carpetas y archivos en español: `src/dominio`, `src/app/pantallas`, `src/servidor`.
- `src/dominio` no importa nada de navegador ni de Workers.
- Un esquema de Zod por tipo de operación, en `src/dominio/operaciones.ts`.
- Horas en milisegundos UTC; se muestran en `America/Bogota`. La jornada cambia a las
  5:00 a. m.
- Commits en español, en imperativo: `agrega cobro con cambio`.

## Antes de dar algo por terminado

```bash
pnpm verificar      # lint + tipos + pruebas unitarias y del Durable Object
pnpm test:e2e       # varios celulares, desconexión y reconexión
```

## Documentación

Toda decisión que cambie `docs/03-arquitectura.md` se registra como ADR nuevo, con su
porqué. La documentación se actualiza en el mismo commit que el código.
