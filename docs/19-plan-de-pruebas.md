# 19 · Plan de pruebas en los aparatos reales

Fase 1 de [18](18-roadmap-2026-11.md). Se corre en el **entorno de pruebas** (nunca en
producción), con los aparatos de verdad conectados a la vez. Las pruebas automáticas
(Vitest y Playwright) ya cubren las reglas y los flujos; esto revisa lo que solo se ve con
la mano: tamaños, sol, teclado, sonido, señal real y el uso con prisa.

**Cómo marcar:** ✅ bien · ⚠️ funciona pero incomoda · ❌ falla. Lo que no sea ✅ va a la
tabla de hallazgos del final, con aparato, pasos y captura (sin datos reales: regla 16).

## Preparación

- [ ] `pnpm desplegar:pruebas` con la versión a probar; anotar la versión (menú → la persona → «Personas y celulares» muestra la versión de cada aparato).
- [ ] Aparatos: **celular** (el más viejo que se use en el local), **tablet** (vertical y horizontal) y **portátil** (Chrome, ventana normal y app instalada).
- [ ] Los tres vinculados al entorno de pruebas, con personas de prueba: un administrador, un operador de barra, uno de comida y **una empleada con horario** (sin «Ve el día» ni «Historial»).
- [ ] Catálogo de pruebas con al menos una cerveza con precio de cancha distinto del normal.
- [ ] Sonido del aparato encendido; brillo alto (prueba al sol si se puede).

## Fase 0 · Lo nuevo (antes de producción)

### Precio de los adicionales

| # | Pasos | Esperado | Cel | Tab | PC |
|---|---|---|---|---|---|
| 0.1 | Cancha nueva → 2 cervezas → Anotar | Chico 1 a precio de cancha | | | |
| 0.2 | ＋ Chico → 1 cerveza → «Adicional» | Sale «Precio normal · cambiar»; el botón muestra el precio normal; los productos también | | | |
| 0.3 | Tocar «cambiar» | «🎯 A precio de cancha»; el total sube. Volver a tocar: normal | | | |
| 0.4 | Anotar el adicional a precio normal → Chicos | El adicional tiene el chip «Precio normal»; los chicos no tienen chip | | | |
| 0.5 | Tocar el chip → «Deshacer» | Cambia a «🎯 Precio cancha» y vuelve; el total sigue | | | |
| 0.6 | «＋ Agregar» al adicional normal | Lo agregado entra a precio normal | | | |
| 0.7 | Cambiar un producto del adicional por otro | El nuevo, a precio normal | | | |
| 0.8 | «Pasar a chico» el adicional | Pasa a precio de cancha | | | |
| 0.9 | **El caso real**: adicional con «Otro · Cerveza $ 12.000», cambiarlo por la cerveza y poner la cantidad 4 | Queda a precio **normal** (4 × precio normal) | | | |
| 0.10 | Cobrar la cancha y tocar el chip de precio | No cambia: «ya se cobró: reábrala» | | | |
| 0.11 | Desde el operador de comida | No ve el chip de precio | | | |

### Accesos de empleados

| # | Pasos | Esperado | Cel | Tab | PC |
|---|---|---|---|---|---|
| 0.12 | Admin: a la empleada «Domingos 8 a. m.–3 p. m.»; entrar con ella fuera de esa hora | No entra: «Fuera de su horario. Puede entrar … a las 8:00 a. m.» (sin gastar intentos de PIN) | | | |
| 0.13 | Admin: darle un **día especial** que cubra la hora actual; entrar | Entra. Menú: «⏰ Su acceso de hoy termina a las …» | | | |
| 0.14 | Con ella: pestañas | No está «El día» | | | |
| 0.15 | Con ella: 📒 Deudas | «Fiado hoy» y «Aquí solo se ve lo fiado y lo pagado hoy»; no salen deudas de otros días | | | |
| 0.16 | Con ella: anotar, cobrar en efectivo, abonar, pasar a deuda | Todo funciona; el pago queda en la caja de su área | | | |
| 0.17 | Admin: quitarle el día especial mientras ella está adentro | Su aparato vuelve solo a la entrada con «⏰ …» | | | |
| 0.18 | Ella en **modo avión** anota algo; termina la franja; vuelve la señal | La app sale sola a la hora; lo anotado dentro de la franja llega (con otra persona que entre) y no se pierde | | | |
| 0.19 | Admin: darle «Ve el día» con ella adentro | Le aparece «El día» sin volver a entrar | | | |
| 0.20 | Las demás personas | Siguen como estaban (sin horario, con El día) | | | |

## Flujos de siempre (regresión)

