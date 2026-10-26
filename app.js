(function(){
"use strict";

/* LA VERSION, a la vista. El 27-08 Lukas no tenia como distinguir "no lo
   arreglaron" de "mi iPhone abrio la version vieja que tenia guardada".
   Ahora la app la dice en Ajustes y avisa sola cuando se actualiza.
   Al cambiarla hay que cambiar tambien el cache de sw.js: la prueba
   test-dedo-y-version.js falla si no coinciden. */
var VERSION = "v9";
window.__PC_VERSION = VERSION;

/* =========================================================
   0 · utilidades
   ========================================================= */
var $ = function(id){ return document.getElementById(id); };
var app = $("app");

var avisoT = null;
function avisar(txt, malo){
  var a = $("aviso");
  a.textContent = txt;
  a.className = malo ? "malo" : "";
  a.setAttribute("data-on","1");
  if(avisoT) clearTimeout(avisoT);
  avisoT = setTimeout(function(){ a.removeAttribute("data-on"); }, malo ? 7000 : 3200);
}

function guardado(clave, porDefecto){
  try{
    var v = localStorage.getItem("pc." + clave);
    return v === null ? porDefecto : JSON.parse(v);
  }catch(e){ return porDefecto; }
}
function guardar(clave, valor){
  try{ localStorage.setItem("pc." + clave, JSON.stringify(valor)); return true; }
  catch(e){ return false; }
}

/* EL REGISTRO DE LA ÚLTIMA TOMA (26-10-2026). Le salió "no quedó nada
   grabado" y no había forma de saber por qué: la app no anotaba nada. Ahora
   cada toma deja su historia en el teléfono -nunca sale de ahí, la app no
   puede conectarse a nada- y se lee en Ajustes. Si algo vuelve a fallar, una
   captura de eso dice qué pasó. */
var registro = guardado("registro", []);
if(!registro || !registro.push) registro = [];
function registrar(txt){
  registro.push(new Date().toTimeString().slice(0, 8) + "  " + txt);
  if(registro.length > 60) registro = registro.slice(-60);
  guardar("registro", registro);
  if(document.getElementById("registro")) pintarRegistro();
}
/* la toma anterior se guarda aparte: si falló y tocas grabar de nuevo, su
   historia no se pierde */
function registroNuevo(txt){
  if(registro.length) guardar("registroAnterior", registro);
  registro = [];
  registrar(txt);
}
function pintarRegistro(){
  var ant = guardado("registroAnterior", []);
  $("registro").textContent = registro.join("\n")
    + (ant && ant.length ? "\n\n— la toma anterior —\n" + ant.join("\n") : "");
}

/* =========================================================
   1 · ajustes (se guardan solos)
   ========================================================= */
var POR_DEFECTO = {
  tapa:34, letra:24, pos:"arriba", fondo:"1",
  modo:"auto", vel:10, cal:"max", enc:"ver", esp:"1", cuenta:3,
  formato:"vertical"
};
var cfg = {};
for(var k in POR_DEFECTO){ cfg[k] = guardado(k, POR_DEFECTO[k]); }

/* 26-10-2026: el seguimiento por voz se fue. Su queja: "eso de que me siga con
   la voz no funciona bien... mejor que yo le pueda aumentar y disminuir la
   velocidad". Ademas le peleaba el microfono a la grabacion. Quien lo tenia
   guardado pasa a «Solo»; cualquier valor raro, igual. */
if(cfg.modo !== "auto" && cfg.modo !== "dedo"){ cfg.modo = "auto"; guardar("modo", "auto"); }

var VEL_MIN = 4, VEL_MAX = 30;      /* 0,4× a 3,0× */
function textoVel(){ return (cfg.vel/10).toFixed(1).replace(".",",") + "×"; }

function aplicarCfg(){
  app.setAttribute("data-pos", cfg.pos);
  app.setAttribute("data-fondo", String(cfg.fondo));
  app.setAttribute("data-modo", cfg.modo);
  app.setAttribute("data-encuadre", cfg.enc);
  app.setAttribute("data-formato", cfg.formato);
  app.setAttribute("data-espejo", String(cfg.esp));
  app.setAttribute("data-tapa", cfg.tapa > 0 ? "1" : "0");

  $("prompter").style.height = cfg.tapa + "%";
  $("texto").style.fontSize = cfg.letra + "px";

  $("s-tapa").value = cfg.tapa;   $("d-tapa").textContent = cfg.tapa + " %";
  $("s-letra").value = cfg.letra; $("d-letra").textContent = cfg.letra + " px";
  $("s-vel").value = cfg.vel;     $("d-vel").textContent = textoVel();
  $("vel-dato").textContent = textoVel();

  marcarSeg("g-pos", cfg.pos);
  marcarSeg("g-fondo", String(cfg.fondo));
  marcarSeg("g-modo", cfg.modo);
  marcarSeg("g-cal", cfg.cal);
  marcarSeg("g-enc", cfg.enc);
  marcarSeg("g-formato", cfg.formato);
  marcarSeg("g-esp", String(cfg.esp));
  marcarSeg("g-cuenta", String(cfg.cuenta));

  $("nota-modo").textContent = cfg.modo === "auto"
    ? "El texto sube parejo. La velocidad también la cambias en la pantalla de grabar, con − y +, aunque estés grabando."
    : "Lo empujas tú con el pulgar sobre el texto.";
}

function marcarSeg(id, valor){
  var bs = $(id).querySelectorAll("button");
  for(var i=0;i<bs.length;i++){
    bs[i].setAttribute("aria-pressed", bs[i].getAttribute("data-v") === String(valor) ? "true" : "false");
  }
}

function conectarSeg(id, clave, despues){
  $(id).addEventListener("click", function(ev){
    var b = ev.target.closest("button");
    if(!b) return;
    cfg[clave] = b.getAttribute("data-v");
    guardar(clave, cfg[clave]);
    aplicarCfg();
    if(despues) despues();
  });
}

/* =========================================================
   2 · el guion
   ========================================================= */
var PALABRAS_POR_MINUTO = 170;   // el ritmo real de Lukas: 170 palabras ≈ 59 s
var guionCrudo = [], palabrasEl = [];

function cargarGuion(txt){
  var limpio = (txt || "").replace(/\s+/g," ").trim();
  var t = $("texto");
  if(!limpio){
    t.className = "vacio";
    t.textContent = "Toca «Guion» para pegar lo que vas a decir.";
    guionCrudo = []; palabrasEl = [];
    return;
  }
  guionCrudo = limpio.split(" ");

  var html = "";
  for(var i=0;i<guionCrudo.length;i++){
    html += "<w>" + guionCrudo[i].replace(/&/g,"&amp;").replace(/</g,"&lt;") + "</w> ";
  }
  t.className = "";
  t.innerHTML = html;
  palabrasEl = t.querySelectorAll("w");
  $("prompter").scrollTop = 0;
  guardar("guionActual", limpio);
}

function reiniciarGuion(){
  $("prompter").scrollTop = 0;
}

function contarTa(){
  var n = $("ta").value.trim() ? $("ta").value.trim().split(/\s+/).length : 0;
  var seg = Math.round(n / PALABRAS_POR_MINUTO * 60);
  $("conteo").textContent = n + (n === 1 ? " palabra" : " palabras");
  $("duracion").textContent = Math.floor(seg/60) + ":" + ("0" + (seg%60)).slice(-2);
}

/* ---- mis guiones: los 3 de la marca, vienen dentro de la app ----
   Los escribe `guiones.js`, que genera un script desde los .md de skill-videos-ia.
   Van aparte de los guardados: estos no se borran ni se pierden al limpiar el telefono. */
function misGuiones(){
  var g = window.GUIONES_LUKAS;
  return (g && g.length) ? g : [];
}

function pintarMios(){
  var gs = misGuiones();
  var cont = $("lista-mios");
  if(!cont) return;
  if(!gs.length){
    cont.innerHTML = '<p class="vacia">No se pudieron cargar.</p>';
    return;
  }
  var html = "";
  for(var i=0;i<gs.length;i++){
    var seg = Math.round((Number(gs[i].palabras)||0) / PALABRAS_POR_MINUTO * 60);
    html += '<div class="item">'
          + '<span class="n"><b></b><small>' + (Number(gs[i].palabras)||0) + ' palabras · '
          + Math.floor(seg/60) + ":" + ("0"+(seg%60)).slice(-2) + '</small></span>'
          + '<button data-mio="' + i + '">Abrir</button>'
          + '</div>';
  }
  cont.innerHTML = html;
  var nombres = cont.querySelectorAll(".n b");
  for(var j=0;j<nombres.length;j++){ nombres[j].textContent = gs[j].nombre; }
}

/* Tocar uno lo deja LISTO: lo carga en el prompter y cierra la hoja.
   Es lo que pidio: "que yo lo apriete y en mi telefono se abra". */
$("lista-mios").addEventListener("click", function(ev){
  var b = ev.target.closest("button");
  if(!b || !b.hasAttribute("data-mio")) return;
  var g = misGuiones()[parseInt(b.getAttribute("data-mio"),10)];
  if(!g) return;
  $("ta").value = g.texto;
  contarTa();
  cargarGuion(g.texto);   /* cargarGuion ya lo deja guardado como el guion actual */
  cerrarTodo();
  avisar(g.nombre + " · " + guionCrudo.length + " palabras.");
});

/* ---- guiones guardados ---- */
function listaGuiones(){ return guardado("guiones", []); }

function pintarLista(){
  var gs = listaGuiones();
  var cont = $("lista");
  if(!gs.length){
    cont.innerHTML = '<p class="vacia">Todavía no has guardado ninguno.</p>';
    return;
  }
  var html = "";
  for(var i=0;i<gs.length;i++){
    var seg = Math.round(gs[i].palabras / PALABRAS_POR_MINUTO * 60);
    html += '<div class="item">'
          + '<span class="n"><b></b><small>' + (Number(gs[i].palabras) || 0) + ' palabras · '
          + Math.floor(seg/60) + ":" + ("0"+(seg%60)).slice(-2) + '</small></span>'
          + '<button data-abrir="' + i + '">Abrir</button>'
          + '<button class="borrar" data-borrar="' + i + '" aria-label="Borrar">✕</button>'
          + '</div>';
  }
  cont.innerHTML = html;
  var nombres = cont.querySelectorAll(".n b");
  for(var j=0;j<nombres.length;j++){ nombres[j].textContent = gs[j].nombre; }
}

$("lista").addEventListener("click", function(ev){
  var b = ev.target.closest("button");
  if(!b) return;
  var gs = listaGuiones();
  if(b.hasAttribute("data-abrir")){
    var g = gs[parseInt(b.getAttribute("data-abrir"),10)];
    if(g){ $("ta").value = g.texto; contarTa(); }
  } else if(b.hasAttribute("data-borrar")){
    gs.splice(parseInt(b.getAttribute("data-borrar"),10), 1);
    guardar("guiones", gs);
    pintarLista();
    avisar("Guion borrado.");
  }
});

/* =========================================================
   3 · hojas
   ========================================================= */
function abrir(id){
  cerrarTodo();
  $(id).setAttribute("data-abierta","1");
  $("velo").setAttribute("data-on","1");
  fijarEncuadre();
}
function cerrarTodo(){
  /* el video de la revisión sonando por debajo le quita el micrófono a la
     toma siguiente en iOS: se pausa cierres como cierres la hoja (antes
     solo «Grabar otra toma» lo pausaba) */
  var rv = $("rev");
  if(rv && !rv.paused){ try{ rv.pause(); }catch(e){} }
  var hs = document.querySelectorAll(".hoja");
  for(var i=0;i<hs.length;i++){ hs[i].removeAttribute("data-abierta"); }
  $("velo").removeAttribute("data-on");
  fijarEncuadre();
}
$("velo").addEventListener("click", cerrarTodo);
document.addEventListener("click", function(ev){
  if(ev.target.classList && ev.target.classList.contains("asa")) cerrarTodo();
});
/* 🔑 28-08: acá había un `$("ta").focus()`. Parecía una comodidad -abrir la
   hoja con el cursor puesto- y era EL bug: el navegador, para traer a la vista
   un campo que todavía venía entrando en pantalla, empujaba #app 547 px hacia
   arriba; como #app no se puede deslizar con el dedo, la app quedaba torcida
   hasta reiniciarla. Y de paso el teclado tapaba «Mis guiones», que es lo que
   él viene a buscar. Ahora el cursor lo pone él tocando el cuadro. */
$("b-guion").addEventListener("click", function(){ abrir("hoja-guion"); });
$("b-ajustes").addEventListener("click", function(){ abrir("hoja-ajustes"); });

/* =========================================================
   3a · EL ENCUADRE NO SE MUEVE, y las hojas esquivan el teclado
   ========================================================= */
function fijarEncuadre(){
  if(app.scrollTop || app.scrollLeft){ app.scrollTop = 0; app.scrollLeft = 0; }
  var d = document.scrollingElement;
  if(d && (d.scrollTop || d.scrollLeft)){ d.scrollTop = 0; d.scrollLeft = 0; }
  if(window.scrollY || window.scrollX){ try{ window.scrollTo(0,0); }catch(e){} }
}
/* los eventos de scroll no burbujean: se escuchan en captura */
document.addEventListener("scroll", function(ev){
  var t = ev.target;
  if(t === app || t === document || t === document.body || t === document.documentElement) fijarEncuadre();
}, true);
document.addEventListener("focusin", function(){ setTimeout(fijarEncuadre, 0); });

/* cuánto de la pantalla se come el teclado, para que la hoja abierta se suba
   encima y se pueda seguir deslizando hasta el final */
function medirTeclado(){
  var vv = window.visualViewport;
  var tapa = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  if(tapa < 60) tapa = 0;                       /* la barra del navegador no es teclado */
  document.documentElement.style.setProperty("--teclado", tapa + "px");
  fijarEncuadre();
}
if(window.visualViewport){
  window.visualViewport.addEventListener("resize", medirTeclado);
  window.visualViewport.addEventListener("scroll", medirTeclado);
}
medirTeclado();

/* =========================================================
   4 · la cámara
   ========================================================= */
var stream = null, frontal = guardado("frontal", true);
var vTrack = null;

/* EL ZOOM (queja del 27-08): a la camara NO se le pide una forma.
   Cuando se le exige un aspectRatio o un ancho y un alto que su sensor no
   tiene, Safari no escala: RECORTA el centro del sensor. Resultado, todo se
   ve mas cerca. Aca se pide solo el alto -deseado, no obligatorio- y la
   camara entrega su modo nativo con todo el campo de vision. Lo que sobre a
   los lados lo recorta la app despues, igual que hace la camara del iPhone
   cuando graba vertical. */
function pedirVideo(){
  var alto;
  if(cfg.cal === "720") alto = 1280;
  else if(cfg.cal === "1080") alto = 1920;
  else alto = 2160;
  return {
    facingMode: { ideal: frontal ? "user" : "environment" },
    height: { ideal: alto },
    frameRate: { ideal: 30 }
  };
}

/* audio SIN el procesamiento de videollamada: eso es lo que lo hacía sonar mal */
var AUDIO_LIMPIO = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1
};

function apagarCam(){
  if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); stream = null; vTrack = null; }
}

