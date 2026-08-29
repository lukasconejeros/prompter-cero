/* grabador-disco.js — el video se escribe en el TELEFONO mientras grabas.

   Por que existe (28-08-2026): Lukas grabo una toma de 819,8 MB y la perdio.
   Hasta hoy el video vivia entero en la memoria de la pagina hasta que lo
   guardabas: el visor no pudo abrirlo y al tocar «Guardar en Fotos» Safari
   respondio "Error de WebKitBlobResource 1" -no pudo materializar una URL
   blob de ese tamano-. Sin copia en disco, cerrar la app = video perdido.

   Ahora cada trozo que suelta MediaRecorder se escribe aqui, en el
   almacenamiento privado del origen (OPFS), con `createSyncAccessHandle`
   -que solo existe dentro de un worker, por eso este archivo-. El video
   sobrevive a que la app se recargue o se quede sin memoria.
*/
"use strict";

var acceso = null, manija = null, escrito = 0;

self.onmessage = function (ev) {
  var m = ev.data || {};

  if (m.tipo === "abrir") {
    (async function () {
      try {
        var raiz = await navigator.storage.getDirectory();
        manija = await raiz.getFileHandle(m.nombre, { create: true });
        acceso = await manija.createSyncAccessHandle();
        acceso.truncate(0);
        escrito = 0;
        self.postMessage({ tipo: "listo", nombre: m.nombre });
      } catch (e) {
        self.postMessage({ tipo: "sin-disco", error: (e && (e.name || e.message)) || "" });
      }
    })();
    return;
  }

  if (m.tipo === "trozo") {
    if (!acceso) { self.postMessage({ tipo: "sin-disco", error: "sin acceso" }); return; }
    try {
      escrito += acceso.write(new Uint8Array(m.datos), { at: escrito });
      self.postMessage({ tipo: "escrito", bytes: escrito });
    } catch (e) {
      /* lo mas probable aca es que no quepa: el telefono tiene cuota por sitio */
      self.postMessage({ tipo: "no-cabe", error: (e && (e.name || e.message)) || "", bytes: escrito });
    }
    return;
  }

  if (m.tipo === "cerrar") {
    try { acceso.flush(); } catch (e) {}
    try { acceso.close(); } catch (e) {}
    acceso = null;
    self.postMessage({ tipo: "cerrado", bytes: escrito });
    return;
  }
};
