# Prompter Cero

Teleprompter propio para el teléfono. Sin anuncios, sin cuentas, sin suscripción.

**La app:** https://lukasconejeros.github.io/prompter-cero/
**Banco de pruebas:** https://lukasconejeros.github.io/prompter-cero/prueba.html

## Cómo instalarlo en el iPhone

1. Abre la dirección en **Safari** (no en Chrome ni dentro de otra app).
2. Botón de compartir → **Añadir a pantalla de inicio**.
3. Ábrela desde el ícono: pantalla completa, sin barra de navegador.

## Qué hace

Una sola pantalla: la cámara completa, el guion encima y los controles flotando.

- **Guion** — pegas el texto, ves cuántas palabras son y cuánto dura hablado (a 170 palabras
  por minuto). Se guardan en el teléfono, no suben a ningún lado.
- **Avance** — el texto te sigue cuando hablas (reconocimiento de voz), sube solo a la
  velocidad que le pongas, o lo mueves con el dedo. Si la voz falla, cambia solo al automático.
- **Ajustes que quedan guardados** — cuánto tapa, dónde va, tamaño de letra, qué pasa con lo ya
  dicho, con o sin fondo, calidad, encuadre, espejo y cuenta regresiva.
- **Grabar / parar** con el botón grande, y **Guardar en Fotos** al terminar.

## Dos decisiones técnicas que importan

**El audio va sin procesar.** `echoCancellation`, `noiseSuppression` y `autoGainControl` van
en `false`. Esos filtros están hechos para videollamadas y arruinan una grabación: la voz sale
metálica y con el volumen bailando. Audio a 192 kbps.

**La cámara se pide vertical.** Se piden 2160×3840 (no 3840×2160), porque el destino son reels
verticales. Pedirla acostada produce un video que después se ve chico y blando en el teléfono.

**El texto no queda grabado.** Va como capa de la página encima del `<video>`; `MediaRecorder`
toma la señal de la cámara directo. Por eso no se quema en el video y no cuesta rendimiento.