/* DE A UNO (revisión del 26-10): volver de otra app y tocar grabar al tiro
   abría DOS cámaras a la vez; la primera quedaba viva y huérfana, y al
   morirse avisaba "soltó la cámara" en plena toma. Si ya se está abriendo,
   el segundo pedido espera al mismo. */
var encendiendo = null;
function encender(){
  if(encendiendo) return encendiendo;
  encendiendo = abrirCamara();
  var listo = function(){ encendiendo = null; };
  encendiendo.then(listo, listo);
  return encendiendo;
}

function abrirCamara(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    avisar("Este navegador no puede abrir la cámara. Ábrela en Safari.", true);
    return Promise.reject();
  }
  apagarCam();
  return navigator.mediaDevices.getUserMedia({ video: pedirVideo(), audio: AUDIO_LIMPIO })
    .then(function(s){
      stream = s;
      vTrack = s.getVideoTracks()[0];
      /* iOS suelta la camara cuando entra una llamada o cambias de app: sin esto
         la imagen se congela y no hay ninguna pista de por que */
      if(vTrack){
        var esta = vTrack;
        vTrack.onended = function(){
          if(esta !== vTrack) return;      /* una cámara vieja que ya se reemplazó */
          if(grabando) parar("el teléfono soltó la cámara");
          avisar("El teléfono soltó la cámara. Toca el botón del centro para volver a encenderla.", true);
          $("b-encender").hidden = false;
        };
      }
      $("cam").srcObject = s;
      $("cam").play().catch(function(){});
      $("b-encender").hidden = true;
      engancharMic();
      notaCamara();
    })
    .catch(function(e){
      var n = e && e.name ? e.name : "";
      registrar("No se pudo abrir la cámara y el micrófono (" + (n || "error") + ").");
      if(n === "NotAllowedError"){
        avisar("Safari bloqueó la cámara. Toca «aA» en la barra, Ajustes del sitio web, y pon Cámara y Micrófono en Permitir.", true);
      } else if(n === "OverconstrainedError" || n === "NotFoundError"){
        avisar("Con esa calidad no pudo. Bajando a 1080p.", true);
        if(cfg.cal !== "1080"){ cfg.cal = "1080"; guardar("cal","1080"); aplicarCfg(); return encender(); }
      } else {
        avisar("No se pudo abrir la cámara (" + (n || "error") + ").", true);
      }
      $("b-encender").hidden = false;      /* siempre queda una salida a mano */
      throw e;
    });
}

