/* test-dedo-y-version.js — la queja del 27-08-2026 20:10:

     "sigo sin poder deslizar para arriba y se sigue viendo el zoom
      asi que no se que arreglaste o si no lo subiste"

   Dos cosas distintas, dos familias de pruebas:

   A) DESLIZAR CON EL DEDO. Hasta ahora el texto solo se podia mover con el
      dedo en el modo "Con el dedo": en "Te sigue" y en "Solo" el prompter
      tenia overflow:hidden, asi que arrastrar no hacia NADA. Si la voz no
      lo seguia, el guion quedaba clavado y no habia forma manual de subirlo.

   B) SABER QUE VERSION CORRE EL TELEFONO. No tenia como distinguir "no lo
      arreglaron" de "mi iPhone tiene la version vieja en cache". Ahora la
      app dice su version, y la del service worker tiene que ser la misma.

   Corre con el Edge del PC y playwright-core de whatsapp-mary:
     node test-dedo-y-version.js
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

const GUION_LARGO = ("hola esto es una prueba larga del prompter para que el texto no quepa en pantalla y tenga que desplazarse " +
  "asi podemos medir si el guion se puede subir con el dedo en cualquiera de los tres modos de avance ").repeat(6);

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
  if (sinVoz) {
    await p.addInitScript(`
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    `);
  }
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  p.__errores = errores;
  return p;
}

async function ponerGuion(p, txt) {
  await p.click("#b-guion");
  await p.waitForTimeout(250);
  await p.evaluate((t) => {
    const ta = document.getElementById("ta");
    ta.value = t;
    ta.dispatchEvent(new Event("input"));
  }, txt);
  await p.click("#b-usar");
  await p.waitForTimeout(350);
}

async function ajuste(p, grupo, valor) {
  await p.evaluate(([g, v]) => {
    document.querySelector("#" + g + ' button[data-v="' + v + '"]').click();
  }, [grupo, valor]);
  await p.waitForTimeout(150);
}

/* arrastre de verdad: pointerdown -> varios move -> pointerup, como un dedo */
async function arrastrar(p, dy) {
  const caja = await p.evaluate(() => {
    const r = document.getElementById("prompter").getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p.mouse.move(caja.x, caja.y);
  await p.mouse.down();
  const pasos = 8;
  for (let i = 1; i <= pasos; i++) {
    await p.mouse.move(caja.x, caja.y + (dy * i) / pasos);
    await p.waitForTimeout(16);
  }
  await p.mouse.up();
  await p.waitForTimeout(250);
}

const scroll = (p) => p.evaluate(() => document.getElementById("prompter").scrollTop);
const ensayando = (p) => p.evaluate(() => window.__PC_DIAG().auto);

(async () => {
  const { chromium } = require(PW);
  const { s, url } = await servidor();
  const navegador = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    permissions: ["camera", "microphone"],
  });

  console.log("\nA · deslizar el guion con el dedo, EN LOS TRES MODOS");
  for (const modo of ["voz", "auto", "dedo"]) {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", modo);
    const antes = await scroll(p);
    await arrastrar(p, -220);                      /* el dedo sube = el texto sube */
    const despues = await scroll(p);
    ok("modo «" + modo + "»: el dedo sube el texto", despues > antes + 40, "scrollTop " + antes + " -> " + despues);
    await p.close();
  }

  console.log("\nB · el arrastre y el toque no se pisan");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "auto");
    await arrastrar(p, -200);
    ok("arrastrar NO arranca el ensayo solo", (await ensayando(p)) === false);

    await p.click("#prompter");                    /* un toque limpio si ensaya */
    await p.waitForTimeout(400);
    ok("un toque sigue arrancando el ensayo", (await ensayando(p)) === true);

    const enMarcha = await scroll(p);
    await arrastrar(p, 150);                       /* el dedo baja = volver atras */
    const trasArrastre = await scroll(p);
    ok("arrastrar mientras ensaya para el ensayo", (await ensayando(p)) === false);
    ok("y el texto obedece al dedo", trasArrastre < enMarcha, enMarcha + " -> " + trasArrastre);
    await p.close();
  }

  console.log("\nC · el guion se puede volver a bajar (no solo subir)");
  {
    const p = await abrirApp(ctx, url, true);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "voz");
    await arrastrar(p, -260);
    const arriba = await scroll(p);
    await arrastrar(p, 260);
    const abajo = await scroll(p);
    ok("baja de vuelta con el dedo", abajo < arriba, arriba + " -> " + abajo);
    await p.close();
  }

  console.log("\nD · la app dice que version corre (para saber si el telefono esta viejo)");
  {
    const p = await abrirApp(ctx, url, true);
    const v = await p.evaluate(() => window.__PC_VERSION || null);
    ok("la app expone su version", !!v, String(v));
    await p.click("#b-ajustes");
    await p.waitForTimeout(300);
    const visible = await p.evaluate(() => {
      const e = document.getElementById("version");
      return e ? e.textContent.trim() : "";
    });
    ok("y la muestra escrita en Ajustes", visible.length > 3 && visible.indexOf(String(v)) >= 0, visible);

    const swTxt = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
    ok("el cache del service worker lleva la misma version", swTxt.indexOf('prompter-cero-' + v) >= 0,
       (swTxt.match(/prompter-cero-[\w.]+/) || [""])[0] + " vs " + v);
    ok("sin errores de consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  console.log("\nE - el dato que explica el zoom se ve en pantalla, no solo en Ajustes");
  {
    const p = await abrirApp(ctx, url, true);
    await p.waitForTimeout(1500);
    const aviso = await p.evaluate(() => document.getElementById("aviso").textContent);
    ok("dice cuanto entrega la camara al encender", /[0-9]+ . [0-9]+/.test(aviso), aviso);
    ok("y si va a recortar, explica el zoom y la salida", /recort|vertical/i.test(aviso), aviso);
    await p.close();
  }

  await navegador.close();
  s.close();
  console.log("\n" + pasan + " OK, " + fallan + " fallan");
  process.exit(fallan ? 1 : 0);
})();
