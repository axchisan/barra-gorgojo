# 23 · Mesas con número, QR y NFC: el objeto físico (2026-11-19)

Encargo del dueño para la próxima sesión. Cada mesa y cada cancha tiene que tener **su
número, su QR y lo que haga falta**, en una pieza que se vea bien en el lugar y se pueda
construir con materiales fáciles, como la guadua. La parte de software de los pedidos por QR
ya está hecha y apagada en producción: [20](20-pedidos-por-qr.md). Este documento trata del
objeto físico y de cómo se va a diseñar.

Los datos reales del lugar (cuántas mesas hay, cómo se llaman las canchas, fotos) van en
`negocio/` (regla 16). Las imágenes que se generen se guardan en `negocio/diseno-mesas/`,
nunca en el repositorio público.

## 1 · Cómo se trabaja: Claude propone, Gemini dibuja

1. **Claude propone las ideas.** Cada idea lleva:
   - un nombre corto;
   - el concepto en una frase;
   - los materiales;
   - las medidas aproximadas;
   - cómo se construye, paso a paso;
   - dónde va el número y dónde el QR, y cómo se cambia el QR;
   - el costo y la dificultad estimados.
2. **Claude escribe un prompt para Gemini** por cada idea, listo para pegar (§4).
3. **Gemini, en el navegador del dueño**, dibuja la imagen. Hay dos formas de hacerlo:
   - el dueño pega el prompt en gemini.google.com;
   - Claude maneja Chrome con la extensión Claude in Chrome, escribe el prompt en la pestaña
     de Gemini, donde el dueño ya inició sesión, y mira el resultado.

   Claude nunca escribe contraseñas: si Gemini pide iniciar sesión, lo hace el dueño.
4. **Se guarda cada imagen junto con su prompt** en `negocio/diseno-mesas/`, con nombres
   como `03-totem-guadua-a.png` y `03-totem-guadua-a.txt`.
5. **Se escogen dos o tres ideas**, se ajustan con más prompts, se construye **un
   prototipo** y se prueba en una mesa real: que se lea el número desde la barra y que el QR
   escanee con un celular viejo y con poca luz.
6. Cuando el diseño esté decidido, **el software se adapta a la medida**: la hoja de
   impresión de «📱 Códigos QR» se ajusta al tamaño de la pieza (§3).

## 2 · Lo que tiene que cumplir cada pieza

| Requisito | Por qué |
|---|---|
| **Número grande**, de unos 8 a 10 cm de alto en las mesas y más en las canchas, oscuro sobre claro o al revés | El personal identifica la mesa desde la barra. Así nombra la app las cuentas («Mesa 4», «Cancha 2») |
| **QR de 5 a 6 cm de lado, como mínimo 4 cm**, con un margen blanco alrededor de al menos 4 módulos | Por debajo de eso, los celulares viejos fallan con poca luz |
| **QR oscuro sobre fondo claro y liso**, nunca grabado directo sobre la veta de la guadua o la madera | La veta y la falta de contraste impiden leerlo. Mejor una tarjeta impresa en una ranura o detrás de acrílico |
| **El QR se cambia sin rehacer la pieza** | «Cambiar código» (20) deja sin servir el QR impreso, y si cambia el dominio (§3) también hay que reimprimirlo. La tarjeta del QR tiene que poder sacarse |
| **Etiqueta NFC opcional** (NTAG215), escondida debajo de una superficie de menos de 1 cm, lejos de metales, con un ícono que diga «acerque el celular» | Lleva el mismo enlace que el QR. El metal la bloquea |
| **Aguanta** cerveza, sol, lluvia en las canchas, humedad y golpes | La guadua necesita estar inmunizada (bórax) y sellada (laca o barniz marino). El papel, plastificado |
| **Estable y difícil de llevarse**: base pesada, o anclada o atornillada a la mesa | Si no, se vuelca o se pierde |
| **No estorba en la mesa**: deja espacio para los platos y las canastas | La mesa sirve para comer |
| **Con la marca del Retén**: colores marrón y crema de la app (`--marron` `#241206`, `--crema` `#faf4e8`, `--amarillo` `#f2b01f`) y el tema del tejo | Que se lea como parte del lugar |
| **Barata y hecha a mano** por el dueño o un artesano de la zona, con herramientas comunes | El negocio no compra piezas industriales |

## 3 · Lo técnico del QR, antes de imprimir

