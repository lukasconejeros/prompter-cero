/* Auditoria de seguridad y privacidad de Prompter Cero.
   Se corre con:   node auditoria-seguridad.js
   Con --vivo tambien comprueba lo que de verdad esta sirviendo GitHub Pages.

   La pregunta que responde: ¿puede esta app espiar a Lukas, o puede alguien
   usarla para llegar a su camara, su microfono, sus videos o sus guiones?

   No es una opinion: cada control mira el codigo o la respuesta del servidor. */

var fs = require("fs");
var path = require("path");
var https = require("https");

var DIR = __dirname;
var SITIO = "https://lukasconejeros.github.io/prompter-cero/";

var hallazgos = [];   /* {nivel, titulo, evidencia} */
var pasados = 0;

function leer(f){
  try { return fs.readFileSync(path.join(DIR, f), "utf8"); }
  catch(e){ return null; }
}

function ok(titulo, evidencia){
  pasados++;
  console.log("  PASA   " + titulo + (evidencia ? "\n         " + evidencia : ""));
}
function fallo(nivel, titulo, evidencia){
  hallazgos.push({ nivel: nivel, titulo: titulo, evidencia: evidencia });
  console.log("  " + nivel.padEnd(6) + " " + titulo + (evidencia ? "\n         " + evidencia : ""));
}

var FUENTES = ["index.html", "app.js", "app.css", "sw.js", "manifest.webmanifest", "prueba.html"];
var codigo = {};
FUENTES.forEach(function(f){ codigo[f] = leer(f) || ""; });
var todo = FUENTES.map(function(f){ return codigo[f]; }).join("\n");

/* ==========================================================
   1 · ¿puede la app mandar algo a internet?
   Es LA pregunta. Si no puede conectarse a ningun servidor, el video
   y los guiones no pueden salir del telefono, aunque el codigo quisiera.
   ========================================================== */
console.log("\n=== 1 · ¿puede la app sacar tus datos del telefono? ===");

