/* test-robustez.js — las fallas que Lukas sufrio el 27-08-2026 en el iPhone.

   Sus dos quejas, textuales:
     "se queda re pegado ahi, la app ya no se mueve mas"
     "cuando grabo tiene el medio zoom"

   Cada prueba de aqui nacio de una de las dos, o de un hermano del mismo bug
   cazado leyendo el codigo. Todas fallaban antes del arreglo.

   Corre con el Edge que ya esta en el PC (no descarga navegadores) y con
   playwright-core, que vive en whatsapp-mary.

   Uso:  node test-robustez.js
*/
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = __dirname;
const PW = "C:/Users/lukas/conejeros-lab/whatsapp-mary/node_modules/playwright-core";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function servidor() {
  return new Promise((listo) => {
    const s = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split("?")[0]);
      if (rel === "/") rel = "/index.html";
      const f = path.join(RAIZ, rel);
      if (!f.startsWith(RAIZ) || !fs.existsSync(f)) {
        res.writeHead(404).end("no");
        return;
      }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "text/plain" });
      res.end(fs.readFileSync(f));
    });
    s.listen(0, "127.0.0.1", () => listo({ s, url: "http://127.0.0.1:" + s.address().port + "/" }));
  });
}

/* espia que se instala ANTES de la app: cuenta grabadores, mira las
   constraints de la camara y lleva la cuenta de los blobs vivos */
const ESPIA = `
  window.__espia = { recs: 0, constraints: [], urlsVivas: 0, urlsCreadas: 0 };

  var OrigMR = window.MediaRecorder;
  if (OrigMR) {
    var MRfake = function (a, b) { window.__espia.recs++; return new OrigMR(a, b); };
    MRfake.isTypeSupported = function (t) { return OrigMR.isTypeSupported(t); };
    MRfake.prototype = OrigMR.prototype;
    window.MediaRecorder = MRfake;
  }

  var gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = function (c) {
    window.__espia.constraints.push(JSON.parse(JSON.stringify(c)));
    return gum(c);
  };

  var crear = URL.createObjectURL.bind(URL);
  var soltar = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (b) { window.__espia.urlsVivas++; window.__espia.urlsCreadas++; return crear(b); };
  URL.revokeObjectURL = function (u) { window.__espia.urlsVivas--; return soltar(u); };
`;

const GUION_LARGO = ("hola esto es una prueba larga del prompter para que el texto no quepa en pantalla y tenga que desplazarse " +
  "asi podemos medir si el guion avanza solo cuando el telefono no puede escuchar al que habla ").repeat(6);

let pasan = 0, fallan = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasan++; console.log("  OK   " + nombre); }
  else { fallan++; console.log("  FALLA " + nombre + (detalle ? "  ->  " + detalle : "")); }
}

async function abrirApp(ctx, url, sinVoz) {
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await p.addInitScript(ESPIA);
  if (sinVoz) {
    await p.addInitScript(`
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    `);
  }
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  p.__errores = errores;
  return p;
}

async function ponerGuion(p, txt) {
  await p.click("#b-guion");
  await p.waitForTimeout(300);
  await p.evaluate((t) => {
    const ta = document.getElementById("ta");
    ta.value = t;
    ta.dispatchEvent(new Event("input"));
  }, txt);
  await p.click("#b-usar");
  await p.waitForTimeout(400);
}

async function ajuste(p, grupo, valor) {
  await p.evaluate(([g, v]) => {
    document.querySelector("#" + g + ' button[data-v="' + v + '"]').click();
  }, [grupo, valor]);
  await p.waitForTimeout(200);
}

