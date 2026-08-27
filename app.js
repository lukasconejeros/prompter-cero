(function(){
"use strict";

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
  try{ localStorage.setItem("pc." + clave, JSON.stringify(valor)); }catch(e){}
}

/* =========================================================
   1 · ajustes (se guardan solos)
   ========================================================= */
var POR_DEFECTO = {
  tapa:34, letra:24, pos:"arriba", dicho:"apaga", fondo:"1",
  modo:"voz", vel:10, cal:"max", enc:"ver", esp:"1", cuenta:3,
  formato:"vertical"
};
var cfg = {};
for(var k in POR_DEFECTO){ cfg[k] = guardado(k, POR_DEFECTO[k]); }

function aplicarCfg(){
  app.setAttribute("data-pos", cfg.pos);
  app.setAttribute("data-dicho", cfg.dicho);
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
  $("s-vel").value = cfg.vel;     $("d-vel").textContent = (cfg.vel/10).toFixed(1).replace(".",",") + "×";

  marcarSeg("g-pos", cfg.pos);
  marcarSeg("g-dicho", cfg.dicho);
  marcarSeg("g-fondo", String(cfg.fondo));
  marcarSeg("g-modo", cfg.modo);
  marcarSeg("g-cal", cfg.cal);
  marcarSeg("g-enc", cfg.enc);
  marcarSeg("g-formato", cfg.formato);
  marcarSeg("g-esp", String(cfg.esp));
  marcarSeg("g-cuenta", String(cfg.cuenta));

  $("nota-voz").textContent = cfg.modo === "voz"
    ? (SR ? "El texto avanza cuando dices las palabras. Si tu iPhone no lo permite, te aviso y cambio solo al modo «solo»."
          : "Tu navegador no puede escucharte, así que este modo no va a funcionar. Usa «solo» o «con el dedo».")
    : (cfg.modo === "auto" ? "El texto sube parejo a la velocidad de arriba." : "Lo empujas tú con el pulgar sobre el texto.");
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
var guionCrudo = [], guionNorm = [], puntero = 0, palabrasEl = [];

function normalizar(txt){
  return txt.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/).filter(Boolean);
}

function cargarGuion(txt){
  var limpio = (txt || "").replace(/\s+/g," ").trim();
  var t = $("texto");
  if(!limpio){
    t.className = "vacio";
    t.textContent = "Toca «Guion» para pegar lo que vas a decir.";
    guionCrudo = []; guionNorm = []; palabrasEl = []; puntero = 0;
    return;
  }
  guionCrudo = limpio.split(" ");
  guionNorm = guionCrudo.map(function(p){ var n = normalizar(p); return n.length ? n[0] : ""; });

  var html = "";
  for(var i=0;i<guionCrudo.length;i++){
    html += "<w>" + guionCrudo[i].replace(/&/g,"&amp;").replace(/</g,"&lt;") + "</w> ";
  }
  t.className = "";
  t.innerHTML = html;
  palabrasEl = t.querySelectorAll("w");
  puntero = 0;
  $("prompter").scrollTop = 0;
  guardar("guionActual", limpio);
}

function moverPuntero(nuevo){
  if(nuevo <= puntero || !palabrasEl.length) return;
  for(var j=0;j<palabrasEl.length;j++){
    if(palabrasEl[j].className === "actual") palabrasEl[j].className = "dicho";
  }
  for(var i=puntero;i<nuevo && i<palabrasEl.length;i++){ palabrasEl[i].className = "dicho"; }
  puntero = nuevo;
  if(palabrasEl[puntero]){
    palabrasEl[puntero].className = "actual";
    var p = $("prompter");
    var off = palabrasEl[puntero].offsetTop - p.clientHeight * 0.32;
    p.scrollTop = Math.max(0, off);
  }
}

function reiniciarGuion(){
  puntero = 0;
  $("prompter").scrollTop = 0;
  for(var i=0;i<palabrasEl.length;i++){ palabrasEl[i].className = ""; }
}

function contarTa(){
  var n = $("ta").value.trim() ? $("ta").value.trim().split(/\s+/).length : 0;
  var seg = Math.round(n / PALABRAS_POR_MINUTO * 60);
  $("conteo").textContent = n + (n === 1 ? " palabra" : " palabras");
  $("duracion").textContent = Math.floor(seg/60) + ":" + ("0" + (seg%60)).slice(-2);
}

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
}
function cerrarTodo(){
  var hs = document.querySelectorAll(".hoja");
  for(var i=0;i<hs.length;i++){ hs[i].removeAttribute("data-abierta"); }
  $("velo").removeAttribute("data-on");
}
$("velo").addEventListener("click", cerrarTodo);
document.addEventListener("click", function(ev){
  if(ev.target.classList && ev.target.classList.contains("asa")) cerrarTodo();
});
$("b-guion").addEventListener("click", function(){ abrir("hoja-guion"); $("ta").focus(); });
$("b-ajustes").addEventListener("click", function(){ abrir("hoja-ajustes"); });

