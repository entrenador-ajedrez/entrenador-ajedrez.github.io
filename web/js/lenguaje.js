// Textos en lenguaje claro: nombres de aperturas en español y evaluación en palabras.

// ------------------------------------------------------------------ aperturas
// chess.com da los nombres en inglés y sin apóstrofes ("Queens Gambit", "Kings Indian Defense").
const FRASES = [
  ["Kings Pawn Opening", "Apertura de Peón de Rey"], ["Queens Pawn Opening", "Apertura de Peón de Dama"],
  ["Queens Gambit Declined", "Gambito de Dama Rehusado"], ["Queens Gambit Accepted", "Gambito de Dama Aceptado"],
  ["Queens Gambit", "Gambito de Dama"], ["Kings Gambit Accepted", "Gambito de Rey Aceptado"],
  ["Kings Gambit Declined", "Gambito de Rey Rehusado"], ["Kings Gambit", "Gambito de Rey"],
  ["Kings Indian Defense", "Defensa India de Rey"], ["Queens Indian Defense", "Defensa India de Dama"],
  ["Kings Indian Attack", "Ataque Indio de Rey"], ["Old Indian Defense", "Defensa India Antigua"],
  ["Nimzo Indian Defense", "Defensa Nimzoindia"], ["Bogo Indian Defense", "Defensa Bogoindia"],
  ["Ruy Lopez Opening", "Apertura Española (Ruy López)"], ["Ruy Lopez", "Apertura Española (Ruy López)"],
  ["Italian Game", "Apertura Italiana"], ["Vienna Game", "Apertura Vienesa"], ["Scotch Game", "Apertura Escocesa"],
  ["Russian Game", "Defensa Petrov (Rusa)"], ["Petrovs Defense", "Defensa Petrov"],
  ["Four Knights Game", "Apertura de los Cuatro Caballos"], ["Three Knights Game", "Apertura de los Tres Caballos"],
  ["Bishops Opening", "Apertura del Alfil"], ["Center Game", "Apertura del Centro"],
  ["Sicilian Defense", "Defensa Siciliana"], ["French Defense", "Defensa Francesa"],
  ["Caro Kann Defense", "Defensa Caro-Kann"], ["Scandinavian Defense", "Defensa Escandinava"],
  ["Alekhines Defense", "Defensa Alekhine"], ["Dutch Defense", "Defensa Holandesa"],
  ["English Opening", "Apertura Inglesa"], ["Reti Opening", "Apertura Réti"], ["London System", "Sistema Londres"],
  ["Slav Defense", "Defensa Eslava"], ["Semi Slav Defense", "Defensa Semieslava"],
  ["Grunfeld Defense", "Defensa Grünfeld"], ["Benoni Defense", "Defensa Benoni"], ["Catalan Opening", "Apertura Catalana"],
  ["Trompowsky Attack", "Ataque Trompowsky"], ["Colle System", "Sistema Colle"], ["Birds Opening", "Apertura Bird"],
  ["Bird Opening", "Apertura Bird"], ["Zukertort Opening", "Apertura Zukertort"], ["Budapest Defense", "Defensa Budapest"],
  ["Danish Gambit", "Gambito Danés"], ["Latvian Gambit", "Gambito Letón"], ["Philidor Defense", "Defensa Philidor"],
  ["Modern Defense", "Defensa Moderna"], ["Pirc Defense", "Defensa Pirc"], ["Nimzowitsch Defense", "Defensa Nimzowitsch"],
  ["Hungarian Opening", "Apertura Húngara"], ["Polish Opening", "Apertura Polaca"], ["Ponziani Opening", "Apertura Ponziani"],
  ["Elephant Gambit", "Gambito del Elefante"], ["Englund Gambit", "Gambito Englund"], ["Evans Gambit", "Gambito Evans"],
  ["Blackmar Diemer Gambit", "Gambito Blackmar-Diemer"], ["Horwitz Defense", "Defensa Horwitz"], ["Owen Defense", "Defensa Owen"],
  ["Saint George Defense", "Defensa San Jorge"], ["Giuoco Piano", "Giuoco Piano (Italiana)"],
];
const PALABRAS = {
  Defense: "Defensa", Opening: "Apertura", Game: "Juego", Gambit: "Gambito", Attack: "Ataque", System: "Sistema",
  Accepted: "Aceptado", Declined: "Rehusado", Countergambit: "Contragambito", Defence: "Defensa",
  Exchange: "Cambio", Advance: "Avance", Classical: "Clásica", Modern: "Moderna", Closed: "Cerrada", Open: "Abierta",
  Accelerated: "Acelerada", Knight: "Caballo", Knights: "Caballos", Four: "Cuatro", Three: "Tres", Normal: "Normal",
  Standard: "Estándar", Short: "Corta", Invitation: "Invitación", Main: "Principal", Fianchetto: "Fianchetto",
  Undefined: "desconocida", Improved: "Mejorada", Quiet: "Tranquila", Pin: "Clavada",
};
// Palabras de relleno que sobran al final o en medio ("Cambio Variante", "with").
const SOBRAN = new Set(["Variation", "Variations", "with", "Line"]);
const CABEZAS = new Set(["Defense", "Defence", "Opening", "Game", "Gambit", "Attack", "System"]);

/** Nombre de apertura en español. Si no hay traducción, se deja el original. */
export function aperturaEs(nombre) {
  if (!nombre) return "";
  if (nombre === "Desconocida" || nombre === "Undefined") return "Apertura desconocida";
  const bajo = nombre.toLowerCase();
  for (const [en, es] of FRASES) {
    if (bajo.startsWith(en.toLowerCase())) {
      const resto = nombre.slice(en.length).trim();
      return resto ? `${es} ${traducirResto(resto)}`.trim() : es;
    }
  }
  const p = nombre.split(" ");
  const i = p.findIndex((w) => CABEZAS.has(w));
  if (i > 0 && i === p.length - 1) return `${PALABRAS[p[i]]} ${p.slice(0, i).join(" ")}`;  // "Foo Defense" -> "Defensa Foo"
  return nombre;
}
const traducirResto = (t) => {
  const palabras = t.split(" ").filter((w) => !SOBRAN.has(w)).map((w) => PALABRAS[w] || w);
  return palabras.length ? "· " + palabras.join(" ") : "";
};

// ------------------------------------------------------------------ evaluación en palabras
const peones = (n) => (n === 1 ? "1 peón" : `${n} peones`);

/**
 * Qué dice el número del motor, en lenguaje de persona. cp en centipeones desde el punto de vista de las blancas.
 * Devuelve una frase corta: «las negras ganan por más de 3 peones».
 */
export function evalPalabras(cp, mate) {
  if (mate === 0) return "jaque mate";
  if (mate != null) return `${mate > 0 ? "las blancas dan" : "las negras dan"} mate en ${Math.abs(mate)}`;
  const quien = cp >= 0 ? "las blancas" : "las negras";
  const p = Math.abs(cp) / 100;
  if (p < 0.3) return "la partida está igualada";
  if (p < 0.8) return `ligera ventaja de ${quien}`;
  if (p < 1) return `${quien} están algo mejor (ventaja de casi 1 peón)`;
  if (p < 1.5) return `${quien} están mejor (ventaja de más de 1 peón)`;
  if (p < 3) return `ventaja clara de ${quien}: más de ${peones(Math.floor(p))}`;
  if (p < 9) return `${quien} ganan por más de ${peones(Math.floor(p))}`;
  return `${quien} tienen la partida ganada`;
}