var avisoCam = false;
function notaCamara(){
  if(!vTrack || !vTrack.getSettings){ return; }
  var s = vTrack.getSettings();
  var m = medidasSalida();
  var txt = "La cámara entrega " + (s.width || "?") + " × " + (s.height || "?")
          + " a " + (s.frameRate ? Math.round(s.frameRate) : "?") + " cuadros por segundo. ";
  if(!necesitaRecorte()){
    txt += "El video sale tal cual, " + m.ancho + " × " + m.alto + ".";
  } else {
    txt += "Al grabar se recorta a los lados y el video sale vertical de "
         + m.ancho + " × " + m.alto + ".";
    if(m.ancho < 1080) txt += " Ojo: queda angosto para Instagram; prueba con «Como venga».";
  }
  $("nota-cam").textContent = txt;

  /* EL ZOOM, dicho en pantalla y no escondido en Ajustes (27-08).
     Lukas volvio a ver zoom despues del arreglo de las constraints, y no tenia
     como saber por que: si la camara entrega la imagen ACOSTADA, para que el
     archivo salga vertical hay que recortar los lados, y eso ES un zoom. No es
     un bug que se pueda tapar: es lo que da el sensor. Lo que si se puede es
     decirselo con el dato y la salida a mano. Una sola vez por encendido. */
  if(!avisoCam){
    avisoCam = true;
    if(necesitaRecorte()){
      avisar("Tu cámara entrega " + s.width + " × " + s.height + ", acostada. Para que el video salga vertical le recorto los lados, y por eso se ve más cerca. Si lo quieres completo, pon Formato «Como venga» en Ajustes.", true);
    } else {
      avisar("Cámara lista: entrega " + s.width + " × " + s.height + ", ya es vertical. Sale sin recortar.");
    }
  }
}

/* =========================================================
   4b · EL MICRÓFONO SE REVISA ANTES Y DURANTE CADA TOMA (26-10-2026)
   Su queja: "de repente me grabo y no se escucha mi audio". El micrófono se
   abría UNA vez, al abrir la app, y se usaba en todas las tomas sin mirarlo.
   El iPhone lo termina o lo deja mudo cuando te vas a otra app, entra una
   llamada u otra cosa lo ocupa (el seguimiento por voz lo ocupaba), y no lo
   devuelve (WebKit 218815 y 173268): desde ahí todas las tomas salían mudas
   y nada lo decía. Además iOS a veces lo deja "vivo" pero entregando ceros,
   así que no basta con mirar el estado: se mide la señal.
   ========================================================= */
var SILENCIO_MS = 2500;      /* un micrófono de verdad nunca da ceros exactos tanto rato */
var medidor = { ctx:null, an:null, fuente:null, buf:null, int:null,
                ultimoSonido:0, funciona:false };
var micFallo = false, micAvisado = false;

function micTrack(){ return stream ? (stream.getAudioTracks()[0] || null) : null; }

/* ceros exactos durante SILENCIO_MS = micrófono muerto. Solo se cree si el
   medidor ya demostró que en este teléfono sí oye (si no, un medidor que no
   anda pasaría por micrófono mudo) */
function micSinSenal(){
  return medidor.funciona && medidor.ctx && medidor.ctx.state === "running"
      && Date.now() - medidor.ultimoSonido > SILENCIO_MS;
}

/* "bien" solo vale tanto como el medidor: el registro dice si estaba oyendo */
function estadoMedidor(){
  if(!medidor.ctx || !medidor.fuente) return "no hay";
  if(medidor.ctx.state !== "running") return "dormido (" + medidor.ctx.state + ")";
  return medidor.funciona ? "oye" : "todavía no oye nada";
}

function estadoMic(){
  var t = micTrack();
  if(!t) return "no hay";
  if(t.readyState !== "live") return "terminado";
  if(t.muted) return "silenciado por el teléfono";
  if(!t.enabled) return "apagado";
  if(micSinSenal()) return "mudo (no entrega sonido)";
  return "bien";
}

function engancharMic(){
  var t = micTrack();
  micAvisado = false;
  medidor.ultimoSonido = Date.now();     /* el micrófono nuevo parte con plazo */
  if(!t){ registrar("La cámara abrió SIN micrófono."); return; }
  t.onended = function(){ if(t === micTrack()) micSePerdio("el teléfono lo cortó"); };
  t.onmute = function(){ if(t === micTrack()) micSePerdio("el teléfono lo silenció"); };
  t.onunmute = function(){ if(t === micTrack()) registrar("El micrófono volvió."); };

  var AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  try{
    if(!medidor.ctx){
      medidor.ctx = new AC();
      medidor.an = medidor.ctx.createAnalyser();
      medidor.an.fftSize = 2048;
      medidor.buf = new Float32Array(medidor.an.fftSize);
      medidor.int = setInterval(medirMic, 150);
    }
    if(medidor.fuente){ try{ medidor.fuente.disconnect(); }catch(e){} }
    medidor.fuente = medidor.ctx.createMediaStreamSource(new MediaStream([t]));
    medidor.fuente.connect(medidor.an);
  }catch(e){ medidor.fuente = null; }
}

function medirMic(){
  if(!medidor.fuente || !medidor.ctx) return;
  /* con el medidor dormido no hay dato: no se cuenta ese rato como silencio */
  if(medidor.ctx.state !== "running"){ medidor.ultimoSonido = Date.now(); return; }
  medidor.an.getFloatTimeDomainData(medidor.buf);
  var pico = 0;
  for(var i = 0; i < medidor.buf.length; i++){
    var v = medidor.buf[i] < 0 ? -medidor.buf[i] : medidor.buf[i];
    if(v > pico) pico = v;
  }
  if(pico > 0.000001){ medidor.ultimoSonido = Date.now(); medidor.funciona = true; return; }
  if(grabando && !pausado && micSinSenal()) micSePerdio("dejó de entregar sonido");
}

/* iOS solo deja andar el medidor después de un toque */
function despertarMedidor(){
  if(medidor.ctx && medidor.ctx.state !== "running"){ try{ medidor.ctx.resume(); }catch(e){} }
}
document.addEventListener("pointerdown", despertarMedidor, true);

function micSePerdio(motivo){
  /* una vez por toma: el medidor lo detecta cada 150 ms y repetirlo llenaría
     el registro y se comería lo que pasó antes */
  if(grabando && micFallo) return;
  registrar("Micrófono: " + motivo + (grabando ? " (grabando, " + segundosGrabados().toFixed(1).replace(".", ",") + " s)." : "."));
  if(!grabando){
    /* sin toma andando se cambia por uno nuevo al tiro, sin molestar */
    if(motivo === "el teléfono lo cortó" && !pidiendoCam) encender().catch(function(){});
    return;
  }
  /* grabando no se puede cambiar el micrófono sin cortar el video: se avisa
     fuerte y queda marcado en el reloj, y al parar se deja uno nuevo listo */
  micFallo = true;
  app.setAttribute("data-mic", "mudo");
  if(!micAvisado){
    micAvisado = true;
    avisar("Ojo: el micrófono dejó de grabar (" + motivo + "). Esta toma va sin sonido desde acá: párala y grábala de nuevo, el micrófono queda listo al parar.", true);
  }
}

$("b-girar").addEventListener("click", function(){
  if(grabando){ avisar("No se puede cambiar de cámara grabando."); return; }
  frontal = !frontal;
  guardar("frontal", frontal);
  cfg.esp = frontal ? "1" : "0";
  guardar("esp", cfg.esp);
  aplicarCfg();
  encender().catch(function(){});
});

/* =========================================================
   6 · avance automático
   ========================================================= */
var autoRaf = null, autoT0 = 0, autoDesde = 0;

function arrancarAuto(){
  pararAuto();
  var p = $("prompter");
  autoT0 = 0; autoDesde = p.scrollTop;
  var total = p.scrollHeight - p.clientHeight;
  if(total <= 0) return;
  var pps = 14 * (cfg.vel / 10);            // píxeles por segundo
  function paso(t){
    if(!autoT0) autoT0 = t;
    var s = (t - autoT0) / 1000;
    p.scrollTop = autoDesde + pps * s;
    if(p.scrollTop < total){ autoRaf = requestAnimationFrame(paso); }
  }
  autoRaf = requestAnimationFrame(paso);
}
function pararAuto(){ if(autoRaf){ cancelAnimationFrame(autoRaf); autoRaf = null; } }

