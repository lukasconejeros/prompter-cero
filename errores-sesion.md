# Bitácora del prompter — errores y aciertos

Se consulta ANTES de improvisar con un error nuevo, y se escribe al cerrar cada arreglo.

---

## 27-08-2026 · auditoría completa tras sus dos quejas

**Lo que reportó Lukas, textual:** *"se queda re pegado ahí, la app ya no se mueve más y además
cuando grabo tiene el medio zoom"*. Pidió auditoría completa, nivel programador senior.

### #1 — GRAVE · el texto no avanzaba y no decía por qué

`escuchar()` empezaba con `if(!SR || !guionNorm.length) return;`. Si el teléfono no tiene
reconocimiento de voz —pasa en las **apps instaladas de iOS** (standalone) y cuando el permiso de
micrófono está denegado— la función se iba **en silencio**: el guion se quedaba clavado toda la
toma. Ni aviso, ni caída al modo automático. El guardián de los 8 segundos tampoco saltaba porque
el `return` era anterior a armarlo.

**Arreglo:** sin reconocimiento de voz se avisa en pantalla y el texto arranca solo.
**Probado:** `test-robustez.js` prueba 1 (sin `SpeechRecognition`, el prompter avanza igual).

### #2 — GRAVE · el zoom al grabar (regresión del commit `61fbc6b`)

A la cámara se le pedía `aspectRatio: {ideal: 9/16}` **y** `2160 × 3840` a la vez. Ninguna cámara de
iPhone tiene ese modo: cuando WebKit no puede cumplir la forma pedida **no escala, recorta el centro
del sensor**. Resultado: campo de visión estrechísimo, o sea "zoom". La regresión entró justo con el
commit que perseguía el formato vertical.

**Arreglo:** se pide **solo el alto** (deseado, no obligatorio) y nada más. La cámara entrega su modo
nativo completo y la app recorta después, en su lienzo, si hace falta.
**Regla reutilizable:** en `getUserMedia`, pedir ancho y alto juntos —o un `aspectRatio`— es pedir una
FORMA. Si el sensor no la tiene, Safari recorta. Pedir una sola dimensión nunca recorta.

### #3 — GRAVE · la memoria: la app se ahogaba sola

Tres cosas sumadas: (a) el `URL.createObjectURL` de cada toma **no se soltaba nunca**, (b) los pedazos
de video seguían en el array `trozos` después de armar el blob, y (c) el chorro de datos llegaba a
**45 Mbps**, o sea 337 MB de RAM por minuto grabado. Tres tomas de un minuto = más de 450 MB vivos:
Safari iOS se atora y la app deja de responder. Medido: 3 direcciones vivas de 3 creadas.

**Arreglo:** se suelta la toma anterior antes de cargar la nueva, `trozos` se vacía, y el bitrate baja
a 24 Mbps en 4K / 16 en 1080p (Instagram recomprime por debajo de 10, no se nota). Aviso en pantalla
al pasar de 350 MB.
**Probado:** `test-robustez.js` prueba 4 (tres tomas seguidas, queda 1 dirección viva).

### #4 — el punto rojo que no se apagaba

`grabador.onerror` solo avisaba. Si Safari mataba el grabador (memoria, llamada entrante), `grabando`
seguía en `true`, el reloj seguía corriendo y el punto rojo puesto: la app parecía viva y no
respondía. Es el otro "se queda pegado".
**Arreglo:** `onerror` cierra la toma como si hubieras tocado parar, y guarda lo grabado. Más una red
de seguridad que suelta el pintor del recorte si el `onstop` nunca llega.

### #5 — el visor mostraba una cosa y el archivo salía otra

`camaraEsVertical()` daba `true` con solo que el alto fuera ≥ el ancho. Una cámara **cuadrada** o
**3:4** pasaba el filtro, así que no se recortaba: el visor mostraba 9:16 y el archivo salía cuadrado.
**Probado en Edge:** entregaba 2160×2160 y el video salía 2160×2160.
**Arreglo:** se compara la **forma** contra 0,5625. `test-robustez.js` prueba 8: cámara 1440×1920 →
archivo 1080×1920 clavado; cámara 1920×1080 → 608×1080.

### #6 — el service worker dejaba la app pegada en una versión vieja

La regla "red primero" solo cubría el HTML. `app.js` y `app.css` iban por **caché primero**: un
arreglo podía no llegar nunca al teléfono aunque el HTML fuera nuevo. **Pasó de verdad:** el commit
`1930813` cambió `app.js` y no subió la versión del caché (quedó en `v2`).
**Arreglo:** red primero para HTML, JS y CSS. Solo los iconos van de caché.

