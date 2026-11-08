# 15 · Deudas (fiado) (2026-11-08)

Pedido del negocio: poder pasar cuentas o pedidas a deuda («hay gente que no paga de una»),
administrarlas, y llevar en un solo panel todas las deudas, también las de comida que se
anotaban aparte.

## Reglas (dichas por el negocio)

- **Lo fiado es venta del día en que se fió.** Lo que pagan después **va aparte**: no se
  suma al efectivo recibido ni al cuadre de caja del día en que pagan.
- **Pasar a deuda y recibir pagos:** cualquiera. **Anotar deudas a mano y anular
  movimientos:** el administrador.

## Cómo funciona

- **Pasar a deuda:** en «Cobrar», el medio **📒 Deuda** pide a nombre de quién (sugiere a
  quienes ya deben). Sirve para todo, para unas pedidas o productos, o para un valor. La
  cuenta queda saldada sin plata en caja (`cobrar` con `medio: "deuda"` y `deudor`), y se
  le carga a esa persona en `Estado.deudas` con la cuenta de donde salió y cuánto es comida.
- **Una persona por nombre:** «Nilson», «NILSON» y « nilson » son la misma (`idDeudor`).
- **Deudas a mano** (`deuda_cargo`): concepto, valor, comida o barra.
- **Pagos** (`deuda_pago`): todo o una parte, en efectivo, Nequi o Breve; nunca más de lo
  que debe. «El día» los muestra como «Pagos de deudas hoy (aparte de la caja)».
- **Deshacer:** deshacer el cobro o reabrir la cuenta anula su cargo. Un cargo anotado a
  mano o un pago se anulan con `deuda_anular` (administrador). Nada se borra.
- **Panel «📒 Deudas»** (menú de la persona): lo que le deben al negocio, de comida y de
  barra, cada persona con lo que debe y su historial.

Pruebas: `tests/deudas.test.ts`, «deudas en el servidor» y `tests/e2e/deudas.spec.ts`.
