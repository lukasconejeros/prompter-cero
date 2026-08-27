/* Test del seguimiento por voz — se corre con:  node test-seguimiento.js
   Prueba el algoritmo puro, sin navegador. Ahi es donde estan los bugs de verdad.

   El caso que importa: iOS corta el reconocimiento de voz solo, cada pocos
   segundos, y al volver el transcript arranca de cero. Si el algoritmo mira el
   transcript completo cada vez, el texto SE CONGELA a mitad de toma. */

function normalizar(txt){
  return txt.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/).filter(Boolean);
}

/* ---------- el algoritmo bueno: incremental ---------- */
function Seguidor(guion){
  this.norm = guion.replace(/\s+/g," ").trim().split(" ")
    .map(function(p){ var n = normalizar(p); return n.length ? n[0] : ""; })
    .filter(function(p){ return p !== ""; });
  this.puntero = 0;
  this.procesadas = 0;
  this.VENTANA = 8;
}

/* una palabra oida: la busca en las proximas 8 del guion */
Seguidor.prototype.avanzarCon = function(palabra){
  var tope = Math.min(this.puntero + this.VENTANA, this.norm.length);
  for(var k=this.puntero;k<tope;k++){
    if(this.norm[k] === palabra){ this.puntero = k + 1; return true; }
  }
  return false;
};

/* lo que llega del reconocedor: el transcript de ESTA tanda, completo */
Seguidor.prototype.oir = function(tanda){
  var pal = normalizar(tanda);
  if(pal.length < this.procesadas) this.procesadas = pal.length;  /* el interino encogio */
  for(var i=this.procesadas;i<pal.length;i++){ this.avanzarCon(pal[i]); }
  this.procesadas = pal.length;
  return this.puntero;
};

/* iOS corto el reconocimiento: la proxima tanda arranca de cero */
Seguidor.prototype.seCorto = function(){ this.procesadas = 0; };

/* ---------- la version que estaba en linea: recalcula desde el principio ---------- */
function SeguidorViejo(guion){ Seguidor.call(this, guion); }
SeguidorViejo.prototype = Object.create(Seguidor.prototype);
SeguidorViejo.prototype.oir = function(tanda){
  var pal = normalizar(tanda), p = 0;
  for(var i=0;i<pal.length;i++){
    var tope = Math.min(p + 8, this.norm.length);
    for(var k=p;k<tope;k++){ if(this.norm[k] === pal[i]){ p = k + 1; break; } }
  }
  if(p > this.puntero) this.puntero = p;   /* nunca retrocede */
  return this.puntero;
};
SeguidorViejo.prototype.seCorto = function(){ /* no hacia nada */ };

/* ---------- arnes ---------- */
var fallos = 0, pruebas = 0;
function esto(nombre, real, esperado){
  pruebas++;
  var ok = real === esperado;
  if(!ok) fallos++;
  console.log((ok ? "  OK    " : "  FALLA ") + nombre +
              (ok ? "" : "   -> dio " + real + ", se esperaba " + esperado));
}

var GUION = "Hoy te voy a mostrar la unica cosa que nunca tienes que subirle a una inteligencia " +
            "artificial porque queda guardada aunque tu borres el chat";
var TOTAL = GUION.split(" ").length;

console.log("\n=== 1 - lo basico ===");
var s = new Seguidor(GUION);
esto("arranca en cero", s.puntero, 0);
esto("sigue las primeras palabras", s.oir("Hoy te voy a mostrar"), 5);
esto("sigue avanzando", s.oir("Hoy te voy a mostrar la unica cosa"), 8);

console.log("\n=== 2 - aguanta que hable mal ===");
s = new Seguidor(GUION);
esto("con tildes y mayusculas", s.oir("HOY TE VOY A MOSTRAR"), 5);
s = new Seguidor(GUION);
esto("con puntuacion pegada", s.oir("Hoy, te voy a mostrar..."), 5);
s = new Seguidor(GUION);
esto("si se salta una palabra", s.oir("Hoy te voy mostrar la unica"), 7);
s = new Seguidor(GUION);
esto("si mete una palabra de mas", s.oir("Hoy te voy este a mostrar"), 5);

console.log("\n=== 3 - no retrocede ni se traba ===");
s = new Seguidor(GUION);
s.oir("Hoy te voy a mostrar la unica cosa");
esto("ruido no lo mueve", s.oir("Hoy te voy a mostrar la unica cosa eh"), 8);
s = new Seguidor(GUION);
s.oir("Hoy te voy a mostrar");
esto("el interino encoge y no se traba", s.oir("Hoy te voy"), 5);
esto("y despues sigue igual", s.oir("Hoy te voy a mostrar la unica"), 7);

console.log("\n=== 4 - iOS corta el reconocimiento solo, cada pocos segundos ===");
function pruebaDelCorte(Clase, etiqueta){
  var x = new Clase(GUION);
  x.oir("Hoy te voy a mostrar la unica cosa que nunca");
  x.seCorto();
  x.oir("tienes que subirle a una");
  x.oir("tienes que subirle a una inteligencia artificial");
  console.log("    " + etiqueta + " quedo en la palabra " + x.puntero + " de " + TOTAL);
  return x.puntero;
}
var conBug    = pruebaDelCorte(SeguidorViejo, "version vieja ......");
var arreglado = pruebaDelCorte(Seguidor,      "version arreglada ..");
esto("la version vieja SE CONGELA tras el corte", conBug, 10);
esto("la arreglada sigue avanzando", arreglado, 17);

console.log("\n=== 5 - toma completa con 4 cortes ===");
s = new Seguidor(GUION);
var tandas = [
  "Hoy te voy a mostrar",
  "la unica cosa que nunca",
  "tienes que subirle a una inteligencia artificial",
  "porque queda guardada aunque tu borres el chat"
];
for(var i=0;i<tandas.length;i++){ s.oir(tandas[i]); s.seCorto(); }
esto("llega al final del guion", s.puntero, TOTAL);

console.log("\n=== 6 - casos borde ===");
s = new Seguidor(GUION);
esto("no oyo nada", s.oir(""), 0);
esto("solo ruido", s.oir("mmm eh aaa"), 0);
s = new Seguidor("");
esto("guion vacio no revienta", s.oir("hola"), 0);
s = new Seguidor("   ");
esto("guion de puros espacios no revienta", s.oir("hola que tal"), 0);

console.log("\n" + (fallos ? "FALLAN " + fallos + " de " + pruebas
                            : "PASAN las " + pruebas + " pruebas") + "\n");
process.exit(fallos ? 1 : 0);