| # | Flujo | Qué revisar | Cel | Tab | PC |
|---|---|---|---|---|---|
| 1 | Vincular un aparato y entrar con PIN | Código de 6 números, PIN, bloqueo tras 5 errores | | | |
| 2 | Anotar una ronda en cuenta abierta | **3 toques** (cuenta → productos → Anotar) y el aviso «Deshacer» | | | |
| 3 | Nueva cuenta: grupo, persona, mesa, cancha | Nombre automático, número de mesa, cancha 1/2/pequeña | | | |
| 4 | Repetir | Trae la última (en cancha, el último chico) | | | |
| 5 | Petaco, medio y mixto | Cuenta y paquete correctos | | | |
| 6 | Mecato y «＋ Otro» (barra y comida) | Valor libre, tope, comida aparte | | | |
| 7 | Editar: cantidad, anular, cambiar, agregar | Se ve en la auditoría como edición | | | |
| 8 | Cobrar: efectivo con billetes y cambio, Nequi, Breve | Sugerencias de billetes en una línea; cambio | | | |
| 9 | Abonos: por productos, por valor, dividir entre N | Quién pagó, cuántos faltan, deshacer un abono | | | |
| 10 | Pasar a deuda y pagar una deuda | Aparte de la caja del día | | | |
| 11 | Juntar y separar cuentas | Con abonos; a una cancha llega como adicional | | | |
| 12 | Comida: platos con notas, pedido rápido a la barra | La barra recibe el aviso **con timbre**; despachar lo apaga; cancelar | | | |
| 13 | Mostrar al cliente | Total grande, legible al sol | | | |
| 14 | El día: cierre de caja por área, días anteriores, CSV | Cuadra con lo cobrado | | | |
| 15 | Auditoría | Cada acción en una frase, con quién | | | |
| 16 | Productos y precios (admin) | Crear, cambiar precio y precio de cancha, orden | | | |

## Varios aparatos y señal

| # | Pasos | Esperado |
|---|---|---|
| S1 | Anotar en el celular | Aparece en la tablet y el portátil en menos de 2 s |
| S2 | Celular en modo avión: anotar 3 pedidas; tablet cobra esa cuenta; quitar modo avión | La cuenta se reabre con saldo y alerta «se anotó después» en todos |
| S3 | Dos aparatos cobran la misma cuenta sin señal | El segundo recibe «ya la cobró … Si recibió plata, devuélvala» |
| S4 | Cerrar la app con pendientes (sin señal) y abrirla con señal | Se envían solos; nada duplicado |
| S5 | Apagar el wifi del local 5 minutos en pleno uso | Todos siguen anotando; al volver, todo cuadra |
| S6 | Indicador de conexión | «Todo al día» / «Sin señal · n por enviar» correcto |

## Forma de la pantalla

| # | Aparato y posición | Qué revisar |
|---|---|---|
| F1 | Celular vertical | Botones de 56 px, nada tapado por el pie, todo el catálogo a la vista en anotar, teclado no monta las barras |
| F2 | Celular girado | Pie a la derecha, sin saltos al escribir |
| F3 | Tablet vertical y horizontal (app instalada y en Chrome) | Columnas, panel de la pedida, despacho visible |
| F4 | Portátil 1366 × 768 y 1920 × 1080 | Nada estirado de más; se usa con ratón sin incomodidad |
| F5 | Texto grande del sistema (accesibilidad) | No se corta nada importante |
| F6 | Al sol | Totales legibles (contraste 7:1) |

## Portátil y teclado (antes de la fase 2)

Para decidir los atajos de [18](18-roadmap-2026-11.md) §2.2:

- [ ] ¿Qué se hace más seguido en el portátil? (anotar, cobrar, revisar)
- [ ] ¿Qué molesta con el ratón? (anotar varias cervezas, buscar una cuenta, escribir valores)
- [ ] `Tab` y `Enter` hoy: ¿se llega a todos los botones? ¿Se ve dónde está el foco?
- [ ] `Esc` hoy (no hace nada): ¿se espera que cierre las hojas?
- [ ] Probar 5 minutos anotando solo con el teclado y anotar dónde se traba.

## Hallazgos

| # | Aparato | Pasos | Qué pasó | Qué se esperaba | Prioridad | Tarea / commit |
|---|---|---|---|---|---|---|
| H1 | Teléfono 360 y 412 (vertical) | Anotar: tocar un producto | El contador «N −» de cada producto mide 35 × 28 px y se sale 3 px del botón | Quitar uno con el pulgar sin fallar (≥ 44 px) | Media | Se queda como está (decisión del negocio, 2026-11-14) |
| H2 | Teléfono 360 (vertical) | Panel de comida con dos áreas | La cabecera corta el nombre («Administrad…») y la conexión queda solo como punto | Ver quién está usando el aparato | Baja | ✅ Nombre corto en la cabecera angosta («Admin.»), `tests/e2e/telefono.spec.ts` |
| H3 | Teléfono 360 (vertical) | Cobrar → Valor → dividir | Las sugerencias de billetes quedan debajo del botón fijo; hay que bajar para verlas | Ver «Exacto» y los billetes sin bajar, o una pista de que hay más | Media | ✅ Contadores de dividir lado a lado en el teléfono, `tests/e2e/telefono.spec.ts` |
| H4 | Teléfono (vertical) | Pedir a la barra | La fila de cuentas se desliza de lado sin ninguna pista; las de la derecha no se ven | Saber que hay más cuentas (degradado o flecha) | Baja | ✅ Degradado a la derecha, `tests/e2e/telefono.spec.ts` |
| | | | | | | |
