/* test-microfono-y-velocidad.js — su reclamo del 26-10-2026, textual:

     "de repente no se escucha el sonido, eso de que me siga con la voz no
      funciona bien. Mejor que yo le pueda aumentar y disminuir la velocidad
      en que estan apareciendo el texto... de repente me grabo y no se escucha
      mi audio, o de repente grabo y me dice no se alcanzo a grabar nada"

   A) EL SEGUIMIENTO POR VOZ SE VA. Quien lo tenia guardado pasa a «Solo».
   B) LA VELOCIDAD se sube y se baja en la misma pantalla de grabar, tambien
      con la toma andando, y queda guardada.
   C) EL MICROFONO. La app abria el microfono UNA vez, al abrirse, y lo usaba
      en todas las tomas sin mirarlo. El iPhone lo apaga o lo deja mudo cuando
      te vas a otra app, entra una llamada u otra cosa lo ocupa, y no lo
      devuelve (WebKit 218815, 173268): desde ahi TODAS las tomas salen mudas.
      Aca se simula igual: el track terminado (`stop()`) y el track mudo pero
      "vivo" (`enabled = false` entrega ceros, igual que un mudo de iOS).
   D) EL RASTRO: "no quedo nada grabado" hoy no se puede explicar porque la
      app no anota nada de la toma. Ahora queda un registro en Ajustes.

   Corre con el Edge del PC y playwright-core de whatsapp-mary:
     node test-microfono-y-velocidad.js
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
  "asi se puede medir a que velocidad sube el guion cuando le doy mas rapido o mas lento con los botones ").repeat(8);

/* borra lo guardado SOLO la primera vez: el init script corre en cada recarga */
const LIMPIA = `if(!sessionStorage.getItem("limpia")){ localStorage.clear(); sessionStorage.setItem("limpia","1"); }`;

let pasan = 0, fallan = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasan++; console.log("  OK   " + nombre); }
  else { fallan++; console.log("  FALLA " + nombre + (detalle ? "  ->  " + detalle : "")); }
}

async function abrirApp(ctx, url, antes) {
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  if (antes) await p.addInitScript(antes);
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  p.__errores = errores;
  return p;
}

async function ponerGuion(p, txt) {
  await p.evaluate((t) => {
    const ta = document.getElementById("ta");
    ta.value = t;
    ta.dispatchEvent(new Event("input"));
    document.getElementById("b-usar").click();
  }, txt);
  await p.waitForTimeout(350);
}

async function ajuste(p, grupo, valor) {
  await p.evaluate(([g, v]) => {
    document.querySelector("#" + g + ' button[data-v="' + v + '"]').click();
  }, [grupo, valor]);
  await p.waitForTimeout(150);
}

const scroll = (p) => p.evaluate(() => document.getElementById("prompter").scrollTop);
const aviso = (p) => p.evaluate(() => document.getElementById("aviso").textContent);
const grabando = (p) => p.evaluate(() => document.getElementById("app").getAttribute("data-rec") === "1");

/* el track de microfono que esta usando la app ahora */
const mic = (p) => p.evaluate(() => {
  const s = document.getElementById("cam").srcObject;
  const t = s && s.getAudioTracks()[0];
  return t ? { id: t.id, estado: t.readyState, prendido: t.enabled } : null;
});

/* pixeles por segundo que sube el guion, medidos en vivo */
async function rapidez(p) {
  const a = await scroll(p);
  await p.waitForTimeout(1000);
  const b = await scroll(p);
  return b - a;
}

