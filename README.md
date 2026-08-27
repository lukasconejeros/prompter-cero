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

**A la cámara no se le pide una forma.** Se pide **solo el alto**, nunca un `aspectRatio` ni ancho
y alto juntos. Cuando WebKit no puede darte la forma que le exiges, no escala: **recorta el centro
del sensor**, y todo sale con zoom. Eso fue un bug real del 27-08. La cámara entrega su modo nativo
completo y, si el destino es 9:16 y ella no lo es, la app recorta después en un lienzo propio: así el
visor y el archivo muestran exactamente lo mismo.

**El texto no queda grabado.** Va como capa de la página encima del `<video>`; `MediaRecorder`
toma la señal de la cámara directo. Por eso no se quema en el video y no cuesta rendimiento.

## Las pruebas

Corren con el Edge que ya está en el PC (no descargan navegadores) y con `playwright-core` de
`whatsapp-mary`. Antes de decir que algo funciona, se corren las cuatro:

```
node test-robustez.js        # 20 · las fallas que sufrió en el iPhone: memoria, zoom, texto pegado
node test-seguimiento.js     # 17 · el algoritmo del seguimiento por voz, sin navegador
node test-guiones.js         # 11 · los 3 guiones vienen dentro de la app y se abren
node auditoria-seguridad.js  # 21 controles de privacidad (con --vivo, contra el servidor real)
```

Los errores ya cazados y cómo se arreglaron están en `errores-sesion.md`. Se lee antes de improvisar.
