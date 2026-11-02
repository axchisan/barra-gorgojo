# 00 · Visión y problema

## El contexto

El Retén del Gorgojo tiene **dos áreas que venden al mismo tiempo**:

1. **La cocina**, que vende picadas, carnes, sopas y almuerzos, sobre todo los fines de
   semana. Su cuenta va por mesa.
2. **La barra** (el local de la cerveza), que vende cerveza y bebidas **todos los
   días**. Es la línea más importante del negocio en volumen y la ganancia real del
   tejo: las tres canchas son gratis y lo que se cobra es la cerveza de las rondas.

Este sistema es para la barra.

## Qué pasa hoy

La gente llega y hace una **pedida**: «dos Águila, dos Coronitas, una Light, una Bacana
y una Costeña roja». Se anota en un cuaderno a nombre del grupo. Al rato el mismo grupo
pide otra ronda, ahora con una cerveza más. Mientras tanto llegan otros: un señor que
pide dos Águila, una mesa que está comiendo y pide bebidas.

Con eso, el cuaderno falla de cinco maneras:

| Problema | Consecuencia |
|---|---|
| **Muchas cuentas abiertas a la vez**, cada una con varias rondas | Hay que buscar en la hoja, tachar, sumar ronda por ronda. En un día lleno es lento y confuso |
| **El total se calcula a mano** | Errores de suma, que casi siempre se pierden a favor del cliente, y demora al cobrar |
| **Varias personas atienden a la vez**, pero hay un solo cuaderno | O todos van al cuaderno, o se anota en papelitos que después se pierden |
| **Las bebidas que piden las mesas de comida** | No queda claro si se cobraron en la barra o se sumaron a la cuenta de la mesa: se cobran dos veces o ninguna |
| **No queda registro útil** | No se sabe cuánto se vendió en el día, de qué marca, ni cuánta plata debería haber en la caja |

## Qué debe lograr el sistema

En orden de importancia:

1. **Anotar una ronda más rápido que en el cuaderno.** Si es más lento, no se va a usar.
   Este es el criterio que manda sobre todos los demás. La meta: una ronda en tres
   toques y menos de cinco segundos.
2. **El total siempre correcto y a la vista.** Nadie vuelve a sumar a mano.
3. **Que varias personas anoten a la vez** desde celulares distintos y todas vean lo
   mismo, en tiempo real.
4. **Que funcione sin internet.** La señal en el sitio es buena, pero un día lleno, con
   el WiFi saturado o un celular con datos agotados, el sistema no puede detenerse. Se
   anota igual y se sincroniza después.
5. **Acabar con la confusión de las mesas de comida.** Hoy no hay regla fija: a veces
   las bebidas de una mesa se cobran en la barra y a veces se suman a la cuenta de
   comida. El sistema **no impone una regla, impone un registro**: las bebidas de la
   mesa se anotan en la barra como «Mesa 4», y al final esa cuenta se cierra de una de
   dos formas, **cobrada en la barra** o **pasada a la cuenta de comida**. Lo que no
   puede pasar es que quede en las dos o en ninguna, y eso es lo que el sistema evita.
   Al cerrar el día, lo pasado a la cocina aparece aparte, como plata que la cocina le
   debe a la barra.
6. **Saber cómo fue el día**: cuánto se vendió, por medio de pago y por producto, y
   cuánto efectivo debería haber al cerrar.

## Qué NO es este proyecto

Delimitarlo evita que crezca hasta no terminarse:

- **No es el sistema de la cocina.** La comida se sigue manejando como hoy. Integrarla
  es una fase posterior, si hace falta.
- **No es una caja registradora ni un sistema de facturación electrónica.** No emite
  facturas ni se conecta a la DIAN.
- **No es parte del sitio público.** Es una aplicación interna, separada, con su propio
  acceso. El cliente nunca la ve, salvo cuando se le muestra el total en la pantalla.
- **No maneja fiado** en la primera versión. Hoy la cuenta se paga completa al final.
- **No lleva inventario** en la primera versión. Queda planeado para la fase 3, porque
  los datos de venta que va a dejar el sistema son justo lo que hace falta para eso.
- **No requiere un aparato especial.** Funciona en los celulares que ya tienen.

## Quiénes la usan

| Persona | Qué hace con el sistema |
|---|---|
| Quien atiende la barra | Abre cuentas, anota rondas, cobra. Es el uso del 90 % del tiempo |
| Quien atiende mesas o tejo | Anota desde su celular las rondas de sus clientes sin ir hasta la barra |
| Los dueños | Lo anterior, más ver cómo va el día, cerrar la jornada, corregir errores |
| El administrador (el desarrollador) | Catálogo, precios, usuarios, dispositivos y soporte |

El negocio tiene seis personas trabajando. El sistema tiene que ser usable por todas sin
capacitación larga: **media hora el primer día y nada más**.

## Métricas de éxito

- A las cuatro semanas de uso, **el cuaderno ya no se usa** en la barra.
- Ninguna cuenta mal cobrada por error de suma.
- Ninguna anotación perdida por falta de señal.
- Anotar una ronda: tres toques en el caso común, menos de cinco segundos.
- Al cerrar el día, el efectivo contado y el esperado se pueden comparar en un minuto.

## Decisiones ya tomadas

| Decisión | Resultado | Fecha |
|---|---|---|
| Forma de pago de la cerveza | **Al final, la cuenta completa** | 2026-10-04 |
| Quién anota | **Varias personas a la vez**, desde varios celulares | 2026-10-04 |
| Bebidas pedidas por mesas de comida | **Sin regla fija**: a veces en barra, a veces en comida. Se anotan siempre en la barra y la cuenta se cierra como «cobrada en barra» o «pasada a comida» | 2026-10-04 |
| Dónde vive | **Aplicación separada** del sitio web, con su propio acceso | 2026-10-04 |
| Precios iniciales | Entregados por los dueños (en `negocio/docs/08`, privado) | 2026-10-04 |