- **El dominio del enlace** (pregunta 6 de 18 §5.4) se decide antes de imprimir nada
  definitivo. Hoy el enlace es `https://<dominio de la barra>/m/<código>`. Si después la
  página se pasa al sitio web con otro dominio, todos los QR impresos dejan de llevar al
  lugar correcto. Hay dos salidas:
  - imprimir con un dominio que no vaya a cambiar;
  - dejar una redirección permanente desde el dominio viejo.
- **El nivel de corrección** hoy es `M` (`src/app/pantallas/CodigosQR.tsx`,
  `qrcode(0, "M")`). Si el diseño pone el logo en el centro del QR, hay que subirlo a `H`
  y probar que escanee.
- **La hoja de impresión** hoy pone dos tarjetas por A4 (`.hoja-qr` en
  `src/app/estilos.css`). Cuando se sepa el tamaño de la pieza, se agrega un formato a esa
  medida, por ejemplo una tarjeta de 9 × 9 cm con marcas de corte, y el número en la letra
  del diseño.
- **Probar antes de producir en serie**: varios celulares, Android viejo e iPhone, a 30 cm
  y a 1 m, con luz de noche y en el sol de la tarde.
- **Crear las mesas en producción** («📱 Códigos QR») lo hace una persona desde la app.
  Encender el interruptor de los pedidos es decisión del dueño (20 «Para encenderlo»).

## 4 · Plantilla de prompt para Gemini

Gemini dibuja mejor con escenas concretas. Hay que pedirle que el QR sea un
**cuadro de relleno** y no uno real: un QR inventado puede parecer de verdad y confundir.

```
Fotografía realista de producto, luz cálida de tarde, en un restaurante campestre colombiano
con canchas de tejo (Santander). Sobre una mesa de madera rústica hay un [OBJETO]: [DESCRIPCIÓN
DE LA FORMA Y LOS MATERIALES: guadua inmunizada con laca, cuerda de fique, etc.]. Tiene el
número «[N]» grande, [pintado / tallado / quemado] en [COLOR], legible a distancia, y un
recuadro blanco liso de unos 6 cm donde irá un código QR (dejar el recuadro como un cuadro
gris de relleno, sin dibujar un QR). Pequeño ícono de «acerque el celular». Colores de marca:
marrón oscuro, crema y un toque amarillo mostaza. Al fondo, desenfocado, el ambiente del lugar.
Estilo: artesanal, hecho a mano, sencillo de fabricar. Formato cuadrado.
```

Variantes útiles:
- «vista de frente sobre fondo blanco, como ficha técnica, con medidas aproximadas»;
- «despiece de las partes, estilo dibujo de taller»;
- «la misma pieza en versión para cancha de tejo, en un poste de guadua de 1,5 m al lado de
  la cancha».

## 5 · Pasos para la próxima sesión

1. **Pedirle al dueño lo que falta** (pendientes 1 y 2 de `negocio/docs/08`) y anotarlo en
   `negocio/`:
   - cuántas mesas se numeran;
   - cómo se llaman las canchas;
   - qué mesas están adentro y cuáles afuera;
   - de qué son las mesas (madera, plástico, metal);
   - fotos del lugar, si las tiene.
2. **Proponer de 8 a 10 ideas variadas** (§6), con la ficha de §1.1.
3. **Generar las imágenes con Gemini** (§1.3 y §4) y guardarlas con su prompt.
4. Que el dueño **escoja dos o tres**. Ajustarlas y describir el prototipo con la lista de
   compras y los pasos de construcción.
5. **Decidir el dominio del enlace** (§3) antes de imprimir.
6. **El software**: hacer el formato de impresión a la medida escogida, en pruebas, con su
   prueba e2e; desplegar a producción solo con permiso.

## 6 · Semillas para arrancar las ideas

Son puntos de partida, no decisiones:

- **Tótem de guadua**: un tramo de guadua de unos 20 cm, cortado en bisel. El número va
  quemado o pintado y el QR, en una tarjeta que entra por una ranura.
- **Rodaja de guadua o tronco** como base, con un atril de acrílico atrás para el QR.
- **El tejo como forma**: una pieza redonda como el tejo o el bocín, o un mini «cancha»
  con mecha decorativa. Es muy del lugar.
- **Banderín o poste para las canchas**: guadua alta con el número grande y el QR a la
  altura de la mano.
- **Botella reciclada** de vidrio con la tarjeta adentro o en un collar de fique.
- **Plancha colgante** de madera sobre la mesa o en un poste cercano, para que la mesa
  quede libre.
- **Piedra de río** pintada con el número, como pisapapeles con el QR plastificado debajo.