/* ENSAYAR SIN GRABAR. Antes el texto solo se movia mientras grababas, asi que
   no habia forma de ensayar: se quedaba quieto y parecia colgado. Un toque en
   el texto lo arranca, otro lo para. Mientras grabas manda el modo elegido. */
function ensayoConToque(){
  if(grabando || cfg.modo === "dedo") return;
  if(autoRaf){ pararAuto(); avisar("Ensayo en pausa."); return; }
  var p = $("prompter");
  var total = p.scrollHeight - p.clientHeight;
  if(total <= 2){ avisar("El guion cabe entero en pantalla, no hay nada que subir."); return; }
  if(p.scrollTop >= total - 2){ reiniciarGuion(); avisar("Vuelvo al principio."); return; }
  arrancarAuto();
  avisar("Ensayando. Toca el texto otra vez para parar.");
}

/* =========================================================
   6a · SUBIR EL GUION CON EL DEDO, EN CUALQUIER MODO
   Queja del 27-08: "sigo sin poder deslizar para arriba".
   Antes el dedo solo servia en el modo "Con el dedo" (era el unico con
   overflow-y:auto); en "Te sigue" y "Solo" el prompter estaba en
   overflow:hidden y arrastrar no hacia absolutamente nada. Si la voz no
   lo seguia, el guion quedaba clavado sin salida manual.
   Se hace a mano con pointer events y no con el scroll del navegador
   porque asi:
     - funciona igual en los tres modos y tambien mientras grabas,
     - se distingue el TOQUE (ensayar) del ARRASTRE (mover) por distancia,
     - arrastrar corta el avance automatico en vez de pelearse con el.
   ========================================================= */
var UMBRAL = 8;                      /* px antes de considerarlo arrastre */
var dedo = null, inerciaRaf = null;

function pararInercia(){ if(inerciaRaf){ cancelAnimationFrame(inerciaRaf); inerciaRaf = null; } }

function limitar(v){
  var p = $("prompter");
  var total = Math.max(0, p.scrollHeight - p.clientHeight);
  return Math.min(total, Math.max(0, v));
}

$("prompter").addEventListener("pointerdown", function(ev){
  pararInercia();
  dedo = { y: ev.clientY, y0: ev.clientY, scroll0: $("prompter").scrollTop,
           movio: false, vel: 0, t: (ev.timeStamp || 0) };
  try{ $("prompter").setPointerCapture(ev.pointerId); }catch(e){}
});

$("prompter").addEventListener("pointermove", function(ev){
  if(!dedo) return;
  var dy = ev.clientY - dedo.y0;
  if(!dedo.movio && Math.abs(dy) < UMBRAL) return;
  if(!dedo.movio){
    dedo.movio = true;
    pararAuto();                     /* el dedo manda sobre el ensayo */
  }
  var dt = (ev.timeStamp || 0) - dedo.t;
  if(dt > 0) dedo.vel = (dedo.y - ev.clientY) / dt;   /* px por ms, positivo = subiendo */
  dedo.y = ev.clientY; dedo.t = (ev.timeStamp || 0);
  $("prompter").scrollTop = limitar(dedo.scroll0 - dy);
  ev.preventDefault();
});

function soltarDedo(ev){
  if(!dedo) return;
  var movio = dedo.movio, vel = dedo.vel;
  try{ $("prompter").releasePointerCapture(ev.pointerId); }catch(e){}
  dedo = null;
  if(!movio){ ensayoConToque(); return; }
  /* inercia corta, para que se sienta como el scroll del telefono */
  if(Math.abs(vel) > 0.05){
    var v = vel * 16;                                  /* px por cuadro */
    var paso = function(){
      v *= 0.94;
      var antes = $("prompter").scrollTop;
      $("prompter").scrollTop = limitar(antes + v);
      if(Math.abs(v) > 0.3 && $("prompter").scrollTop !== antes){ inerciaRaf = requestAnimationFrame(paso); }
      else inerciaRaf = null;
    };
    inerciaRaf = requestAnimationFrame(paso);
  }
}
$("prompter").addEventListener("pointerup", soltarDedo);
$("prompter").addEventListener("pointercancel", function(ev){ if(dedo){ dedo = null; } });

/* =========================================================
   6b · recorte a vertical
   Si la camara entrega el video acostado (pasa seguido en iPhone), lo
   recortamos al centro en 9:16 mientras grabamos. Asi el archivo sale
   vertical de verdad, no solo se ve vertical en pantalla.
   ========================================================= */
var lienzo = null, pincel = null, pintarRaf = null, streamLienzo = null;

/* lo que de verdad entrega la camara ahora mismo */
function medidasCamara(){
  var v = $("cam");
  var st = (vTrack && vTrack.getSettings) ? vTrack.getSettings() : {};
  return {
    ancho: st.width || (v && v.videoWidth) || 0,
    alto:  st.height || (v && v.videoHeight) || 0
  };
}

/* 9:16 es 0,5625. Se compara la FORMA, no si es alta o ancha: una camara que
   entrega cuadrado (1:1) o 3:4 tambien hay que recortarla, y antes no se hacia
   -el visor mostraba 9:16 y el archivo salia cuadrado-. */
function necesitaRecorte(){
  if(cfg.formato !== "vertical") return false;
  var c = medidasCamara();
  if(!c.ancho || !c.alto) return false;
  return Math.abs(c.ancho / c.alto - 9/16) > 0.01;
}

/* el tamano exacto del archivo que va a salir */
function medidasSalida(){
  var c = medidasCamara();
  if(!c.ancho || !c.alto) return { ancho:0, alto:0 };
  if(!necesitaRecorte()) return { ancho:c.ancho, alto:c.alto };
  /* Cuando hay que recortar, el recorte lo pinta la app cuadro a cuadro sobre un
     lienzo, y eso lo paga el telefono. Por encima de 1920 de alto no vale la
     pena: Instagram pide 1080x1920 y un lienzo de 4K a 30 cuadros ahoga al
     iPhone. Si la camara ya entrega 9:16, no se toca nada y se graba tal cual,
     aunque sea 4K, porque de eso se encarga el hardware. */
  var alto = Math.min(1920, c.alto);
  var ancho = Math.min(Math.round(alto * 9 / 16), Math.round(c.ancho * alto / c.alto));
  if(ancho % 2) ancho++;
  if(alto % 2) alto++;
  return { ancho:ancho, alto:alto };
}

function armarLienzo(){
  soltarLienzo();          /* si quedaba uno vivo, se suelta: dos pintores a la vez ahogan el telefono */
  var v = $("cam");
  var m = medidasSalida();
  var ancho = m.ancho, alto = m.alto;
  if(!ancho || !alto) throw new Error("la camara todavia no entrega imagen");

  if(!lienzo){
    lienzo = document.createElement("canvas");
    pincel = lienzo.getContext("2d", { alpha:false });
  }
  lienzo.width = ancho;
  lienzo.height = alto;

  function pintar(){
    var vw = v.videoWidth, vh = v.videoHeight;
    if(vw && vh){
      var escala = Math.max(ancho / vw, alto / vh);
      var w = vw * escala, hh = vh * escala;
      pincel.drawImage(v, (ancho - w) / 2, (alto - hh) / 2, w, hh);
    }
    pintarRaf = requestAnimationFrame(pintar);
  }
  pintar();

  streamLienzo = lienzo.captureStream(30);
  var a = stream.getAudioTracks();
  if(a.length) streamLienzo.addTrack(a[0]);
  return streamLienzo;
}

function soltarLienzo(){
  if(pintarRaf){ cancelAnimationFrame(pintarRaf); pintarRaf = null; }
  if(streamLienzo){
    streamLienzo.getVideoTracks().forEach(function(t){ t.stop(); });
    streamLienzo = null;
  }
}

/* =========================================================
   6c · EL VIDEO SE ESCRIBE EN EL TELÉFONO MIENTRAS GRABAS
   28-08-2026: perdió una toma de 819,8 MB. El video vivía entero en la
   memoria de la página hasta que lo guardabas; a ese tamaño Safari no pudo
   ni mostrarlo ni sacarlo («Error de WebKitBlobResource 1»), y sin copia en
   disco no había nada que rescatar. Ahora cada trozo va al almacenamiento
   del teléfono según sale, y la toma sobrevive aunque la app se recargue.
   ========================================================= */
