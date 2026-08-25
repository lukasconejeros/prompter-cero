# Prompter Cero

Teleprompter propio para el teléfono. Sin anuncios, sin cuentas, sin suscripción.

**Se usa acá:** https://lukasconejeros.github.io/prompter-cero/

## Cómo instalarlo en el iPhone

1. Abre la dirección de arriba en **Safari** (no en Chrome ni dentro de otra app).
2. Toca el botón de compartir (el cuadrado con la flecha hacia arriba).
3. **Añadir a pantalla de inicio**.
4. Ábrela desde el ícono: se abre en pantalla completa, sin barra de navegador.

## En qué va

Ahora mismo esto es un **banco de pruebas**, no la app final. Mide dos cosas antes de
decidir cómo se construye el teleprompter de verdad:

1. **Calidad de grabación** — si el navegador del iPhone graba a la altura de la cámara
   nativa o la baja. Reporta resolución real del archivo, bitrate, fps y formato.
2. **Seguimiento por voz** — si el iPhone deja escuchar y grabar con el micrófono a la vez,
   que es lo que permite que el texto avance solo cuando dices las palabras.

## Nota de diseño

El texto va **encima** del video como capa de la página; la grabación toma la señal de la
cámara directo. Por eso el texto no queda quemado en el video y no cuesta rendimiento.