/* simula que iOS esconde la app (te fuiste a otra) y la vuelve a mostrar */
async function irYVolver(p) {
  await p.evaluate(async () => {
    let oculto = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => oculto });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (oculto ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 300));
    oculto = false;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForTimeout(1500);
}

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

  /* =================================================================
     A · el seguimiento por voz ya no existe
     ================================================================= */
  console.log("\nA · el seguimiento por voz se fue; el texto sube solo");
  {
    const p = await abrirApp(ctx, url, `localStorage.setItem("pc.modo", JSON.stringify("voz"));`);
    const modos = await p.evaluate(() => [...document.querySelectorAll("#g-modo button")].map((b) => b.getAttribute("data-v")));
    ok("en Ajustes ya no aparece «Te sigue»", modos.indexOf("voz") === -1, modos.join(","));
    ok("quedan «Solo» y «Con el dedo»", modos.indexOf("auto") > -1 && modos.indexOf("dedo") > -1, modos.join(","));
    ok("si lo tenía guardado en voz, pasa a «Solo»",
      (await p.evaluate(() => document.getElementById("app").getAttribute("data-modo"))) === "auto");
    ok("y queda guardado así", (await p.evaluate(() => localStorage.getItem("pc.modo"))) === '"auto"');
    await p.close();
  }
  {
    const p = await abrirApp(ctx, url, LIMPIA);
    ok("recién instalada arranca en «Solo»",
      (await p.evaluate(() => document.getElementById("app").getAttribute("data-modo"))) === "auto");
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.tap("#b-rec");
    await p.waitForTimeout(1800);
    ok("al grabar, el texto sube solo", (await scroll(p)) > 5, "scrollTop " + (await scroll(p)));
    ok("y no intenta escucharte", (await p.evaluate(() => window.__PC_DIAG().escuchando)) !== true);
    await p.tap("#b-rec");
    await p.waitForTimeout(1500);
    await p.close();
  }

  /* =================================================================
     B · la velocidad, en la misma pantalla de grabar
     ================================================================= */
  console.log("\nB · más rápido y más lento con botones en la pantalla");
  {
    const p = await abrirApp(ctx, url, LIMPIA);
    const vis = await p.evaluate(() => {
      const ver = (id) => {
        const e = document.getElementById(id);
        if (!e) return false;
        const b = e.getBoundingClientRect();
        return b.width > 30 && b.height > 30 && b.top >= 0 && b.bottom <= innerHeight &&
          getComputedStyle(e).visibility !== "hidden" && getComputedStyle(e).display !== "none";
      };
      return { menos: ver("b-menos"), mas: ver("b-mas") };
    });
    ok("el botón «más lento» está a la vista, de buen tamaño", vis.menos);
    ok("el botón «más rápido» está a la vista, de buen tamaño", vis.mas);

    const leer = () => p.evaluate(() => (document.getElementById("vel-dato") || {}).textContent || "");
    ok("dice la velocidad en pantalla", /1,0/.test(await leer()), await leer());
    if (vis.mas) await p.tap("#b-mas");
    await p.waitForTimeout(150);
    ok("«más rápido» la sube", /1,1/.test(await leer()), await leer());
    if (vis.menos) { await p.tap("#b-menos"); await p.tap("#b-menos"); }
    await p.waitForTimeout(150);
    ok("«más lento» la baja", /0,9/.test(await leer()), await leer());

    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    ok("queda guardada al cerrar y abrir", /0,9/.test(await leer()), await leer());
    ok("Ajustes muestra la misma", /0,9/.test(await p.evaluate(() => document.getElementById("d-vel").textContent)));

    /* con la toma andando: tiene que cambiar AL TIRO */
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.tap("#b-rec");
    await p.waitForTimeout(1200);
    const r1 = await rapidez(p);
    for (let i = 0; i < 10; i++) { if (vis.mas) await p.tap("#b-mas"); }
    await p.waitForTimeout(200);
    const r2 = await rapidez(p);
    ok("grabando, «más rápido» acelera el texto al tiro", r2 > r1 * 1.6, r1 + " px/s -> " + r2 + " px/s");
    ok("y la toma sigue andando", await grabando(p));
    for (let i = 0; i < 14; i++) { if (vis.menos) await p.tap("#b-menos"); }
    await p.waitForTimeout(200);
    const r3 = await rapidez(p);
    ok("grabando, «más lento» lo frena", r3 < r2 * 0.6, r2 + " px/s -> " + r3 + " px/s");
    await p.tap("#b-rec");
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById("b-otra").click());   /* cierra la hoja del video */
    await p.waitForTimeout(400);

    /* los topes: no se puede llegar a 0 ni a una locura */
    for (let i = 0; i < 40; i++) { if (vis.menos) await p.tap("#b-menos"); }
    ok("no baja de 0,4×", /0,4/.test(await leer()), await leer());
    for (let i = 0; i < 40; i++) { if (vis.mas) await p.tap("#b-mas"); }
    ok("no sube de 3,0×", /3,0/.test(await leer()), await leer());

    await ajuste(p, "g-modo", "dedo");
    const enDedo = await p.evaluate(() => {
      const e = document.getElementById("b-mas");
      return e ? getComputedStyle(e.parentElement).display : "none";
    });
    ok("en «Con el dedo» los botones se esconden (no hay velocidad que cambiar)", enDedo === "none", enDedo);
    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  /* =================================================================
     C · el micrófono se revisa antes y durante cada toma
     ================================================================= */
  console.log("\nC · el micrófono");
  {
    /* C1 · el teléfono le TERMINÓ el micrófono (llamada, otra app) */
    const p = await abrirApp(ctx, url, LIMPIA);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    const antes = await mic(p);
    await p.evaluate(() => document.getElementById("cam").srcObject.getAudioTracks()[0].stop());
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    const despues = await mic(p);
    ok("con el micrófono terminado, antes de grabar lo abre de nuevo",
      despues && despues.estado === "live" && despues.id !== antes.id, JSON.stringify(despues));
    ok("y la toma igual arranca", await grabando(p));
    await p.tap("#b-rec");
    await p.waitForTimeout(1500);
    await p.close();
  }
  {
    /* C2 · el micrófono "vivo" pero mudo: el caso de iOS que no avisa */
    const p = await abrirApp(ctx, url, LIMPIA);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.tap("#prompter");            /* un gesto, como en el teléfono */
    await p.tap("#prompter");
    await p.waitForTimeout(1500);
    const antes = await mic(p);
    await p.evaluate(() => { document.getElementById("cam").srcObject.getAudioTracks()[0].enabled = false; });
    await p.waitForTimeout(3200);        /* más que la ventana de silencio */
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    const despues = await mic(p);
    ok("con el micrófono mudo, antes de grabar lo abre de nuevo",
      despues && despues.id !== antes.id && despues.prendido, JSON.stringify(despues));
    ok("y la toma arranca", await grabando(p));
    await p.tap("#b-rec");
    await p.waitForTimeout(1500);
    await p.close();
  }
  {
    /* C3 · se queda mudo EN MEDIO de la toma */
    const p = await abrirApp(ctx, url, LIMPIA);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    await p.evaluate(() => { document.getElementById("cam").srcObject.getAudioTracks()[0].enabled = false; });
    await p.waitForTimeout(3500);
    const a = await aviso(p);
    ok("si el micrófono se queda mudo grabando, te lo dice al tiro", /micr[oó]fono/i.test(a), a);
    ok("y queda escrito en el reloj mientras dure",
      (await p.evaluate(() => document.getElementById("app").getAttribute("data-mic"))) === "mudo");
    const lineas = await p.evaluate(() => JSON.parse(localStorage.getItem("pc.registro") || "[]")
      .filter((l) => /dejó de entregar/.test(l)).length);
    ok("el registro lo anota UNA vez, no cada 150 ms", lineas === 1, lineas + " líneas");
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    const tras = await mic(p);
    ok("al parar esa toma, deja un micrófono nuevo listo para la siguiente", tras && tras.prendido && tras.estado === "live",
      JSON.stringify(tras));
    await p.close();
  }
  {
    /* C4 · el teléfono termina el micrófono EN MEDIO de la toma */
    const p = await abrirApp(ctx, url, LIMPIA);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    /* stop() desde código no dispara "ended"; cuando el teléfono lo corta, sí */
    await p.evaluate(() => {
      const t = document.getElementById("cam").srcObject.getAudioTracks()[0];
      t.stop(); t.dispatchEvent(new Event("ended"));
    });
    await p.waitForTimeout(800);
    const a = await aviso(p);
    ok("si el teléfono le corta el micrófono grabando, te lo dice", /micr[oó]fono/i.test(a), a);
    await p.close();
  }
  {
    /* C5 · volver de otra app = micrófono nuevo */
    const p = await abrirApp(ctx, url, LIMPIA);
    const antes = await mic(p);
    await irYVolver(p);
    const despues = await mic(p);
    ok("al volver de otra app abre cámara y micrófono nuevos",
      despues && despues.id !== antes.id && despues.estado === "live", JSON.stringify({ antes, despues }));
    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  /* =================================================================
     D · el registro de la última toma (para que nunca más sea "no sé")
     ================================================================= */
  console.log("\nD · lo que pasó en la última toma queda anotado");
  {
    const p = await abrirApp(ctx, url, LIMPIA);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-cuenta", "0");
    await p.evaluate(() => { document.querySelector('#g-cal button[data-v="720"]').click(); });
    await p.tap("#b-rec");
    await p.waitForTimeout(5000);
    await p.tap("#b-rec");
    await p.waitForTimeout(2500);
    const reg = () => p.evaluate(() => (document.getElementById("registro") || {}).textContent || "");
    const r = await reg();
    ok("Ajustes tiene el registro de la última toma", r.length > 20, r.slice(0, 80));
    ok("anota cómo estaba el micrófono al empezar", /micr[oó]fono/i.test(r), r);
    ok("anota que empezó a grabar", /empez[oó] a grabar/i.test(r), r);
    ok("anota cómo terminó y cuánto pesó", /MB/.test(r) && /par[oó]|termin/i.test(r), r);
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(900);
    ok("el registro sobrevive a cerrar la app", (await reg()).length > 20);
    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  await navegador.close();
  s.close();
  console.log("\n" + pasan + " OK, " + fallan + " fallan");
  process.exit(fallan ? 1 : 0);
})();