var obrero = null, discoEnUso = false, discoNombre = "", discoMime = "", discoBytes = 0;
var cola = Promise.resolve(), discoRoto = false;

function hayDisco(){
  return !!(window.Worker && navigator.storage && navigator.storage.getDirectory);
}

function pendientes(){ var p = guardado("pendientes", []); return (p && p.length) ? p : []; }

/* abre el archivo de esta toma; devuelve si se pudo o no */
function abrirDisco(ext, mime){
  discoBytes = 0; discoEnUso = false; discoRoto = false;
  if(!hayDisco()) return Promise.resolve(false);
  if(!obrero){
    try{ obrero = new Worker("grabador-disco.js"); }
    catch(e){ return Promise.resolve(false); }
    obrero.addEventListener("message", function(ev){
      var m = ev.data || {};
      if(m.tipo === "escrito"){ discoBytes = m.bytes; return; }
      if(m.tipo === "no-cabe"){
        discoBytes = m.bytes; discoRoto = true;
        avisar("No cabe más video en el teléfono. Paré la toma y guardé lo que alcanzó a entrar.", true);
        parar("no cabía más video en el teléfono");
      }
    });
  }
  discoNombre = "toma-" + Math.floor((Date.now() - 1750000000000) / 1000) + "." + ext;
  discoMime = mime || "video/mp4";
  return new Promise(function(res){
    var alListo = function(ev){
      var m = ev.data || {};
      if(m.tipo !== "listo" && m.tipo !== "sin-disco") return;
      obrero.removeEventListener("message", alListo);
      discoEnUso = (m.tipo === "listo");
      res(discoEnUso);
    };
    obrero.addEventListener("message", alListo);
    obrero.postMessage({ tipo: "abrir", nombre: discoNombre });
  });
}

function escribirEnDisco(trozo){
  cola = cola.then(function(){ return trozo.arrayBuffer(); }).then(function(buf){
    obrero.postMessage({ tipo: "trozo", datos: buf }, [buf]);
  }).catch(function(){});
}

/* cierra el archivo y lo devuelve como un File que vive en el DISCO, no en la
   memoria: es lo que después se manda a Fotos */
function cerrarDisco(){
  if(!discoEnUso || !obrero) return Promise.resolve(null);
  return cola.then(function(){
    return new Promise(function(res){
      var alCerrar = function(ev){
        if((ev.data || {}).tipo !== "cerrado") return;
        obrero.removeEventListener("message", alCerrar);
        res(ev.data.bytes || 0);
      };
      obrero.addEventListener("message", alCerrar);
      obrero.postMessage({ tipo: "cerrar" });
    });
  }).then(function(){
    return navigator.storage.getDirectory();
  }).then(function(raiz){
    return raiz.getFileHandle(discoNombre);
  }).then(function(h){
    return h.getFile();
  }).then(function(f){
    if(f && !f.type && discoMime){
      try{ return new File([f], discoNombre, { type: discoMime }); }catch(e){}
    }
    return f;
  });
}

function anotarPendiente(nombre, mime, bytes){
  var p = pendientes();
  p = p.filter(function(x){ return x.nombre !== nombre; });
  p.push({ nombre: nombre, mime: mime, bytes: bytes });
  if(p.length > 12) p = p.slice(-12);
  guardar("pendientes", p);
}

function olvidarPendiente(nombre){
  guardar("pendientes", pendientes().filter(function(x){ return x.nombre !== nombre; }));
}

function borrarDelTelefono(nombre){
  if(!hayDisco()) return Promise.resolve(false);
  return navigator.storage.getDirectory()
    .then(function(raiz){ return raiz.removeEntry(nombre); })
    .then(function(){ olvidarPendiente(nombre); return true; })
    .catch(function(){ olvidarPendiente(nombre); return false; });
}

/* al abrir la app: si quedó una toma sin pasar a Fotos, se rescata */
function rescatarPendiente(){
  var p = pendientes();
  if(!p.length || !hayDisco()) return;
  var ultima = p[p.length - 1];
  navigator.storage.getDirectory()
    .then(function(raiz){ return raiz.getFileHandle(ultima.nombre); })
    .then(function(h){ return h.getFile(); })
    .then(function(f){
      if(!f || !f.size){ olvidarPendiente(ultima.nombre); return; }
      if(f.type || !ultima.mime){ discoNombre = ultima.nombre; }
      else { try{ f = new File([f], ultima.nombre, { type: ultima.mime }); }catch(e){} }
      discoNombre = ultima.nombre;
      blobFinal = f;
      $("b-ultimo").disabled = false;
      /* con calma: al abrir, la cámara avisa lo suyo y le pisaría este aviso */
      setTimeout(function(){
        avisar("Tienes una toma de " + (f.size/1048576).toFixed(0) + " MB guardada en el teléfono sin pasar a Fotos. Toca ▶ para sacarla.", true);
      }, 3500);
    })
    .catch(function(){ olvidarPendiente(ultima.nombre); });
}

/* =========================================================
   7 · grabar
   ========================================================= */
var grabador = null, trozos = [], grabando = false, t0 = 0, relojInt = null, blobFinal = null, wake = null;
var pesado = 0, pesados = false, trozosN = 0, trozosVacios = 0;
var pausado = false, pausaT0 = 0, pausadoTotal = 0;

/* los segundos que de verdad entraron al video: el rato en pausa no cuenta */
function segundosGrabados(){
  var extra = pausado ? (Date.now() - pausaT0) : 0;
  return Math.max(0, (Date.now() - t0 - pausadoTotal - extra) / 1000);
}

function mimeBueno(){
  var c = ["video/mp4;codecs=avc1.640028,mp4a.40.2","video/mp4;codecs=avc1","video/mp4",
           "video/webm;codecs=h264","video/webm;codecs=vp9,opus","video/webm"];
  if(typeof MediaRecorder === "undefined") return null;
  for(var i=0;i<c.length;i++){ try{ if(MediaRecorder.isTypeSupported(c[i])) return c[i]; }catch(e){} }
  return "";
}

/* El chorro de datos se calcula sobre los pixeles REALES del archivo (antes se
   calculaba sobre los de la camara, que con recorte son muchos mas).
   Y baja de 45 a 24 Mbps en 4K: un minuto a 45 Mbps son 337 MB metidos en la
   memoria del telefono, que es lo que ahogaba a Safari. A 24 Mbps la imagen se
   ve igual -Instagram recomprime a menos de 10- y ocupa la mitad. */
function bitrateVideo(){
  var m = medidasSalida();
  var px = (m.ancho || 1080) * (m.alto || 1920);
  if(px >= 6000000) return 24000000;   // 4K
  if(px >= 1800000) return 16000000;   // 1080p
  return 9000000;
}

var cuentaInt = null, pidiendoCam = false;

$("b-rec").addEventListener("click", function(){
  if(grabando){ parar("tocaste parar"); return; }
  if(cuentaInt){ cancelarCuenta(); avisar("Cuenta cancelada."); return; }
  if(pidiendoCam) return;                 /* ya vamos, no abrir dos camaras */
  despertarMedidor();
  /* ANTES de cada toma se mira el micrófono (26-10): si el teléfono lo cortó
     o lo dejó mudo, se abre uno nuevo. Antes se grababa igual, sin sonido. */
  var mic = estadoMic();
  var camViva = !!(vTrack && vTrack.readyState === "live");
  registroNuevo("Tocaste grabar. Micrófono: " + mic + ". Cámara: " + (camViva ? "bien" : "no está")
    + ". Medidor de sonido: " + estadoMedidor() + ".");
  if(!stream || mic !== "bien" || !camViva){
    if(stream) registrar("Abro cámara y micrófono de nuevo antes de grabar.");
    pidiendoCam = true;
    encender().then(esperarImagen).then(function(){
      if(mic !== "bien" && stream) avisar("El micrófono estaba " + mic + ": lo abrí de nuevo antes de grabar.");
      cuentaYGrabar();
    }).catch(function(){}).then(function(){ pidiendoCam = false; });
    return;
  }
  cuentaYGrabar();
});

/* tocar la cuenta regresiva la cancela: antes tapaba la pantalla y no habia
   como arrepentirse hasta que arrancaba sola */
$("cuenta").addEventListener("click", function(){
  if(cuentaInt){ cancelarCuenta(); avisar("Cuenta cancelada."); }
});

/* recién abierta, la cámara tarda un poco en dar la primera imagen: sin
   cuenta regresiva el video partía con cuadros negros */
