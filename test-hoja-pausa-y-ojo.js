/* test-hoja-pausa-y-ojo.js — los tres encargos del 28-08-2026:

     "cuando estoy en guiones aprieto guiones se bugea la app y no me deja
      deslizar para arriba ni para abajo, la parte de guiones esta totalmente
      bugeada. tambien quiero una opcion para poder ocultar el guion dentro de
      la misma pantalla de grabacion y poder detener o ponerla en pausa
      [la grabacion], tiene un boton pero no funciona"

   A) LA HOJA GUION. Medido antes de tocar nada: al abrirla, la app entera se
      iba 547 px hacia arriba (#app.scrollTop = 547) y ahi se quedaba, porque
      #app es overflow:hidden -el navegador SI lo puede desplazar para traer a
      la vista el campo que recibe el cursor, el dedo NO-. Causa: el focus()
      automatico del cuadro de texto al abrir la hoja.

   B) PAUSAR LA TOMA sin cortarla, y que el reloj y el guion la respeten.

   C) EL OJO que esconde el guion sin salir de la pantalla de grabar.

   Corre con el Edge del PC y playwright-core de whatsapp-mary:
     node test-hoja-pausa-y-ojo.js
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
  "asi se puede medir si el guion sigue subiendo cuando esta escondido y si se congela cuando la toma esta en pausa ").repeat(6);

let pasan = 0, fallan = 0;
function ok(nombre, cond, detalle) {
  if (cond) { pasan++; console.log("  OK   " + nombre); }
  else { fallan++; console.log("  FALLA " + nombre + (detalle ? "  ->  " + detalle : "")); }
}

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

/* deslizar de verdad, con eventos tactiles: el raton no hace scroll tactil */
async function deslizar(cdp, x, y0, y1) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 400));
}

