# 20 · Pedidos de los clientes por QR (2026-11-15)

Fase 5 de [18](18-roadmap-2026-11.md), la parte de la barra: el cliente pide desde la mesa
o la cancha con un código QR (o una etiqueta NFC con el mismo enlace), y el pedido llega
al personal como **solicitud** que alguien acepta (todo o una parte) o rechaza con motivo.
Hecho y probado en el entorno de pruebas; **en producción queda apagado** hasta que el
negocio responda las preguntas de 18 §5.4 y se impriman los QR.

## Cómo funciona

```
QR de la Mesa 4 ──► /m/<código> (página del cliente, sin PIN ni datos personales)
                     carta · «＋» · «Pedir»
                        │  POST /api/publico/pedido
                        ▼
                     operación «solicitud» en el registro ──► aviso «📱 Pedido por QR» con timbre
                        │
          personal: «Aceptar» (todo o «Aceptar 1 de 2» con motivo) · «🚫 No se puede» (motivo)
                        │
          aceptar ──► se anota una pedida normal en la cuenta abierta de la Mesa 4 (o una nueva)
                        │
          el cliente ve: ⏳ recibido · ✅ confirmado (y qué no había, por qué) · 😔 no se pudo
```

- **El código** (16 bytes al azar) no se adivina. El administrador lo crea por mesa o por
  cancha y lo **cambia** si alguien copió el QR (el viejo deja de servir).
- **Interruptor general**: los pedidos por QR están **apagados de entrada**; apagados, la
  página dice «Ahora no estamos recibiendo pedidos por aquí. Pídale al personal».
- **Nada entra a una cuenta sin el personal** (reglas 3, 4 y 8). Al aceptar, el celular
  emite `abrir` (si no hay cuenta abierta del lugar), `anotar` (con el detalle «📱 QR ·
  nombre · nota») y `aceptar_solicitud`: precios, despacho (si lo acepta comida, las
  bebidas le suenan a la barra) y permisos salen de las reglas de siempre.
- **En las canchas** el pedido entra como chico, a precio de cancha (el que vio el cliente).
- **Límites** (en el servidor): un pedido cada 20 s y 10 por hora por código; hasta 20
  productos, 30 unidades por producto y $ 500.000 por pedido; sin valor libre («Otro»,
  mecato); cuerpo de hasta 10 KB.
- **Lo que ve la ruta pública**: la carta (productos activos con precio; en las canchas, el
  de cancha; las opciones en lugar de su general) y el estado de las solicitudes **de su
  propio código**. Nunca cuentas, la foto ni nada interno (deuda 6 de 16 resuelta para el
  público: `/api/cuentas` sigue exigiendo sesión).

## Dónde está

| Parte | Archivo |
|---|---|
| Solicitud, topes, pendientes, vigentes | `src/dominio/solicitudes.ts` |
| Operaciones `solicitud`, `aceptar_solicitud`, `rechazar_solicitud` | `src/dominio/estado.ts`, `src/servidor/esquema.ts` |
| Lugares con código, interruptor, ritmo | `src/servidor/qr.ts` (tablas `lugares_qr`, `pedidos_qr`, `ajustes`) |
| Ruta pública y registro de la solicitud | `src/servidor/worker.ts` (`publico`, `registrarDelServidor`) |
| Aviso y pantalla del personal | `src/app/pantallas/Solicitudes.tsx` |
| Códigos QR e impresión (administrador) | `src/app/pantallas/CodigosQR.tsx` (menú ▾ → «📱 Códigos QR») |
| Página del cliente | `cliente.html`, `src/cliente/` (servida en `/m/<código>`) |
| Pruebas | `tests/solicitudes.test.ts`, `tests/servidor/qr.test.ts`, `tests/e2e/qr.spec.ts` |

| Conflicto | Regla |
|---|---|
| Dos celulares atienden la misma solicitud | El segundo se rechaza: «Ese pedido ya se aceptó (Ana)» |
| Un celular del personal manda una `solicitud` | Se rechaza: «Los pedidos de los clientes llegan solo por el QR» |
| Rechazar sin motivo | Se rechaza: «Escriba por qué no se puede» |
| Aceptar una parte sin motivo | No deja (el botón pide el motivo: lo ve el cliente) |
| El cliente pide otra vez enseguida | 429: «Espere un momento antes de pedir otra vez» |
| Producto inactivo, de valor libre o cantidad fuera de tope | 400: «Vuelva a abrir la carta» |
| Código cambiado o desactivado | 404: «Este código no sirve. Pídale ayuda al personal» |

## Para encenderlo (cuando el negocio decida)

1. Responder 18 §5.4 (quién acepta, qué se puede pedir, horario).
2. «📱 Códigos QR»: crear las mesas y canchas, «🖨 Imprimir los códigos» (dos por hoja, con
   el número grande y «Escanee para pedir»). Plastificarlos o ponerlos en acrílicos; las
   etiquetas NFC (NTAG215) se graban con el mismo enlace desde Android.
3. Encender el interruptor y probar con un celular cualquiera.

## Lo que falta (siguiente paso)

- **La pieza física de cada mesa y cancha** (número, QR y NFC): diseño en
  [23](23-mesas-con-identidad.md). Antes de imprimir, decidir el dominio del enlace (23 §3).
- **El sitio web** (`axchisan/retendelgorgojo`): la misma página con la marca y las fotos,
  usando estas rutas públicas (ya responden con CORS) o reenviando desde su servidor.
- **Push** (fase 4) para que el aviso llegue con la app cerrada.
- **Horario** de los pedidos por QR (hoy: el interruptor) y quién acepta según el área.
- Los **domicilios por la web** (fase 5 b) usan esta misma puerta con datos de entrega.
