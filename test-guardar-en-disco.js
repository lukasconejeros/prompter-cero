/* test-guardar-en-disco.js — el video ya no vive en la memoria.

   28-08-2026, lo que paso de verdad: grabo una toma de 819,8 MB, el visor la
   mostro en negro ("el telefono no pudo abrirlo aqui") y al tocar «Guardar en
   Fotos» Safari devolvio "Error de WebKitBlobResource 1". El video estaba
   SOLO en la memoria de la pagina: al cerrar la app se perdio entero.

   Estas pruebas cubren el arreglo:
     1. mientras grabas, los trozos se escriben en el telefono (OPFS via worker)
     2. al parar, la toma sale del DISCO, no de la memoria
     3. si la app se recarga, la toma sigue ahi y se puede rescatar
     4. un video enorme no se carga solo en el visor (era lo que ahogaba a Safari)
     5. borrarla del telefono es una decision suya, con boton

   node test-guardar-en-disco.js
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
      if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404).end("no"); return; }
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)] || "text/plain" });
      res.end(fs.readFileSync(f));
    });
    s.listen(0, "127.0.0.1", () => listo({ s, url: "http://127.0.0.1:" + s.address().port + "/" }));
  });
}

let pasan = 0, fallan = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasan++; console.log("  OK   " + nombre); }
  else { fallan++; console.log("  FALLA " + nombre + (detalle ? "  ->  " + detalle : "")); }
}

const diag = (p) => p.evaluate(() => window.__PC_DIAG());

/* cuantos bytes hay de verdad en el archivo del "telefono" */
const bytesEnDisco = (p, nombre) => p.evaluate(async (n) => {
  try {
    const raiz = await navigator.storage.getDirectory();
    const h = await raiz.getFileHandle(n);
    const f = await h.getFile();
    return f.size;
  } catch (e) { return -1; }
}, nombre);

async function abrirApp(ctx, url) {
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  p.__errores = errores;
  return p;
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

  console.log("\n1 · la toma se va escribiendo en el teléfono mientras grabas");
  const p = await abrirApp(ctx, url);
  await p.evaluate(() => {
    document.querySelector('#g-cuenta button[data-v="0"]').click();
    document.querySelector('#g-cal button[data-v="720"]').click();
  });
  await p.waitForTimeout(400);

  await p.tap("#b-rec");
  /* el aparato falso de Edge tarda ~4 s en soltar el primer trozo con imagen */
  await p.waitForTimeout(5500);
  const enVivo = await diag(p);
  ok("está escribiendo en el disco, no en la memoria", enVivo.enDisco === true, JSON.stringify({ enDisco: enVivo.enDisco }));
  ok("el archivo tiene nombre propio", /^toma-\d+\.(mp4|webm)$/.test(enVivo.discoNombre), enVivo.discoNombre);
  ok("ya hay bytes escritos antes de parar", enVivo.discoBytes > 0, "bytes " + enVivo.discoBytes);
  ok("no quedan pedazos colgando en la memoria", enVivo.trozos === 0, "trozos " + enVivo.trozos);

  const nombre = enVivo.discoNombre;
  await p.tap("#b-rec");
  await p.waitForTimeout(2500);

  console.log("\n2 · al parar, el video sale del disco");
  const cerrada = await diag(p);
  const bytes = await bytesEnDisco(p, nombre);
  ok("el archivo del teléfono tiene el video entero", bytes > 10000, "bytes " + bytes);
  ok("la app muestra esa toma", cerrada.pesaMB > 0, "MB " + cerrada.pesaMB);
  ok("queda anotada como pendiente de pasar a Fotos", cerrada.pendientes === 1, "pendientes " + cerrada.pendientes);
  ok("la hoja del video se abre sola",
    (await p.evaluate(() => document.getElementById("hoja-video").getAttribute("data-abierta"))) === "1");
  ok("le dice que la toma no se pierde",
    /no se pierde|guardada en tu teléfono/i.test(await p.evaluate(() => document.getElementById("nota-disco").textContent)));
  ok("sin errores de consola", p.__errores.length === 0, p.__errores.join(" | "));

  console.log("\n3 · si la app se recarga, la toma se rescata (lo que le faltó el 28-08)");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(5000);          /* el aviso del rescate espera a que pase el de la cámara */
  const tras = await diag(p);
  const aviso = await p.evaluate(() => document.getElementById("aviso").textContent);
  ok("al abrir avisa que hay una toma sin guardar", /sin pasar a Fotos/i.test(aviso), aviso);
  ok("el botón de ver el último video queda activo",
    (await p.evaluate(() => document.getElementById("b-ultimo").disabled)) === false);
  ok("la toma rescatada pesa lo mismo que el archivo", Math.abs(tras.pesaMB - bytes / 1048576) < 0.2,
    tras.pesaMB + " MB vs " + (bytes / 1048576).toFixed(1) + " MB");
  ok("sigue anotada como pendiente", tras.pendientes === 1, "pendientes " + tras.pendientes);

  console.log("\n4 · un video enorme no se carga solo en el visor");
  await p.evaluate(() => localStorage.setItem("pc.topeVisor", "0.001"));   /* como si todo pesara demasiado */
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    document.querySelector('#g-cuenta button[data-v="0"]').click();
    document.querySelector('#g-cal button[data-v="720"]').click();
  });
  await p.tap("#b-rec");
  await p.waitForTimeout(2500);
  await p.tap("#b-rec");
  await p.waitForTimeout(2500);
  const pesada = await p.evaluate(() => ({
    src: document.getElementById("rev").getAttribute("src"),
    verIgual: document.getElementById("b-ver-igual").hidden,
    datos: document.getElementById("rev-datos").textContent,
  }));
  ok("no le mete el video al visor", !pesada.src, "src " + pesada.src);
  ok("le explica por qué y le ofrece guardarlo igual", /pesa demasiado/i.test(pesada.datos), pesada.datos);
  ok("y deja verlo si insiste", pesada.verIgual === false);

  await p.tap("#b-ver-igual");
  await p.waitForTimeout(1500);
  const forzado = await p.evaluate(() => ({
    src: !!document.getElementById("rev").getAttribute("src"),
    verIgual: document.getElementById("b-ver-igual").hidden,
  }));
  ok("al insistir sí lo carga", forzado.src === true && forzado.verIgual === true);

  console.log("\n5 · borrar la copia del teléfono es decisión suya");
  const dosPend = await diag(p);
  ok("las tomas sin guardar se van sumando, no se pisan", dosPend.pendientes === 2, "pendientes " + dosPend.pendientes);
  await p.evaluate(() => { document.getElementById("b-borrar-toma").hidden = false; });
  await p.tap("#b-borrar-toma");
  await p.waitForTimeout(1200);
  const borrada = await diag(p);
  ok("al borrarla, se va del teléfono", (await bytesEnDisco(p, borrada.discoNombre)) === -1);
  ok("y deja de estar pendiente", borrada.pendientes === 1, "pendientes " + borrada.pendientes);
  ok("sin errores de consola", p.__errores.length === 0, p.__errores.join(" | "));

  await p.close();
  await navegador.close();
  s.close();
  console.log("\n" + pasan + " OK, " + fallan + " fallan");
  process.exit(fallan ? 1 : 0);
})();
