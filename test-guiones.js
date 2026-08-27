/* test-guiones.js — prueba de verdad que los 3 guiones vienen dentro de la app
   y que tocando uno queda cargado en el prompter.

   Nacio el 27-08-2026 con el encargo de Lukas: "que esten estos tres archivos,
   cosa de que yo lo apriete y en mi telefono se abra". Sin esto, "listo" seria
   una promesa: el navegador es el unico que dice si funciona.

   Corre con el Edge/Chrome que ya esta en el PC (no descarga nada) y con
   playwright-core, que vive en whatsapp-mary.

   Uso:  node test-guiones.js
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
    s.listen(0, "127.0.0.1", () => listo(s));
  });
}

const casos = [];
function ok(nombre, cond, detalle) {
  casos.push({ nombre, bien: !!cond, detalle: detalle || "" });
}

(async () => {
  const { chromium } = require(PW);
  const s = await servidor();
  const url = "http://127.0.0.1:" + s.address().port + "/";

  let navegador = null;
  for (const canal of ["msedge", "chrome"]) {
    try {
      navegador = await chromium.launch({
        channel: canal,
        args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      });
      console.log("navegador: " + canal);
      break;
    } catch (e) { /* probamos el siguiente */ }
  }
  if (!navegador) {
    console.log("no hay Edge ni Chrome para probar; no puedo verificar nada");
    s.close();
    process.exit(2);
  }

  const pag = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  const errores = [];
  pag.on("pageerror", (e) => errores.push(String(e)));

  await pag.goto(url, { waitUntil: "load" });
  await pag.waitForTimeout(600);

  // 1 · los 3 guiones llegaron dentro de la app
  const cuantos = await pag.evaluate(() => (window.GUIONES_LUKAS || []).length);
  ok("los 3 guiones vienen dentro de la app", cuantos === 3, cuantos + " cargados");

  // 2 · la lista se pinta con sus nombres
  await pag.click("#b-guion");
  await pag.waitForTimeout(300);
  const nombres = await pag.$$eval("#lista-mios .n b", (ns) => ns.map((n) => n.textContent));
  ok("se ven los 3 con su nombre", nombres.length === 3, nombres.join(" | "));
  ok("el tercero es el del que te debe plata",
     (nombres[2] || "").indexOf("El que te debe plata") >= 0, nombres[2] || "");

  // 3 · tocar el tercero lo deja cargado en el prompter Y cierra la hoja
  await pag.click('#lista-mios button[data-mio="2"]');
  await pag.waitForTimeout(400);

  const palabras = await pag.$$eval("#texto w", (ws) => ws.length);
  ok("al tocarlo queda cargado en el prompter", palabras === 173, palabras + " palabras en pantalla");

  const dice = await pag.$eval("#texto", (t) => t.textContent);
  ok("dice la venta nueva del prompt (v11)",
     dice.indexOf("Armé tu cobrador personal") >= 0 && dice.indexOf("Te aconseja hasta dónde apretar") >= 0);
  ok("dice la palabra del CTA", dice.indexOf("Comenta PROMPT") >= 0);

  const abierta = await pag.$eval("#hoja-guion", (h) => h.getAttribute("data-abierta"));
  ok("la hoja se cierra sola y queda listo para grabar", abierta !== "1");

  // 4 · queda para la proxima vez que abra la app
  const guardado = await pag.evaluate(() => localStorage.getItem("pc.guionActual") || "");
  ok("queda guardado para la proxima vez", guardado.indexOf("cobrador personal") >= 0);

  await pag.reload({ waitUntil: "load" });
  await pag.waitForTimeout(600);
  const tras = await pag.$$eval("#texto w", (ws) => ws.length);
  ok("sigue ahi despues de cerrar y abrir la app", tras === 173, tras + " palabras");

  // 5 · lo suyo sigue funcionando: pegar un guion a mano
  await pag.click("#b-guion");
  await pag.waitForTimeout(250);
  await pag.fill("#ta", "hola esto es una prueba de pegar a mano");
  await pag.click("#b-usar");
  await pag.waitForTimeout(300);
  const propio = await pag.$$eval("#texto w", (ws) => ws.length);
  ok("pegar un guion a mano sigue funcionando", propio === 9, propio + " palabras");

  ok("cero errores de javascript", errores.length === 0, errores.join(" / "));

  await navegador.close();
  s.close();

  let malos = 0;
  for (const c of casos) {
    if (!c.bien) malos++;
    console.log((c.bien ? "  PASA  " : "  FALLA ") + c.nombre + (c.detalle ? "   (" + c.detalle + ")" : ""));
  }
  console.log("\n" + (casos.length - malos) + "/" + casos.length + (malos ? "  ❌ HAY FALLOS" : "  ✅ TODO BIEN"));
  process.exit(malos ? 1 : 0);
})().catch((e) => {
  console.error("revento la prueba:", e);
  process.exit(3);
});