function esperarImagen(){
  return new Promise(function(res){
    var v = $("cam"), t0 = Date.now();
    (function mirar(){
      if(v.videoWidth > 0 || Date.now() - t0 > 2000) return res();
      setTimeout(mirar, 50);
    })();
  });
}

function cancelarCuenta(){
  if(cuentaInt){ clearInterval(cuentaInt); cuentaInt = null; }
  $("cuenta").removeAttribute("data-on");
}

function cuentaYGrabar(){
  cerrarTodo();
  cancelarCuenta();
  var n = parseInt(cfg.cuenta, 10) || 0;
  if(!n){ arrancar(); return; }
  var c = $("cuenta");
  c.setAttribute("data-on","1");
  $("cuenta-n").textContent = n;
  cuentaInt = setInterval(function(){
    n--;
    if(n <= 0){
      cancelarCuenta();
      arrancar();
    } else {
      $("cuenta-n").textContent = n;
    }
  }, 1000);
}

function arrancar(){
  if(typeof MediaRecorder === "undefined"){
    avisar("Este navegador no puede grabar video. Ábrelo en Safari.", true);
    return;
  }
  pararAuto();          /* si venia ensayando, se corta */
  reiniciarGuion();
  trozos = [];
  blobFinal = null;
  pesados = false;
  trozosN = 0; trozosVacios = 0;
  micFallo = false; micAvisado = false;
  app.removeAttribute("data-mic");

  var op = { videoBitsPerSecond: bitrateVideo(), audioBitsPerSecond: 192000 };
  var m = mimeBueno();
  if(m) op.mimeType = m;

  var fuente = stream;
  if(necesitaRecorte()){
    try{ fuente = armarLienzo(); }
    catch(e){
      soltarLienzo();
      fuente = stream;
      avisar("No se pudo recortar a vertical, grabo como viene la cámara.", true);
    }
  }

  try{ grabador = new MediaRecorder(fuente, op); }
  catch(e){
    try{ grabador = new MediaRecorder(fuente); }
    catch(e2){
      soltarLienzo();
      registrar("No se pudo crear el grabador: " + (e2.name || e2.message) + ".");
      avisar("No se pudo empezar a grabar: " + (e2.name || e2.message), true);
      return;
    }
  }

  grabador.ondataavailable = function(ev){
    trozosN++;
    if(!ev.data || !ev.data.size){ trozosVacios++; return; }
    pesado += ev.data.size;
    /* al disco si se pudo abrir; a la memoria solo el primer segundo, mientras
       el archivo se abre, o si este teléfono no sabe guardar en disco */
    if(discoEnUso && !discoRoto) escribirEnDisco(ev.data);
    else trozos.push(ev.data);
    if(!pesados && pesado > (discoEnUso ? 400 : 350) * 1048576){
      pesados = true;
      avisar(discoEnUso
        ? "La toma ya pesa 400 MB. Está a salvo en el teléfono, pero a este tamaño cuesta pasarla a Fotos: mejor párala y sigue en otra toma."
        : "La toma ya pesa 350 MB y este teléfono la tiene en memoria. Párala y guárdala antes de que se atore.", true);
    }
  };
  grabador.onstop = cerrarToma;
  /* si Safari mata el grabador -se queda sin memoria, entra una llamada-, antes
     la app se quedaba con el punto rojo puesto para siempre y no reaccionaba:
     ese es el otro "se queda pegado". Ahora se cierra la toma como si hubieras
     tocado parar, y se guarda lo que alcanzo a grabar. */
  grabador.onerror = function(ev){
    var n = ev && ev.error ? (ev.error.name || ev.error.message) : "";
    registrar("El teléfono cortó la grabación" + (n ? " (" + n + ")" : "") + ".");
    avisar("La grabación se cortó sola. Guardé lo que alcanzó a grabar.", true);
    parar("el grabador se cayó");
  };

  /* el archivo del teléfono se abre en paralelo: lo que llegue antes de que
     esté listo se guarda un segundo en memoria y después se vuelca */
  var ext = ((grabador.mimeType || m || "").indexOf("webm") > -1) ? "webm" : "mp4";
  var mimeArchivo = (grabador.mimeType || m || "video/mp4").split(";")[0];
  cola = Promise.resolve();
  abrirDisco(ext, mimeArchivo).then(function(sePudo){
    registrar(sePudo ? "Guardando en el teléfono mientras grabas." : "No se pudo guardar en el teléfono: va en la memoria.");
    if(!sePudo){
      avisar("Este teléfono no puede ir guardando mientras grabas: no hagas tomas muy largas.", true);
      return;
    }
    var previos = trozos; trozos = [];
    for(var i = 0; i < previos.length; i++) escribirEnDisco(previos[i]);
  });

  try{ grabador.start(1000); }
  catch(e3){
    soltarLienzo();
    registrar("El grabador no quiso partir: " + (e3.name || e3.message) + ".");
    avisar("No se pudo empezar a grabar: " + (e3.name || e3.message) + ". Toca grabar de nuevo.", true);
    return;
  }
  var pistas = fuente.getAudioTracks();
  registrar("Empezó a grabar: " + (grabador.mimeType || m || "formato del teléfono")
    + (fuente !== stream ? ", recortado a vertical" : ", tal como viene la cámara")
    + ", " + Math.round(op.videoBitsPerSecond / 1000000) + " Mbps. Micrófono en el video: "
    + (pistas.length ? (pistas[0].readyState === "live" ? "sí" : "TERMINADO") : "NO HAY")
    + " (" + estadoMic() + ", medidor " + estadoMedidor() + ").");
  pesado = 0;
  grabando = true;
  t0 = Date.now();
  pausado = false; pausaT0 = 0; pausadoTotal = 0;
  app.setAttribute("data-rec","1");
  app.setAttribute("data-pausa","0");
  $("b-pausa").disabled = false;
  $("b-pausa").setAttribute("aria-label","Pausar la grabación");
  pedirWakeLock();

  if(cfg.modo === "auto") arrancarAuto();

  /* el reloj lleva los MB al lado: el 28-08 se le fue una toma a 819,8 MB sin
     que nada se lo dijera hasta que ya no se podía guardar */
  relojInt = setInterval(function(){
    var s = Math.floor(segundosGrabados());
    var mb = Math.round((discoEnUso ? discoBytes : pesado) / 1048576);
    $("rec-time").textContent = Math.floor(s/60) + ":" + ("0" + (s%60)).slice(-2)
      + (mb >= 20 ? " · " + mb + " MB" : "");
  }, 250);
}

/* =========================================================
   7a · PAUSAR LA TOMA (encargo del 28-08)
   No corta el video: `MediaRecorder.pause()` deja de meter fotogramas y al
   seguir continúa en el MISMO archivo. Antes solo existía parar, o sea partir
   la grabación en varios videos y tener que pegarlos después.
   El guion se congela con ella: si no, mientras acomodas la luz el texto se
   te sigue yendo y vuelves a grabar desde otra parte.
   ========================================================= */
function puedePausar(){
  return !!(grabador && typeof grabador.pause === "function" && typeof grabador.resume === "function");
}

function pausarToma(){
  if(!grabando || pausado) return;
  if(!puedePausar()){ avisar("Este teléfono no sabe pausar. Puedes parar y grabar otra toma.", true); return; }
  try{ grabador.pause(); }
  catch(e){ avisar("No se pudo pausar: " + (e.name || e.message), true); return; }
  pausado = true;
  pausaT0 = Date.now();
  registrar("Pausa.");
  app.setAttribute("data-pausa","1");
  $("b-pausa").setAttribute("aria-label","Seguir grabando");
  pararAuto();
  avisar("En pausa. Toca otra vez para seguir en el mismo video.");
}

function seguirToma(){
  if(!grabando || !pausado) return;
  try{ grabador.resume(); }
  catch(e){ avisar("No se pudo seguir: " + (e.name || e.message), true); return; }
  pausadoTotal += Date.now() - pausaT0;
  pausado = false; pausaT0 = 0;
  medidor.ultimoSonido = Date.now();
  registrar("Siguió grabando.");
  app.setAttribute("data-pausa","0");
  $("b-pausa").setAttribute("aria-label","Pausar la grabación");
  if(cfg.modo === "auto") arrancarAuto();
  avisar("Seguimos.");
}

$("b-pausa").addEventListener("click", function(){
  if(!grabando){ avisar("Primero empieza a grabar."); return; }
  if(pausado) seguirToma(); else pausarToma();
});

/* =========================================================
   7b · ESCONDER EL GUION SIN SALIR DE LA GRABACIÓN (encargo del 28-08)
   Antes había que entrar a Ajustes y bajar «Cuánto tapa la pantalla» a 0,
   o sea salir de la pantalla de grabar en medio de una toma.
   ========================================================= */