const foto = (p) => p.evaluate(() => {
  const caja = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom) };
  };
  const h = document.getElementById("hoja-guion");
  return {
    appScrollTop: Math.round(document.getElementById("app").scrollTop),
    hoja: caja("#hoja-guion"),
    barraSup: caja(".barra-sup"),
    barraInf: caja(".barra-inf"),
    prompter: caja("#prompter"),
    hojaScroll: Math.round(h.scrollTop),
    hojaMax: Math.round(h.scrollHeight - h.clientHeight),
    hojaAlto: Math.round(h.getBoundingClientRect().height),
    foco: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : "-",
  };
});

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

  /* =================================================================
     A · LA HOJA GUION NO DESCUADRA LA APP
     ================================================================= */
  console.log("\nA · abrir «Guion» deja la app en su sitio");
  {
    const p = await abrirApp(ctx, url);
    const cdp = await ctx.newCDPSession(p);
    const antes = await foto(p);

    await p.tap("#b-guion");
    await p.waitForTimeout(600);
    const abierta = await foto(p);

    ok("la app NO se desplaza al abrir la hoja", abierta.appScrollTop === 0, "appScrollTop " + abierta.appScrollTop);
    ok("la barra de arriba sigue en pantalla", abierta.barraSup.top >= 0, JSON.stringify(abierta.barraSup));
    ok("el guion sigue en pantalla", abierta.prompter.top >= 0, JSON.stringify(abierta.prompter));
    ok("la hoja entra por abajo, no se va por arriba", abierta.hoja.top > 0 && abierta.hoja.top < 844, JSON.stringify(abierta.hoja));
    ok("el teclado no salta solo (el cursor no cae en el cuadro)", abierta.foco !== "ta", "foco " + abierta.foco);

    /* deslizar DENTRO de la hoja tiene que moverla */
    const medio = Math.round((abierta.hoja.top + Math.min(844, abierta.hoja.bottom)) / 2);
    await deslizar(cdp, 195, medio + 120, medio - 180);
    const movida = await foto(p);
    ok("la hoja se desliza con el dedo", movida.hojaMax > 0 && movida.hojaScroll > 0,
      "scroll " + movida.hojaScroll + " de " + movida.hojaMax);
    ok("y llega hasta el final", movida.hojaScroll >= movida.hojaMax - 2,
      "scroll " + movida.hojaScroll + " de " + movida.hojaMax);
    ok("«Guardados en este teléfono» queda a la vista",
      await p.evaluate(() => {
        const b = document.getElementById("lista").getBoundingClientRect();
        return b.top < window.innerHeight && b.bottom > 0;
      }));

    /* cerrarla deja todo como estaba (toque en el velo, arriba de la hoja) */
    await p.touchscreen.tap(195, 40);
    await p.waitForTimeout(500);
    const cerrada = await foto(p);
    ok("al cerrar, la app queda como al principio",
      cerrada.appScrollTop === 0 && cerrada.barraSup.top === antes.barraSup.top,
      JSON.stringify(cerrada));

    /* el guardian: aunque algo la empuje, vuelve sola */
    await p.evaluate(() => { document.getElementById("app").scrollTop = 500; });
    await p.waitForTimeout(300);
    ok("si algo empuja la app, vuelve sola a su sitio",
      (await foto(p)).appScrollTop === 0);

    /* con el teclado abierto la hoja se sube encima */
    await p.tap("#b-guion");
    await p.waitForTimeout(500);
    const sinTeclado = await foto(p);
    await p.evaluate(() => document.documentElement.style.setProperty("--teclado", "336px"));
    await p.waitForTimeout(300);
    const conTeclado = await foto(p);
    ok("con el teclado, la hoja se sube encima de él",
      conTeclado.hoja.bottom <= 844 - 336 + 1, "bottom " + conTeclado.hoja.bottom);
    ok("y se achica para que quepa entera",
      conTeclado.hojaAlto < sinTeclado.hojaAlto, conTeclado.hojaAlto + " vs " + sinTeclado.hojaAlto);
    ok("todo su contenido sigue alcanzable",
      conTeclado.hojaMax > sinTeclado.hojaMax, "alcance " + conTeclado.hojaMax);
    await p.evaluate(() => document.documentElement.style.setProperty("--teclado", "0px"));

    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  console.log("\nA2 · el caso hermano: la hoja Ajustes");
  {
    const p = await abrirApp(ctx, url);
    await p.tap("#b-ajustes");
    await p.waitForTimeout(600);
    const f = await foto(p);
    ok("Ajustes tampoco descuadra la app", f.appScrollTop === 0, "appScrollTop " + f.appScrollTop);
    ok("la barra de arriba sigue en pantalla", f.barraSup.top >= 0);
    await p.close();
  }

  /* =================================================================
     B · PAUSAR LA TOMA
     ================================================================= */
  console.log("\nB · pausar la grabación sin cortarla");
  {
    const p = await abrirApp(ctx, url);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "auto");
    await ajuste(p, "g-cuenta", "0");

    ok("antes de grabar, el botón de pausa está apagado",
      await p.evaluate(() => document.getElementById("b-pausa").disabled));

    await p.tap("#b-rec");
    await p.waitForTimeout(1800);
    const grabando = await p.evaluate(() => ({
      diag: window.__PC_DIAG(),
      pausaOn: document.getElementById("b-pausa").disabled === false,
      reloj: document.getElementById("rec-time").textContent,
      scroll: document.getElementById("prompter").scrollTop,
    }));
    ok("grabando, el botón de pausa se enciende", grabando.pausaOn);
    ok("el grabador está grabando", grabando.diag.estadoGrabador === "recording", grabando.diag.estadoGrabador);
    ok("el guion va subiendo", grabando.scroll > 0, "scroll " + grabando.scroll);

    await p.tap("#b-pausa");
    await p.waitForTimeout(1500);
    const enPausa = await p.evaluate(() => ({
      diag: window.__PC_DIAG(),
      marca: document.getElementById("app").getAttribute("data-pausa"),
      reloj: document.getElementById("rec-time").textContent,
      scroll: document.getElementById("prompter").scrollTop,
      aviso: document.getElementById("aviso").textContent,
    }));
    ok("el grabador queda en pausa, no detenido", enPausa.diag.estadoGrabador === "paused", enPausa.diag.estadoGrabador);
    ok("la app lo marca en pantalla", enPausa.marca === "1");
    ok("le avisa que sigue en el mismo video", /mismo video/i.test(enPausa.aviso), enPausa.aviso);
    ok("el avance automático se apaga con la pausa", enPausa.diag.auto === false);

    /* congelado de verdad = no se mueve NADA durante la pausa */
    const relojPausa = enPausa.reloj;
    await p.waitForTimeout(1600);
    const quieto = await p.evaluate(() => ({
      reloj: document.getElementById("rec-time").textContent,
      scroll: document.getElementById("prompter").scrollTop,
    }));
    ok("el guion no se mueve mientras está en pausa", quieto.scroll === enPausa.scroll,
      enPausa.scroll + " -> " + quieto.scroll);
    ok("el reloj no corre mientras está en pausa", quieto.reloj === relojPausa, relojPausa + " -> " + quieto.reloj);

    await p.tap("#b-pausa");
    await p.waitForTimeout(1500);
    const siguiendo = await p.evaluate(() => ({
      diag: window.__PC_DIAG(),
      marca: document.getElementById("app").getAttribute("data-pausa"),
      scroll: document.getElementById("prompter").scrollTop,
    }));
    ok("al seguir, vuelve a grabar en el mismo archivo", siguiendo.diag.estadoGrabador === "recording", siguiendo.diag.estadoGrabador);
    ok("se quita la marca de pausa", siguiendo.marca === "0");
    ok("el guion vuelve a subir desde donde iba", siguiendo.scroll > enPausa.scroll,
      enPausa.scroll + " -> " + siguiendo.scroll);

    await p.tap("#b-rec");                       // detener
    await p.waitForTimeout(1500);
    const parado = await p.evaluate(() => ({
      diag: window.__PC_DIAG(),
      rec: document.getElementById("app").getAttribute("data-rec"),
      marca: document.getElementById("app").getAttribute("data-pausa"),
      pausaOff: document.getElementById("b-pausa").disabled,
      datos: document.getElementById("rev-datos").textContent,
      hoja: document.getElementById("hoja-video").getAttribute("data-abierta"),
    }));
    ok("detener después de una pausa cierra la toma", parado.rec === "0" && parado.diag.grabando === false);
    ok("queda UN solo video, no dos", parado.hoja === "1" && /MB/.test(parado.datos), parado.datos);
    ok("el botón de pausa se apaga al parar", parado.pausaOff === true && parado.marca === "0");
    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  /* =================================================================
     C · EL OJO: ESCONDER EL GUION
     ================================================================= */
  console.log("\nC · esconder el guion desde la pantalla de grabar");
  {
    const p = await abrirApp(ctx, url);
    await ponerGuion(p, GUION_LARGO);
    await ajuste(p, "g-modo", "auto");
    await ajuste(p, "g-cuenta", "0");

    await p.tap("#b-tapar");
    await p.waitForTimeout(400);
    const oculto = await p.evaluate(() => ({
      marca: document.getElementById("app").getAttribute("data-oculto"),
      visible: getComputedStyle(document.getElementById("prompter")).visibility,
      alto: document.getElementById("prompter").getBoundingClientRect().height,
      aviso: document.getElementById("aviso").textContent,
    }));
    ok("el guion se esconde", oculto.marca === "1" && oculto.visible === "hidden", JSON.stringify(oculto));
    ok("le dice cómo traerlo de vuelta", /ojo/i.test(oculto.aviso), oculto.aviso);
    ok("conserva su tamaño (no es display:none)", oculto.alto > 50, "alto " + oculto.alto);

    /* escondido, la toma corre igual y el texto sigue avanzando por debajo */
    await p.tap("#b-rec");
    await p.waitForTimeout(2000);
    const grabandoOculto = await p.evaluate(() => ({
      rec: document.getElementById("app").getAttribute("data-rec"),
      scroll: document.getElementById("prompter").scrollTop,
      marca: document.getElementById("app").getAttribute("data-oculto"),
    }));
    ok("se puede grabar con el guion escondido", grabandoOculto.rec === "1" && grabandoOculto.marca === "1");
    ok("y el texto sigue avanzando por debajo", grabandoOculto.scroll > 0, "scroll " + grabandoOculto.scroll);

    await p.tap("#b-tapar");
    await p.waitForTimeout(400);
    const devuelta = await p.evaluate(() => ({
      marca: document.getElementById("app").getAttribute("data-oculto"),
      visible: getComputedStyle(document.getElementById("prompter")).visibility,
      scroll: document.getElementById("prompter").scrollTop,
    }));
    ok("vuelve a la vista donde iba", devuelta.marca === "0" && devuelta.visible === "visible"
      && devuelta.scroll >= grabandoOculto.scroll, JSON.stringify(devuelta));

    await p.tap("#b-rec");
    await p.waitForTimeout(1400);
    await p.touchscreen.tap(195, 40);          /* cerrar la hoja del video que se abre sola */
    await p.waitForTimeout(500);

    /* caso hermano: con «cuánto tapa» en 0 el guion ya está apagado desde Ajustes */
    await p.evaluate(() => {
      const s = document.getElementById("s-tapa");
      s.value = 0; s.dispatchEvent(new Event("input"));
    });
    await p.waitForTimeout(300);
    await p.tap("#b-tapar");
    await p.waitForTimeout(400);
    const enCero = await p.evaluate(() => ({
      marca: document.getElementById("app").getAttribute("data-oculto"),
      aviso: document.getElementById("aviso").textContent,
    }));
    ok("con la tapa en 0 % se lo explica en vez de hacer nada raro",
      enCero.marca === "0" && /0 ?%/.test(enCero.aviso), JSON.stringify(enCero));
    ok("sin errores en consola", p.__errores.length === 0, p.__errores.join(" | "));
    await p.close();
  }

  /* =================================================================
     D · la version, que no se quede pegada en el telefono
     ================================================================= */
  console.log("\nD · la versión de la app y la del cache van juntas");
  {
    const p = await abrirApp(ctx, url);
    const v = await p.evaluate(() => window.__PC_VERSION);
    const sw = fs.readFileSync(path.join(RAIZ, "sw.js"), "utf8");
    ok("la app dice su versión", /^v\d+$/.test(v), v);
    ok("el cache del service worker lleva la misma", sw.indexOf('"prompter-cero-' + v + '"') > -1,
      (sw.match(/prompter-cero-v\d+/) || ["?"])[0] + " vs " + v);
    ok("Ajustes la muestra escrita",
      (await p.evaluate(() => document.getElementById("version").textContent)).indexOf(v) > -1);
    await p.close();
  }

  await navegador.close();
  s.close();
  console.log("\n" + pasan + " OK, " + fallan + " fallan");
  process.exit(fallan ? 1 : 0);
})();