### Los otros arreglos de la misma pasada

- No se podía **ensayar sin grabar**: el texto solo se movía grabando. Ahora un toque en el texto lo
  arranca y otro lo para; si llegó al final, vuelve al principio.
- La **cuenta regresiva no se podía cancelar** y tapaba la pantalla. Ahora se toca y se cancela.
- Al **volver de otra app**, iOS deja el `<video>` de la cámara en pausa: la imagen quedaba congelada
  sin ninguna pista. Ahora se reanuda sola.
- Si el teléfono **suelta la cámara** (llamada entrante), ahora lo dice y ofrece encenderla.
- Si el video de la revisión **no se puede abrir**, se dice en pantalla en vez de dejar un recuadro
  negro mudo. (Es lo que se ve en su captura del 27-08: el recuadro sin datos debajo.)
- "Grabar otra toma" dejaba el video **sonando por debajo**; ahora queda en pausa.
- El video vertical empujaba los botones **fuera de la pantalla**: limitado a 46 % del alto.
- La primera línea del guion quedaba 2 px **debajo de la barra** de botones.
- `moverPuntero` recorría las 170 palabras en cada avance; el reconocedor rearmaba el transcript
  entero en cada golpe de voz. Las dos cosas, ya no.
- Guardar un guion cuando el teléfono está lleno **fallaba en silencio**.

### Acierto de método

Antes de tocar una línea se escribieron las pruebas que reproducían las dos quejas en un navegador
de verdad: **9 fallaban**. Eso convirtió "se queda pegado" —una frase— en dos bugs concretos con
línea y causa. Al terminar: **20 pruebas de robustez + 17 de seguimiento + 11 de guiones + 21
controles de seguridad, todo verde**.

### Lo que NO se pudo verificar acá

Nadie ha corrido esto en un iPhone. Las pruebas corren en Edge con cámaras sintéticas, que reproducen
la **lógica** (formas de cámara, memoria, caídas) pero no el comportamiento propio de WebKit. La
confirmación del zoom y del texto pegado tiene que darla Lukas grabando una toma real.

## 27-08-2026 20:30 · "sigo sin poder deslizar para arriba y se sigue viendo el zoom"

Su reclamo traia tres cosas distintas mezcladas. Se separaron antes de tocar nada.

1. **"¿lo subiste?" — SI estaba subido.** Se comprobo bajando `index.html`, `app.js`, `app.css` y
   `sw.js` de https://lukasconejeros.github.io/prompter-cero/ y comparando el SHA-256 con los
   archivos locales del commit `f3a86d3`: identicos. Lo que no habia era forma de que el TELEFONO
   lo demostrara. **Arreglo: la app dice su version** (`VERSION` en `app.js`, se pinta en Ajustes,
   avisa sola cuando cambia) y `test-dedo-y-version.js` falla si `sw.js` no lleva el mismo numero.
   Leccion: una PWA sin version a la vista convierte cualquier duda en "no lo arreglaron".

2. **DESLIZAR CON EL DEDO no existia fuera del modo "Con el dedo".** `#prompter` estaba en
   `overflow:hidden` y solo `#app[data-modo="dedo"]` lo pasaba a `overflow-y:auto`. En "Te sigue"
   (el modo por defecto) arrastrar no hacia NADA: si la voz no lo seguia, el guion quedaba clavado
   y no habia salida manual. **Arreglo: arrastre propio con pointer events en los tres modos**,
   umbral de 8 px para distinguir el toque (ensayar) del arrastre (mover), corta el avance
   automatico al arrastrar e inercia corta al soltar. 12 pruebas nuevas, todas fallaban antes.

3. **EL ZOOM que sigue no es el bug de las constraints — es el recorte, y es fisica.** El arreglo
   del commit `f3a86d3` (pedir solo `height`) esta puesto y verificado. Lo que queda es otro
   mecanismo: si la camara entrega la imagen ACOSTADA, para sacar un archivo 9:16 hay que recortar
   los lados. `test-robustez.js` lo mide: **una camara de 1920x1080 termina en 608x1080** — de 1920
   px de ancho se guardan 608, o sea un tercio del campo de vision. Eso ES el zoom, y ninguna
   constraint lo arregla. **Arreglo posible hoy: decirselo con el dato y la salida** — al encender,
   la app avisa "tu camara entrega X x Y, acostada... si lo quieres completo pon «Como venga»".
   Falta el dato de su iPhone para saber si le pasa esto o si su camara ya entrega vertical (en ese
   caso el zoom seria el campo reducido de la camara frontal en Safari, otro problema distinto).