function verGuion(ocultar){
  app.setAttribute("data-oculto", ocultar ? "1" : "0");
  $("b-tapar").setAttribute("aria-pressed", ocultar ? "true" : "false");
  $("b-tapar").setAttribute("aria-label", ocultar ? "Mostrar el guion" : "Ocultar el guion");
}
$("b-tapar").addEventListener("click", function(){
  var oculto = app.getAttribute("data-oculto") === "1";
  if(!oculto && cfg.tapa === 0){
    avisar("El guion ya está en 0 % en Ajustes: súbelo ahí para verlo.");
    return;
  }
  verGuion(!oculto);
  avisar(oculto ? "Guion a la vista." : "Guion escondido. Toca el ojo para traerlo de vuelta.");
});

function parar(motivo){
  if(!grabando) return;
  registrar("Paró: " + (motivo || "sin motivo") + ", a los " + segundosGrabados().toFixed(1).replace(".", ",") + " s.");
  grabando = false;
  /* si venía en pausa hay que cerrar la cuenta antes de soltar el estado, o la
     duración del video saldría con el rato parado metido dentro */
  if(pausado){ pausadoTotal += Date.now() - pausaT0; pausado = false; pausaT0 = 0; }
  if(relojInt){ clearInterval(relojInt); relojInt = null; }
  pararAuto();
  soltarWakeLock();
  app.setAttribute("data-rec","0");
  app.setAttribute("data-pausa","0");
  $("b-pausa").disabled = true;
  $("b-pausa").setAttribute("aria-label","Pausar la grabación");
  $("rec-time").textContent = "0:00";
  try{ grabador.stop(); }catch(e){}
  /* red de seguridad: si el grabador murio y nunca avisa que se detuvo, el
     pintor del recorte se quedaria dando vueltas para siempre comiendo bateria */
  setTimeout(function(){ if(!grabando) soltarLienzo(); }, 2500);
}

/* por encima de esto no se carga el video en el visor: el 28-08 uno de 819,8 MB
   dejó el recuadro en negro y de paso reventó el guardado */
var TOPE_VISOR = guardado("topeVisor", 250);   /* las pruebas lo bajan para no grabar 250 MB */

function cerrarToma(){
  soltarLienzo();
  app.removeAttribute("data-mic");
  /* si el micrófono se murió en esta toma, la siguiente parte con uno nuevo */
  if(micFallo){
    micFallo = false;
    registrar("Dejo un micrófono nuevo listo para la próxima toma.");
    if(!pidiendoCam) encender().catch(function(){});
  }
  var trozosTxt = trozosN + " trozos" + (trozosVacios ? " (" + trozosVacios + " vacíos)" : "")
    + ", el grabador entregó " + (pesado / 1048576).toFixed(1).replace(".", ",") + " MB"
    + (discoEnUso ? " y el disco recibió " + (discoBytes / 1048576).toFixed(1).replace(".", ",") + " MB" : "");
  var tipo = (grabador && grabador.mimeType) ? grabador.mimeType.split(";")[0] : "video/mp4";

  if(discoEnUso){
    cerrarDisco().then(function(f){
      discoEnUso = false;
      if(!f || !f.size){
        registrar("No quedó nada grabado: el teléfono entregó " + trozosTxt + " y el archivo quedó en 0 MB.");
        avisar("No quedó nada grabado. Prueba de nuevo.", true); return;
      }
      registrar("Terminó bien: " + (f.size / 1048576).toFixed(1).replace(".", ",") + " MB guardados en el teléfono, " + trozosTxt + ".");
      anotarPendiente(discoNombre, tipo, f.size);
      mostrarToma(f);
    }).catch(function(e){
      discoEnUso = false;
      registrar("No se pudo cerrar el video: " + (e && (e.name || e.message) || "error") + " (" + trozosTxt + ").");
      avisar("No se pudo cerrar el video: " + (e && (e.name || e.message) || "error"), true);
    });
    return;
  }

  var b = new Blob(trozos, { type: tipo });
  trozos = [];                       /* los pedazos ya estan dentro del blob: sobran */
  if(!b.size){
    registrar("No quedó nada grabado: el teléfono entregó " + trozosTxt + ", 0 MB.");
    avisar("No quedó nada grabado. Prueba de nuevo.", true); return;
  }
  registrar("Terminó bien: " + (b.size / 1048576).toFixed(1).replace(".", ",") + " MB en la memoria, " + trozosTxt + ".");
  mostrarToma(b);
}

function mostrarToma(archivo){
  blobFinal = archivo;
  soltarRevision();                  /* la toma anterior se suelta ANTES de cargar esta */
  $("b-ultimo").disabled = false;
  $("b-borrar-toma").hidden = true;
  $("nota-disco").textContent = discoEnUso || pendientes().length
    ? "Esta toma está guardada en tu teléfono: aunque se cierre la app, no se pierde."
    : "Mientras grabas, el video se va guardando en tu teléfono: si la app se cierra, la toma no se pierde.";
  var mb = archivo.size / 1048576;
  var peso = mb.toFixed(1).replace(".", ",") + " MB";

  if(mb > TOPE_VISOR){
    /* ni se intenta: a este tamaño el visor se lleva puesto al teléfono */
    $("rev").removeAttribute("src");
    $("b-ver-igual").hidden = false;
    $("rev-datos").textContent = peso + " · pesa demasiado para verlo acá; guárdalo directo en Fotos";
    abrir("hoja-video");
    return;
  }
  $("b-ver-igual").hidden = true;
  verLaToma();
}

function verLaToma(){
  if(!blobFinal) return;
  $("b-ver-igual").hidden = true;
  urlRevision = URL.createObjectURL(blobFinal);
  $("rev").src = urlRevision;

  $("rev-datos").textContent = (blobFinal.size / 1048576).toFixed(1).replace(".", ",") + " MB · cargando…";
  $("rev").onloadedmetadata = function(){
    var v = $("rev");
    var seg = (isFinite(v.duration) && v.duration) ? v.duration : segundosGrabados();
    $("rev-datos").textContent = (v.videoWidth || "?") + " × " + (v.videoHeight || "?")
      + " · " + (blobFinal.size / 1048576).toFixed(1).replace(".", ",") + " MB · "
      + seg.toFixed(1).replace(".", ",") + " s";
  };
  /* si el telefono no puede abrir el video -se quedo sin memoria, o el formato
     no le sirve- hay que decirlo: antes quedaba un recuadro negro sin ninguna
     explicacion, que es justo lo que le salio el 27-08 */
  $("rev").onerror = function(){
    $("rev-datos").textContent = (blobFinal.size / 1048576).toFixed(1).replace(".", ",")
      + " MB · el teléfono no pudo abrirlo aquí";
    avisar("El video quedó grabado pero el teléfono no puede mostrarlo acá. Igual puedes guardarlo en Fotos.", true);
  };
  abrir("hoja-video");
}

$("b-ultimo").addEventListener("click", function(){ if(blobFinal) abrir("hoja-video"); });

/* Al volver a grabar el video de la revision se queda pausado. Antes seguia
   sonando por debajo -y se colaba en la toma nueva-. */
$("b-otra").addEventListener("click", function(){
  var v = $("rev");
  try{ v.pause(); }catch(e){}
  cerrarTodo();
  reiniciarGuion();
});

/* suelta de la memoria el video que se estaba revisando */
var urlRevision = null;
function soltarRevision(){
  var v = $("rev");
  try{ v.pause(); }catch(e){}
  if(urlRevision){
    try{ v.removeAttribute("src"); v.load(); }catch(e){}
    try{ URL.revokeObjectURL(urlRevision); }catch(e){}
    urlRevision = null;
  }
}

/* pantalla siempre encendida mientras grabas */
function pedirWakeLock(){
  try{
    if(navigator.wakeLock && navigator.wakeLock.request){
      navigator.wakeLock.request("screen").then(function(w){ wake = w; }).catch(function(){});
    }
  }catch(e){}
}
function soltarWakeLock(){ if(wake){ try{ wake.release(); }catch(e){} wake = null; } }

/* =========================================================
   8 · guardar en Fotos
   ========================================================= */
var compartiendo = false;
$("b-fotos").addEventListener("click", function(){
  if(!blobFinal || compartiendo){ return; }
  compartiendo = true;
  setTimeout(function(){ compartiendo = false; }, 1500);
  var tipo = blobFinal.type || "video/mp4";
  var ext = tipo.indexOf("webm") > -1 ? "webm" : "mp4";
  var nombre = "prompter-" + Math.floor((Date.now() - 1750000000000) / 1000) + "." + ext;
  var archivo = null;
  try{ archivo = new File([blobFinal], nombre, { type: tipo }); }catch(e){}

  if(archivo && navigator.canShare && navigator.canShare({ files: [archivo] })){
    navigator.share({ files: [archivo] })
      .then(function(){ guardadaBien(); })
      .catch(function(e){
        if(e && e.name === "AbortError") return;
        bajarDirecto(nombre);
      });
    return;
  }
  bajarDirecto(nombre);
});