/* =========================================================
   4 · la cámara
   ========================================================= */
var stream = null, frontal = guardado("frontal", true);
var vTrack = null;

function pedirVideo(){
  var alto, ancho;
  if(cfg.cal === "720"){ ancho = 720; alto = 1280; }
  else if(cfg.cal === "1080"){ ancho = 1080; alto = 1920; }
  else { ancho = 2160; alto = 3840; }          // vertical, no horizontal
  return {
    facingMode: { ideal: frontal ? "user" : "environment" },
    width:  { ideal: ancho },
    height: { ideal: alto },
    aspectRatio: { ideal: 9/16 },
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

function encender(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    avisar("Este navegador no puede abrir la cámara. Ábrela en Safari.", true);
    return Promise.reject();
  }
  apagarCam();
  return navigator.mediaDevices.getUserMedia({ video: pedirVideo(), audio: AUDIO_LIMPIO })
    .then(function(s){
      stream = s;
      vTrack = s.getVideoTracks()[0];
      $("cam").srcObject = s;
      $("cam").play().catch(function(){});
      $("b-encender").hidden = true;
      notaCamara();
    })
    .catch(function(e){
      var n = e && e.name ? e.name : "";
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

function notaCamara(){
  if(!vTrack || !vTrack.getSettings){ return; }
  var s = vTrack.getSettings();
  var txt = "La cámara entrega " + (s.width || "?") + " × " + (s.height || "?")
          + " a " + (s.frameRate ? Math.round(s.frameRate) : "?") + " cuadros por segundo. ";
  if(cfg.formato === "vertical"){
    if(camaraEsVertical()){
      txt += "Ya viene vertical, así que se graba tal cual.";
    } else {
      var alto = Math.min(1920, s.height || 1920);
      txt += "Viene acostada, así que al grabar se recorta al centro y el video sale vertical de "
           + Math.round(alto * 9 / 16) + " × " + alto + ".";
    }
  } else {
    txt += "Se graba tal cual viene, sin recortar.";
  }
  $("nota-cam").textContent = txt;
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
   5 · seguimiento por voz
   ========================================================= */
var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var rec = null, escuchando = false, oidoNada = null;

/* Incremental a proposito: iOS corta el reconocimiento solo cada pocos segundos
   y al volver el transcript arranca de cero. Si recalculamos desde el principio
   con ese transcript corto, el puntero nunca supera al viejo y el texto SE CONGELA
   a mitad de toma. Probado en test-seguimiento.js. */
var procesadas = 0;

function avanzarCon(palabra){
  var tope = Math.min(puntero + 8, guionNorm.length);
  for(var k=puntero;k<tope;k++){
    if(guionNorm[k] === palabra){ moverPuntero(k + 1); return true; }
  }
  return false;
}

function oirTanda(txt){
  var pal = normalizar(txt);
  if(pal.length < procesadas) procesadas = pal.length;   /* el interino encogio */
  for(var i=procesadas;i<pal.length;i++){ avanzarCon(pal[i]); }
  procesadas = pal.length;
}

function escuchar(){
  if(!SR || !guionNorm.length) return;
  escuchando = true;
  procesadas = 0;
  abrirRec();
  // si en 8 segundos no oyó una sola palabra, cae al modo automático
  oidoNada = setTimeout(function(){
    if(escuchando && puntero === 0){
      avisar("No te está oyendo. Cambio el texto a modo automático para que no te quedes botado.", true);
      dejarDeEscuchar();
      arrancarAuto();
    }
  }, 8000);
}

function abrirRec(){
  try{ rec = new SR(); }catch(e){ escuchando = false; return; }
  rec.lang = "es-CL";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onresult = function(ev){
    var t = "";
    for(var i=0;i<ev.results.length;i++){ t += ev.results[i][0].transcript + " "; }
    oirTanda(t);
  };
  rec.onerror = function(ev){
    var n = ev && ev.error ? ev.error : "";
    if(n === "not-allowed" || n === "service-not-allowed"){
      avisar("Tu iPhone no deja escuchar mientras graba. Cambio a modo automático.", true);
      dejarDeEscuchar();
      arrancarAuto();
    }
  };
  rec.onend = function(){
    if(!escuchando) return;
    procesadas = 0;                 /* la proxima tanda arranca de cero */
    setTimeout(function(){ if(escuchando){ try{ rec.start(); }catch(e){ abrirRec(); } } }, 200);
  };
  try{ rec.start(); }catch(e){}
}

function dejarDeEscuchar(){
  escuchando = false;
  if(oidoNada){ clearTimeout(oidoNada); oidoNada = null; }
  if(rec){ try{ rec.stop(); }catch(e){} }
}

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

/* =========================================================
   6b · recorte a vertical
   Si la camara entrega el video acostado (pasa seguido en iPhone), lo
   recortamos al centro en 9:16 mientras grabamos. Asi el archivo sale
   vertical de verdad, no solo se ve vertical en pantalla.
   ========================================================= */
var lienzo = null, pincel = null, pintarRaf = null, streamLienzo = null;

function camaraEsVertical(){
  if(!vTrack || !vTrack.getSettings) return true;
  var st = vTrack.getSettings();
  if(!st.width || !st.height) return true;
  return st.height >= st.width;
}

function necesitaRecorte(){
  return cfg.formato === "vertical" && !camaraEsVertical();
}

function armarLienzo(){
  var v = $("cam");
  var st = vTrack.getSettings ? vTrack.getSettings() : {};
  var altoReal = st.height || v.videoHeight || 1920;

  /* el alto manda: conservamos toda la altura de la camara y recortamos a los lados */
  var alto = Math.min(1920, altoReal);
  var ancho = Math.round(alto * 9 / 16);
  if(ancho % 2) ancho++;
  if(alto % 2) alto++;

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
   7 · grabar
   ========================================================= */
var grabador = null, trozos = [], grabando = false, t0 = 0, relojInt = null, blobFinal = null, wake = null;

function mimeBueno(){
  var c = ["video/mp4;codecs=avc1.640028,mp4a.40.2","video/mp4;codecs=avc1","video/mp4",
           "video/webm;codecs=h264","video/webm;codecs=vp9,opus","video/webm"];
  if(typeof MediaRecorder === "undefined") return null;
  for(var i=0;i<c.length;i++){ try{ if(MediaRecorder.isTypeSupported(c[i])) return c[i]; }catch(e){} }
  return "";
}

function bitrateVideo(){
  if(!vTrack || !vTrack.getSettings) return 12000000;
  var s = vTrack.getSettings();
  var px = (s.width || 1080) * (s.height || 1920);
  if(necesitaRecorte()) px = px * 9 / 16;    /* al recortar quedan menos pixeles */
  if(px >= 7000000) return 45000000;   // 4K
  if(px >= 2000000) return 20000000;   // 1080p
  return 10000000;
}

$("b-rec").addEventListener("click", function(){
  if(grabando){ parar(); return; }
  if(!stream){ encender().then(cuentaYGrabar).catch(function(){}); return; }
  cuentaYGrabar();
});

function cuentaYGrabar(){
  cerrarTodo();
  var n = parseInt(cfg.cuenta, 10) || 0;
  if(!n){ arrancar(); return; }
  var c = $("cuenta");
  c.setAttribute("data-on","1");
  $("cuenta-n").textContent = n;
  var i = setInterval(function(){
    n--;
    if(n <= 0){
      clearInterval(i);
      c.removeAttribute("data-on");
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
  reiniciarGuion();
  trozos = [];
  blobFinal = null;

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
      avisar("No se pudo empezar a grabar: " + (e2.name || e2.message), true);
      return;
    }
  }

  grabador.ondataavailable = function(ev){ if(ev.data && ev.data.size) trozos.push(ev.data); };
  grabador.onstop = cerrarToma;
  grabador.onerror = function(){ avisar("La grabación se cortó sola.", true); };

  grabador.start(1000);
  grabando = true;
  t0 = Date.now();
  app.setAttribute("data-rec","1");
  pedirWakeLock();

  if(cfg.modo === "voz") escuchar();
  else if(cfg.modo === "auto") arrancarAuto();

  relojInt = setInterval(function(){
    var s = Math.floor((Date.now() - t0) / 1000);
    $("rec-time").textContent = Math.floor(s/60) + ":" + ("0" + (s%60)).slice(-2);
  }, 250);
}

function parar(){
  if(!grabando) return;
  grabando = false;
  if(relojInt){ clearInterval(relojInt); relojInt = null; }
  dejarDeEscuchar();
  pararAuto();
  soltarWakeLock();
  app.setAttribute("data-rec","0");
  $("rec-time").textContent = "0:00";
  try{ grabador.stop(); }catch(e){}
}

function cerrarToma(){
  soltarLienzo();
  var tipo = (grabador && grabador.mimeType) ? grabador.mimeType.split(";")[0] : "video/mp4";
  blobFinal = new Blob(trozos, { type: tipo });
  if(!blobFinal.size){ avisar("No quedó nada grabado. Prueba de nuevo.", true); return; }

  var url = URL.createObjectURL(blobFinal);
  $("rev").src = url;
  $("b-ultimo").disabled = false;

  $("rev").onloadedmetadata = function(){
    var v = $("rev");
    var seg = (isFinite(v.duration) && v.duration) ? v.duration : (Date.now() - t0) / 1000;
    $("rev-datos").textContent = (v.videoWidth || "?") + " × " + (v.videoHeight || "?")
      + " · " + (blobFinal.size / 1048576).toFixed(1).replace(".", ",") + " MB · "
      + seg.toFixed(1).replace(".", ",") + " s";
  };
  abrir("hoja-video");
}

$("b-ultimo").addEventListener("click", function(){ if(blobFinal) abrir("hoja-video"); });
$("b-otra").addEventListener("click", function(){ cerrarTodo(); reiniciarGuion(); });

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
$("b-fotos").addEventListener("click", function(){
  if(!blobFinal){ return; }
  var tipo = blobFinal.type || "video/mp4";
  var ext = tipo.indexOf("webm") > -1 ? "webm" : "mp4";
  var nombre = "prompter-" + Math.floor((Date.now() - 1750000000000) / 1000) + "." + ext;
  var archivo = null;
  try{ archivo = new File([blobFinal], nombre, { type: tipo }); }catch(e){}

  if(archivo && navigator.canShare && navigator.canShare({ files: [archivo] })){
    navigator.share({ files: [archivo] })
      .then(function(){ avisar("Listo, revisa tu carrete."); })
      .catch(function(e){
        if(e && e.name === "AbortError") return;
        bajarDirecto(nombre);
      });
    return;
  }
  bajarDirecto(nombre);
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
$("s-vel").addEventListener("input", function(){
  cfg.vel = parseInt(this.value,10); guardar("vel", cfg.vel); aplicarCfg();
  if(grabando && cfg.modo === "auto") arrancarAuto();
});

$("b-encender").addEventListener("click", function(){
  $("b-encender").hidden = true;
  encender().catch(function(){});
});

conectarSeg("g-pos","pos");
conectarSeg("g-dicho","dicho");
conectarSeg("g-fondo","fondo");
conectarSeg("g-modo","modo", function(){
  if(!grabando) return;
  dejarDeEscuchar(); pararAuto();
  if(cfg.modo === "voz") escuchar();
  else if(cfg.modo === "auto") arrancarAuto();
});
conectarSeg("g-enc","enc");
conectarSeg("g-formato","formato", notaCamara);
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
  guardar("guiones", gs);
  pintarLista();
  avisar("Guardado.");
});

$("b-limpiar").addEventListener("click", function(){
  $("ta").value = ""; contarTa(); $("ta").focus();
});

/* ---- arranque ---- */
aplicarCfg();
pintarLista();
var ultimo = guardado("guionActual", "");
if(ultimo){ $("ta").value = ultimo; cargarGuion(ultimo); }
contarTa();

encender().catch(function(){});

document.addEventListener("visibilitychange", function(){
  if(document.hidden && grabando) parar();
});
window.addEventListener("pagehide", function(){ dejarDeEscuchar(); apagarCam(); });

})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  });
}