(async () => {
  const { chromium } = require(PW);
  const { s, url } = await servidor();
  const navegador = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    permissions: ["camera", "microphone"],
  });

  /* ---------------------------------------------------------------
     1 · SU QUEJA: "se queda re pegado ahi, la app ya no se mueve mas"
     Si el iPhone no deja escuchar (PWA instalada, iOS viejo, permiso
     denegado), el modo "te sigue" se iba en silencio y el texto no
     avanzaba NUNCA. Tiene que caer solo al modo automatico y avisar.
     --------------------------------------------------------------- */
  console.log("\n1 · el texto avanza aunque el telefono no pueda escuchar");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "voz");
    await ajuste(p, "g-cuenta", "0");
    await p.click("#b-rec");
    await p.waitForTimeout(2500);

    const est = await p.evaluate(() => ({
      scroll: document.getElementById("prompter").scrollTop,
      alcance: document.getElementById("prompter").scrollHeight - document.getElementById("prompter").clientHeight,
      aviso: document.getElementById("aviso").textContent,
      grabando: document.getElementById("app").getAttribute("data-rec"),
    }));
    ok("el guion tiene de donde desplazarse", est.alcance > 20, "alcance " + est.alcance);
    ok("el texto avanzo solo", est.scroll > 0, "scrollTop " + est.scroll);
    ok("le avisa por que cambio de modo", /escuchar|autom/i.test(est.aviso), est.aviso);
    ok("siguio grabando igual", est.grabando === "1");
    await p.click("#b-rec");
    await p.waitForTimeout(800);
    await p.close();
  }

  /* ---------------------------------------------------------------
     2 · ensayar sin grabar
     Un teleprompter que solo se mueve mientras grabas no sirve para
     ensayar. El texto tiene que poder avanzar sin estar grabando.
     --------------------------------------------------------------- */
  console.log("\n2 · se puede ensayar sin grabar");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "auto");
    await p.click("#prompter");          /* un toque en el texto = ensayar */
    await p.waitForTimeout(2200);
    const est = await p.evaluate(() => ({
      scroll: document.getElementById("prompter").scrollTop,
      grabando: document.getElementById("app").getAttribute("data-rec"),
      recs: window.__espia.recs,
    }));
    ok("el texto avanza sin grabar", est.scroll > 0, "scrollTop " + est.scroll);
    ok("y no empezo a grabar sin permiso", est.grabando !== "1" && est.recs === 0);
    await p.close();
  }

  /* ---------------------------------------------------------------
     3 · doble toque en la cuenta regresiva
     Tocar dos veces el boton rojo mientras corre la cuenta arrancaba
     DOS grabadores sobre la misma camara: el primero queda huerfano
     grabando para siempre y se come la memoria del telefono.
     --------------------------------------------------------------- */
  console.log("\n3 · tocar dos veces el boton de grabar no abre dos grabadores");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "3");
    await p.click("#b-rec");
    await p.waitForTimeout(400);
    await p.click("#b-rec");   // segundo toque durante la cuenta
    await p.waitForTimeout(4500);
    const est = await p.evaluate(() => ({
      recs: window.__espia.recs,
      rec: document.getElementById("app").getAttribute("data-rec"),
    }));
    ok("un solo grabador", est.recs <= 1, "se abrieron " + est.recs);
    await p.evaluate(() => { if (document.getElementById("app").getAttribute("data-rec") === "1") document.getElementById("b-rec").click(); });
    await p.waitForTimeout(1000);
    await p.close();
  }

  /* ---------------------------------------------------------------
     4 · la memoria: tres tomas seguidas
     Cada toma dejaba su video entero vivo en memoria (el blob y su
     direccion nunca se soltaban). Tres tomas de un minuto a 20 Mbps
     son 450 MB: Safari se ahoga y la app "no se mueve mas".
     --------------------------------------------------------------- */
  console.log("\n4 · las tomas viejas se sueltan de la memoria");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    for (let i = 0; i < 3; i++) {
      await p.click("#b-rec");
      await p.waitForTimeout(1500);
      await p.click("#b-rec");
      await p.waitForTimeout(1200);
      await p.click("#b-otra");
      await p.waitForTimeout(400);
    }
    const est = await p.evaluate(() => ({
      vivas: window.__espia.urlsVivas,
      creadas: window.__espia.urlsCreadas,
      trozos: window.__PC_DIAG ? window.__PC_DIAG().trozos : -1,
    }));
    ok("no se acumulan videos en memoria", est.vivas <= 1,
      "quedaron " + est.vivas + " vivas de " + est.creadas + " creadas");
    ok("los pedazos de la toma vieja se sueltan", est.trozos === 0, "trozos: " + est.trozos);
    await p.close();
  }

  /* ---------------------------------------------------------------
     5 · SU QUEJA: "cuando grabo tiene el medio zoom"
     Pedirle a la camara una forma (aspectRatio) o una resolucion que
     no tiene hace que Safari recorte el sensor: se ve todo mas cerca.
     --------------------------------------------------------------- */
  console.log("\n5 · a la camara no se le piden imposibles (el zoom)");
  {
    const p = await abrirApp(ctx, url, true);
    const c = await p.evaluate(() => window.__espia.constraints[0]);
    const v = c && c.video ? c.video : {};
    ok("no se fuerza la forma de la imagen", !("aspectRatio" in v), JSON.stringify(v));
    ok("no se pide ancho y alto a la vez (eso obliga una forma)", !("width" in v), JSON.stringify(v));
    await p.close();
  }

  /* ---------------------------------------------------------------
     6 · lo que se ve es lo que se graba
     Con "Vertical 9:16" el archivo tiene que salir 9:16 aunque la
     camara entregue cuadrado o 4:3 (el visor ya mostraba 9:16).
     --------------------------------------------------------------- */
  console.log("\n6 · en «Vertical 9:16» el archivo sale 9:16");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-formato", "vertical");
    await ajuste(p, "g-cuenta", "0");
    await p.click("#b-rec");
    await p.waitForTimeout(2000);
    await p.click("#b-rec");
    await p.waitForTimeout(2500);
    const est = await p.evaluate(() => {
      const r = document.getElementById("rev");
      return { w: r.videoWidth, h: r.videoHeight, datos: document.getElementById("rev-datos").textContent };
    });
    const prop = est.h ? est.w / est.h : 0;
    ok("el video quedo vertical 9:16", Math.abs(prop - 9 / 16) < 0.02,
      est.w + "x" + est.h + " (proporcion " + prop.toFixed(3) + ", 9:16 = 0.563)");
    ok("no se pierde resolucion: al menos 1080 de ancho o lo maximo que da la camara",
      est.w >= 1080 || est.h <= 1080, est.w + " de ancho");
    await p.close();
  }

  /* ---------------------------------------------------------------
     7 · la hoja del video no deja la app trabada
     Al volver a grabar, el video de revision tiene que quedar callado
     y descargado; si no, sigue sonando encima de la toma nueva.
     --------------------------------------------------------------- */
  console.log("\n7 · «grabar otra toma» deja la pantalla limpia");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.click("#b-rec");
    await p.waitForTimeout(1500);
    await p.click("#b-rec");
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById("rev").play().catch(() => {}));
    await p.waitForTimeout(500);
    await p.click("#b-otra");
    await p.waitForTimeout(600);
    const est = await p.evaluate(() => ({
      pausado: document.getElementById("rev").paused,
      hojas: [...document.querySelectorAll(".hoja[data-abierta]")].map((h) => h.id).join(","),
      velo: document.getElementById("velo").getAttribute("data-on"),
    }));
    ok("el video de la revision queda en pausa", est.pausado === true);
    ok("no queda ninguna hoja abierta", est.hojas === "", est.hojas);
    ok("el velo se quita", !est.velo);
    await p.close();
  }

  /* ---------------------------------------------------------------
     8 · la geometria con camaras de distintas formas
     El iPhone puede entregar 4:3 vertical, 16:9 acostado o cuadrado.
     Con "Vertical 9:16" el archivo tiene que salir 9:16 en los tres,
     y sin inventar pixeles: si la camara da 1440x1920, el archivo
     tiene que quedar en 1080x1920 clavado.
     --------------------------------------------------------------- */
  console.log("");
  console.log("8 · sale 9:16 venga como venga la camara");
  for (const forma of [{ w: 1440, h: 1920, esp: "1080x1920" }, { w: 1920, h: 1080, esp: "608x1080" }]) {
    const p = await ctx.newPage();
    await p.addInitScript(ESPIA);
    await p.addInitScript(`
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
      /* camara de mentira con la forma exacta que queremos probar */
      navigator.mediaDevices.getUserMedia = function () {
        var c = document.createElement("canvas");
        c.width = ${forma.w}; c.height = ${forma.h};
        var g = c.getContext("2d");
        (function pintar(){
          g.fillStyle = "#345"; g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = "#fff"; g.fillRect(c.width / 2 - 40, c.height / 2 - 40, 80, 80);
          requestAnimationFrame(pintar);
        })();
        return Promise.resolve(c.captureStream(30));
      };
    `);
    await p.goto(url, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-formato", "vertical");
    await ajuste(p, "g-cuenta", "0");

    const salida = await p.evaluate(() => window.__PC_DIAG().salida);
    ok("camara " + forma.w + "x" + forma.h + " se graba " + forma.esp,
      salida.ancho + "x" + salida.alto === forma.esp, "dio " + salida.ancho + "x" + salida.alto);

    await p.click("#b-rec");
    await p.waitForTimeout(2000);
    await p.click("#b-rec");
    await p.waitForTimeout(2500);
    const arch = await p.evaluate(() => {
      const r = document.getElementById("rev");
      return r.videoWidth + "x" + r.videoHeight;
    });
    ok("y el archivo de verdad quedo " + forma.esp, arch === forma.esp, "dio " + arch);
    await p.close();
  }


  console.log("\n=========================================");
  console.log("  " + pasan + " OK · " + fallan + " fallan");
  console.log("=========================================\n");

  await navegador.close();
  s.close();
  process.exit(fallan ? 1 : 0);
})().catch((e) => {
  console.error("FALLO EL BANCO:", e);
  process.exit(1);
});