/* la toma ya esta en Fotos: recien ahi se puede soltar la copia del telefono,
   y aun asi la borra el, no la app -es su video- */
function guardadaBien(){
  avisar("Listo, revisa tu carrete.");
  if(discoNombre && pendientes().some(function(x){ return x.nombre === discoNombre; })){
    $("b-borrar-toma").hidden = false;
    $("nota-disco").textContent = "La copia sigue guardada en tu teléfono por si acaso. Si ya la viste en Fotos, puedes borrarla acá abajo.";
  }
}

$("b-ver-igual").addEventListener("click", function(){ verLaToma(); });

$("b-borrar-toma").addEventListener("click", function(){
  var n = discoNombre;
  if(!n) return;
  borrarDelTelefono(n).then(function(ok){
    $("b-borrar-toma").hidden = true;
    avisar(ok ? "Borrada del teléfono." : "Ya no estaba en el teléfono.");
  });
});

function bajarDirecto(nombre){
  try{
    var url = URL.createObjectURL(blobFinal);
    var a = document.createElement("a");
    a.href = url; a.download = nombre; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
    avisar("Si no pasó nada, mantén el dedo apretado sobre el video y elige «Guardar en Fotos».", true);
  }catch(e){
    avisar("Mantén el dedo apretado sobre el video y elige «Guardar en Fotos».", true);
  }
}

/* =========================================================
   9 · cablear los ajustes
   ========================================================= */
$("s-tapa").addEventListener("input", function(){
  cfg.tapa = parseInt(this.value,10); guardar("tapa", cfg.tapa); aplicarCfg();
});
$("s-letra").addEventListener("input", function(){
  cfg.letra = parseInt(this.value,10); guardar("letra", cfg.letra); aplicarCfg();
});
/* la velocidad nueva se aplica AL TIRO si el texto va subiendo (grabando o
   ensayando), desde donde va: no salta ni vuelve atras */
function ponerVel(v){
  cfg.vel = Math.max(VEL_MIN, Math.min(VEL_MAX, v));
  guardar("vel", cfg.vel); aplicarCfg();
  if((autoRaf || grabando) && !pausado && cfg.modo === "auto") arrancarAuto();
}
$("s-vel").addEventListener("input", function(){ ponerVel(parseInt(this.value,10)); });
$("b-mas").addEventListener("click", function(){ ponerVel(cfg.vel + 1); });
$("b-menos").addEventListener("click", function(){ ponerVel(cfg.vel - 1); });

$("b-encender").addEventListener("click", function(){
  $("b-encender").hidden = true;
  if(grabando) return;                 /* nunca apagar la cámara de una toma andando */
  encender().catch(function(){});
});

conectarSeg("g-pos","pos");
conectarSeg("g-fondo","fondo");
conectarSeg("g-modo","modo", function(){
  if(!grabando) return;
  pararAuto();
  if(pausado) return;                 /* en pausa el guion NO se mueve, pase lo que pase */
  if(cfg.modo === "auto") arrancarAuto();
});
conectarSeg("g-enc","enc");
conectarSeg("g-formato","formato", function(){
  notaCamara();
  if(grabando) avisar("El formato nuevo se aplica en la próxima toma, no en esta.");
});
conectarSeg("g-esp","esp");
conectarSeg("g-cuenta","cuenta");
conectarSeg("g-cal","cal", function(){ if(stream && !grabando) encender().catch(function(){}); });

$("b-reset").addEventListener("click", function(){
  for(var k in POR_DEFECTO){ cfg[k] = POR_DEFECTO[k]; guardar(k, cfg[k]); }
  aplicarCfg();
  avisar("Ajustes como venían de fábrica.");
});

/* ---- botones del guion ---- */
$("ta").addEventListener("input", contarTa);

$("b-usar").addEventListener("click", function(){
  cargarGuion($("ta").value);
  cerrarTodo();
  avisar(guionCrudo.length ? "Guion cargado, " + guionCrudo.length + " palabras." : "Pegaste un guion vacío.");
});

$("b-guardar-guion").addEventListener("click", function(){
  var txt = $("ta").value.replace(/\s+/g," ").trim();
  if(!txt){ avisar("No hay nada que guardar."); return; }
  var nombre = txt.split(" ").slice(0,5).join(" ");
  if(nombre.length > 42) nombre = nombre.slice(0,42) + "…";
  var gs = listaGuiones();
  gs.unshift({ nombre: nombre, texto: txt, palabras: txt.split(" ").length });
  if(gs.length > 40) gs.length = 40;
  if(!guardar("guiones", gs)){
    avisar("No cabe: el teléfono no tiene espacio para más guiones. Borra alguno.", true);
    return;
  }
  pintarLista();
  avisar("Guardado.");
});

$("b-limpiar").addEventListener("click", function(){
  $("ta").value = ""; contarTa(); $("ta").focus();
});

/* ---- arranque ---- */
aplicarCfg();
if(registro.length) pintarRegistro();
pintarMios();
pintarLista();
var ultimo = guardado("guionActual", "");
if(ultimo){ $("ta").value = ultimo; cargarGuion(ultimo); }
contarTa();

encender().catch(function(){});

/* si el teléfono nos deja, que no borre solo lo grabado por falta de espacio */
if(navigator.storage && navigator.storage.persist){ try{ navigator.storage.persist(); }catch(e){} }
rescatarPendiente();

document.addEventListener("visibilitychange", function(){
  if(document.hidden){
    if(grabando) parar("te fuiste de la app o se apagó la pantalla");
    return;
  }
  /* VOLVER DE OTRA APP = CÁMARA Y MICRÓFONO NUEVOS (26-10). Al irte, iOS
     corta o deja mudo el micrófono y no lo devuelve: la toma siguiente salía
     sin sonido. Antes solo se le daba play a la imagen congelada. */
  if(stream && !grabando && !pidiendoCam){
    registrar("Volviste a la app: abro cámara y micrófono nuevos.");
    encender().catch(function(){});
  }
});

/* el telefono acostado con formato vertical: avisar una vez, no cada rato */
var avisoGiro = false;
function mirarGiro(){
  var acostado = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
  if(acostado && cfg.formato === "vertical" && !avisoGiro){
    avisoGiro = true;
    avisar("Tienes el teléfono acostado y el formato en vertical: gíralo, o cambia el formato en Ajustes.", true);
  }
  if(!acostado) avisoGiro = false;
}
window.addEventListener("orientationchange", function(){ setTimeout(mirarGiro, 300); });
window.addEventListener("resize", mirarGiro);
window.addEventListener("pagehide", function(){
  if(grabando) parar("se cerró la app");          /* primero cerrar la toma, despues apagar */
  pararAuto(); soltarLienzo(); apagarCam();
});

/* LA VERSION ESCRITA, para que nunca mas tenga que adivinar si el telefono
   abrio lo nuevo o lo viejo: sale en Ajustes, y la primera vez que arranca
   una version nueva lo dice en pantalla. */
(function(){
  var e = $("version");
  if(e) e.textContent = "Versión " + VERSION + " · si acá no dice lo mismo que te dijeron, tu teléfono abrió una versión vieja: cierra la app del todo y vuelve a abrirla.";
  var anterior = guardado("version", null);
  if(anterior !== VERSION){
    guardar("version", VERSION);
    if(anterior) avisar("Actualizada a la versión " + VERSION + ".");
  }
})();

/* sonda para el banco de pruebas: solo lee, no toca nada */
window.__PC_DIAG = function(){
  return {
    grabando: grabando, trozos: trozos.length,
    auto: !!autoRaf, pintando: !!pintarRaf,
    pausado: pausado, estadoGrabador: grabador ? grabador.state : "-",
    mic: estadoMic(), medidorOye: medidor.funciona,
    enDisco: discoEnUso, discoNombre: discoNombre, discoBytes: discoBytes,
    pendientes: pendientes().length, topeVisor: TOPE_VISOR,
    pesaMB: blobFinal ? Math.round(blobFinal.size / 1048576 * 10) / 10 : 0,
    oculto: app.getAttribute("data-oculto") === "1",
    appScrollTop: app.scrollTop,
    urlRevision: !!urlRevision, salida: medidasSalida()
  };
};

})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  });
}