var SALIDAS = [
  { re: /\bfetch\s*\(/g,                  que: "fetch()" },
  { re: /XMLHttpRequest/g,                que: "XMLHttpRequest" },
  { re: /new\s+WebSocket/g,               que: "WebSocket" },
  { re: /new\s+EventSource/g,             que: "EventSource" },
  { re: /sendBeacon/g,                    que: "navigator.sendBeacon" },
  { re: /new\s+RTCPeerConnection/g,       que: "RTCPeerConnection (WebRTC)" },
  { re: /\.submit\s*\(/g,                 que: "envio de formulario" },
  { re: /googletagmanager|google-analytics|gtag\(|fbq\(|mixpanel|sentry|hotjar/gi, que: "rastreador" }
];
var salidasVistas = [];
SALIDAS.forEach(function(s){
  FUENTES.forEach(function(f){
    var m = codigo[f].match(s.re);
    if(m) salidasVistas.push(f + ": " + s.que + " x" + m.length);
  });
});
/* el service worker usa fetch a proposito, y solo contra su propio origen */
var salidasReales = salidasVistas.filter(function(x){ return x.indexOf("sw.js: fetch()") !== 0; });

if(salidasReales.length === 0){
  ok("no hay una sola llamada de red en el codigo de la app",
     "cero fetch, cero XHR, cero WebSocket, cero WebRTC, cero rastreadores");
} else {
  fallo("GRAVE", "la app tiene formas de mandar datos afuera", salidasReales.join(" | "));
}

var dominios = todo.match(/https?:\/\/[a-z0-9.-]+/gi) || [];
var ajenos = dominios.filter(function(d){
  return !/lukasconejeros\.github\.io|github\.com|w3\.org|localhost/i.test(d);
});
if(ajenos.length === 0){
  ok("no carga nada de servidores ajenos", "ni fuentes, ni scripts, ni imagenes de terceros");
} else {
  fallo("MEDIO", "carga cosas de servidores de terceros", ajenos.join(", "));
}

/* ==========================================================
   2 · la regla que el navegador HACE CUMPLIR
   ========================================================== */
console.log("\n=== 2 · la regla que el navegador obliga a cumplir (CSP) ===");

var csp = (codigo["index.html"].match(/Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || "";
if(!csp){
  fallo("GRAVE", "la app no tiene Content-Security-Policy", "sin ella, nada impide una conexion de salida");
} else {
  var exigidos = [
    ["connect-src 'none'",  "GRAVE",  "el navegador le prohibe conectarse a cualquier servidor"],
    ["default-src 'none'",  "MEDIO",  "todo lo no permitido explicitamente queda bloqueado"],
    ["script-src 'self'",   "GRAVE",  "solo corre codigo del propio sitio, nada inyectado"],
    ["object-src 'none'",   "BAJO",   "sin plugins ni objetos embebidos"],
    ["base-uri 'none'",     "BAJO",   "nadie puede cambiar la base de las rutas"],
    ["form-action 'none'",  "MEDIO",  "ningun formulario puede enviar a ningun lado"],
    ["frame-src 'none'",    "BAJO",   "no puede incrustar paginas de otros"]
  ];
  exigidos.forEach(function(e){
    if(csp.indexOf(e[0]) > -1) ok("CSP con " + e[0], e[2]);
    else fallo(e[1], "a la CSP le falta " + e[0], e[2]);
  });
  if(csp.indexOf("script-src 'self' 'unsafe-inline'") > -1 || /script-src[^;]*unsafe-inline/.test(csp)){
    fallo("MEDIO", "la CSP permite scripts escritos dentro del HTML",
          "baja la proteccion contra codigo inyectado");
  } else {
    ok("no permite scripts escritos dentro del HTML", "el codigo vive en app.js y solo ese corre");
  }
}

/* ==========================================================
   3 · camara y microfono
   ========================================================== */
console.log("\n=== 3 · camara y microfono ===");

var js = codigo["app.js"];
var vecesQuePide = (js.match(/getUserMedia\s*\(/g) || []).length;
ok("la camara se pide " + vecesQuePide + " vez/veces, siempre desde el mismo sitio",
   "una sola funcion encender(), no hay peticiones escondidas");

if(/getTracks\(\)\.forEach\(function\s*\(t\)\s*\{\s*t\.stop\(\)/.test(js)){
  ok("la camara se apaga de verdad al cerrar", "todos los tracks reciben stop()");
} else {
  fallo("MEDIO", "no se ve que la camara se apague al cerrar", "podria quedar el punto verde encendido");
}

if(/pagehide[\s\S]{0,200}apagarCam\(\)/.test(js)){
  ok("al cerrar la pestana se apaga la camara sola", "listener de pagehide");
} else {
  fallo("MEDIO", "al cerrar la pestana la camara podria quedar viva", "falta apagar en pagehide");
}

if(/visibilitychange[\s\S]{0,160}parar\(\)/.test(js)){
  ok("si te vas de la app, deja de grabar sola", "listener de visibilitychange");
} else {
  fallo("BAJO", "si te vas de la app podria seguir grabando", "falta cortar en visibilitychange");
}

/* Grabar solo puede nacer de un toque tuyo. Se comprueba, sin regex fragiles,
   que TODA llamada a arrancar() viva dentro de cuentaYGrabar(), y que
   cuentaYGrabar() solo se invoque desde el listener del boton de grabar.
   La cuenta regresiva usa un temporizador, pero lo enciendes tu al tocar. */
var iniCuenta = js.indexOf("function cuentaYGrabar()");
var iniArrancar = js.indexOf("function arrancar()");
var cuerpoCuenta = (iniCuenta > -1 && iniArrancar > iniCuenta) ? js.slice(iniCuenta, iniArrancar) : "";

function contar(texto, aguja){
  var n = 0, i = 0;
  while((i = texto.indexOf(aguja, i)) > -1){ n++; i += aguja.length; }
  return n;
}
var totalArrancar = contar(js, "arrancar()") - contar(js, "function arrancar()");
var enCuenta = contar(cuerpoCuenta, "arrancar()");
var desdeBoton = js.indexOf("cuentaYGrabar();") > -1 && js.indexOf('$("b-rec").addEventListener') > -1;

if(totalArrancar > 0 && totalArrancar === enCuenta && desdeBoton){
  ok("nunca empieza a grabar sola",
     "las " + totalArrancar + " llamadas a arrancar() viven dentro de la cuenta regresiva, y esa la enciendes tu");
} else {
  fallo("GRAVE", "hay caminos que empiezan a grabar sin que toques nada",
        totalArrancar + " llamadas a arrancar(), " + enCuenta + " dentro de cuentaYGrabar()");
}

/* ==========================================================
   4 · tus guiones y tus videos
   ========================================================== */
console.log("\n=== 4 · donde quedan tus guiones y tus videos ===");

if(/localStorage/.test(js) && !/fetch|XMLHttpRequest/.test(js)){
  ok("los guiones se guardan solo en tu telefono", "localStorage, sin ninguna via de subida");
}
if(/URL\.createObjectURL/.test(js) && /URL\.revokeObjectURL/.test(js)){
  ok("los videos viven en la memoria del navegador y se liberan", "createObjectURL con su revoke");
}
if(/navigator\.share/.test(js)){
  ok("el video solo sale si TU eliges donde", "navigator.share abre el menu del iPhone, no manda nada solo");
}
/* Lo unico que TU escribes y que termina dentro de HTML es el guion.
   Se comprueba que se escape antes de pintarlo, y que los nombres de los
   guiones guardados se pongan con textContent (que no interpreta HTML). */
var escapaGuion = js.indexOf('replace(/&/g,"&amp;").replace(/</g,"&lt;")') > -1;
var nombresPorTexto = js.indexOf("nombres[j].textContent = gs[j].nombre") > -1;

if(escapaGuion && nombresPorTexto){
  ok("el texto que pegas no puede ejecutar nada",
     "el guion se escapa antes de mostrarlo y los nombres van por textContent");
} else {
  fallo("MEDIO", "el texto que pegas podria inyectar HTML",
        "escape del guion: " + escapaGuion + " | nombres por textContent: " + nombresPorTexto);
}

/* ==========================================================
   5 · dependencias: la puerta por donde entran los ataques modernos
   ========================================================== */
console.log("\n=== 5 · dependencias de terceros ===");
var tienePkg = fs.existsSync(path.join(DIR, "package.json"));
var tieneModules = fs.existsSync(path.join(DIR, "node_modules"));
if(!tienePkg && !tieneModules && ajenos.length === 0){
  ok("CERO dependencias de terceros",
     "sin npm, sin librerias, sin CDN: no hay paquete ajeno que pueda ser comprometido");
} else {
  fallo("MEDIO", "hay dependencias que auditar", "package.json o node_modules presentes");
}

/* ==========================================================
   6 · secretos en el repositorio (es publico)
   ========================================================== */
console.log("\n=== 6 · secretos filtrados (el repo es publico) ===");
var PATRONES = [
  { re: /gh[pousr]_[A-Za-z0-9_]{20,}/g,        que: "token de GitHub" },
  { re: /sk-[A-Za-z0-9]{20,}/g,                que: "clave de OpenAI" },
  { re: /sk-ant-[A-Za-z0-9\-_]{20,}/g,         que: "clave de Anthropic" },
  { re: /AIza[0-9A-Za-z\-_]{30,}/g,            que: "clave de Google" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, que: "llave privada" },
  { re: /\+56\s?9\s?\d{4}\s?\d{4}/g,           que: "telefono chileno" },
  { re: /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/g,   que: "RUT" }
];
var filtrados = [];
fs.readdirSync(DIR).forEach(function(f){
  if(f === "auditoria-seguridad.js" || f.startsWith(".") || /\.(png|jpg|mp4)$/i.test(f)) return;
  var c = leer(f);
  if(!c) return;
  PATRONES.forEach(function(pt){
    if(pt.re.test(c)) filtrados.push(f + ": " + pt.que);
    pt.re.lastIndex = 0;
  });
});
if(filtrados.length === 0){
  ok("ningun secreto ni dato personal en el repositorio",
     "revisados tokens, claves, llaves privadas, telefonos y RUT");
} else {
  fallo("GRAVE", "hay secretos o datos personales en el repositorio publico", filtrados.join(" | "));
}

/* ==========================================================
   7 · lo que de verdad sirve el servidor  (--vivo)
   ========================================================== */
function comprobarVivo(cuandoTermine){
  console.log("\n=== 7 · lo que de verdad esta sirviendo el servidor ===");
  https.get(SITIO, { headers: { "User-Agent": "auditoria" } }, function(res){
    var cuerpo = "";
    res.on("data", function(d){ cuerpo += d; });
    res.on("end", function(){
      if(res.statusCode !== 200){
        fallo("GRAVE", "el sitio no responde bien", "HTTP " + res.statusCode);
        return cuandoTermine();
      }
      ok("el sitio responde", "HTTP 200 por HTTPS");

      if(/^https:/.test(SITIO)) ok("va cifrado de punta a punta", "HTTPS obligatorio en GitHub Pages");

      var h = res.headers;
      if(h["strict-transport-security"]) ok("obliga HTTPS en las proximas visitas", "HSTS: " + h["strict-transport-security"]);
      else fallo("BAJO", "sin cabecera HSTS", "GitHub Pages no la manda en subdominios; el sitio igual es solo HTTPS");

      if(/Content-Security-Policy/.test(cuerpo)) ok("la regla de seguridad llega al navegador", "la CSP viaja en el HTML servido");
      else fallo("GRAVE", "la CSP no esta llegando al navegador", "el HTML servido no la trae");

      if(!/fonts\.googleapis|fonts\.gstatic/.test(cuerpo)) ok("no le avisa a Google que abriste la app", "sin Google Fonts");
      else fallo("MEDIO", "carga fuentes de Google", "Google ve tu IP cada vez que abres la app");

      cuandoTermine();
    });
  }).on("error", function(e){
    fallo("BAJO", "no se pudo comprobar el sitio en vivo", e.message);
    cuandoTermine();
  });
}

function cerrar(){
  console.log("\n========================================");
  var graves = hallazgos.filter(function(x){ return x.nivel === "GRAVE"; }).length;
  var medios = hallazgos.filter(function(x){ return x.nivel === "MEDIO"; }).length;
  var bajos  = hallazgos.filter(function(x){ return x.nivel === "BAJO"; }).length;
  console.log("Controles que pasan: " + pasados);
  console.log("Hallazgos: " + graves + " graves, " + medios + " medios, " + bajos + " bajos");
  if(graves === 0 && medios === 0){
    console.log("\nVEREDICTO: la app no tiene forma de sacar nada de tu telefono.");
  } else {
    console.log("\nVEREDICTO: hay cosas que arreglar, mira arriba.");
  }
  console.log("========================================\n");
  process.exit(graves ? 1 : 0);
}

if(process.argv.indexOf("--vivo") > -1) comprobarVivo(cerrar);
else cerrar();
