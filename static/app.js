// Lógica de la página: muestra un error tuyo, te deja buscar la mejor jugada
// y pregunta al servidor (Stockfish) si es buena.

const TIPOS = {
  material: "En esta posición acabaste perdiendo material (una pieza colgada o un ataque doble).",
  mate_contra: "Cuidado: tu jugada en la partida permitió un mate. Mira las amenazas del rival.",
  mate_perdido: "Aquí tenías un mate. ¡Búscalo!",
  tactica: "Busca jugadas forzantes: jaques, capturas y amenazas, tuyas y del rival.",
};
const FASES = { apertura: "Apertura", "medio juego": "Medio juego", final: "Final" };

let ejercicios = [];   // todos los ejercicios que manda el servidor
let cola = [];         // los que quedan, en orden
let actual = null;     // ejercicio en pantalla
let juego = null;      // reglas del ajedrez (chess.js) para la posición actual
let tablero = null;    // el tablero dibujado (chessboard.js)
let estado = "pensando";        // pensando | comprobando | solucion
let progresoGuardado = false;   // solo cuenta el primer intento
let linea = null;      // { fens: [...], san: [...], paso: n }
// (api, marcar, limpiarMarcas y $id están en comun.js)

// ---------------------------------------------------------------- cola
function construirCola() {
  const fase = $id("filtro-fase").value;
  const tipo = $id("filtro-tipo").value;
  const gravedad = $id("filtro-gravedad").value;
  const prioridad = (e) => (!e.progreso ? 0 : e.progreso.ultimo === "fallo" ? 1 : 2);
  cola = ejercicios
    .filter((e) => (!fase || e.fase === fase) && (!tipo || e.tipo === tipo) && (!gravedad || e.gravedad === gravedad))
    .map((e) => ({ e, azar: Math.random() }))
    // primero los nuevos, luego los que fallaste, al final los que ya resolviste
    .sort((a, b) => prioridad(a.e) - prioridad(b.e) || a.azar - b.azar)
    .map((x) => x.e);
}

function actualizarEstadisticas() {
  const intentados = ejercicios.filter((e) => e.progreso);
  const resueltos = intentados.filter((e) => e.progreso.ultimo === "acierto");
  $id("estadisticas").textContent =
    `${ejercicios.length} ejercicios sacados de tus partidas · ${intentados.length} intentados · ` +
    `${resueltos.length} resueltos · ${cola.length} en la cola con estos filtros`;
}

// ---------------------------------------------------------------- ejercicio
function siguiente() {
  if (cola.length === 0) construirCola();
  actual = cola.shift();
  actualizarEstadisticas();
  limpiarMarcas();
  linea = null;
  $id("controles-linea").classList.add("oculto");
  $id("linea").innerHTML = "";
  $id("btn-reintentar").classList.add("oculto");
  $id("btn-pista").classList.remove("oculto");
  $id("btn-solucion").classList.remove("oculto");

  if (!actual) {
    $id("turno").textContent = "No hay ejercicios con estos filtros.";
    $id("contexto").textContent = "";
    mensaje("", "");
    return;
  }
  juego = new Chess(actual.fen);
  tablero.orientation(actual.color === "blancas" ? "white" : "black");
  tablero.position(actual.fen, false);
  estado = "pensando";
  progresoGuardado = false;

  const color = actual.color === "blancas" ? "blancas" : "negras";
  $id("turno").textContent = `Juegas con ${color}. ¿Cuál es la mejor jugada?`;
  const previo = actual.progreso
    ? ` · Lo has intentado ${actual.progreso.intentos} ${actual.progreso.intentos === 1 ? "vez" : "veces"}`
    : "";
  $id("contexto").innerHTML =
    `${FASES[actual.fase]} · ${actual.gravedad === "blunder" ? "Blunder" : "Error"} en la jugada ${actual.jugada} ` +
    `vs ${actual.rival} (${actual.fecha}) · <a href="/partidas#${actual.partida_id}">ver partida completa</a>${previo}`;
  mensaje("", "");
}

function mensaje(texto, clase) {
  const m = $id("mensaje");
  m.innerHTML = texto;
  m.className = "mensaje " + (clase || "");
}

async function guardarProgreso(acierto) {
  if (progresoGuardado) return;
  progresoGuardado = true;
  const r = await api("/api/progreso", { id: actual.id, acierto });
  actual.progreso = r.progreso;
  actualizarEstadisticas();
}

// ---------------------------------------------------------------- tablero
function alEmpezarArrastre(origen, pieza) {
  // Solo puedes mover tus piezas y solo mientras piensas.
  return estado === "pensando" && pieza[0] === juego.turn();
}

function alSoltar(origen, destino) {
  const jugada = juego.move({ from: origen, to: destino, promotion: "q" });
  if (jugada === null) return "snapback"; // jugada ilegal: la pieza vuelve
  comprobar(origen + destino + (jugada.promotion || ""), jugada.san);
}

function alTerminarAnimacion() {
  tablero.position(juego.fen());
}

async function comprobar(uci, san) {
  estado = "comprobando";
  mensaje("Stockfish está pensando…", "");
  let r;
  try {
    r = await api("/api/comprobar", { fen: actual.fen, uci });
  } catch (err) {
    mensaje(err.message, "mal");
    reintentar();
    return;
  }
  if (r.correcta) {
    guardarProgreso(true);
    const extra = r.es_la_mejor
      ? "Es exactamente la jugada de Stockfish."
      : `Stockfish prefería <b>${r.linea_san[0]}</b>, pero la tuya también es buena.`;
    mensaje(`✔ ¡Bien! <b>${san}</b> funciona. ${extra}`, "bien");
    mostrarSolucion(r);
  } else {
    guardarProgreso(false);
    mensaje(
      `✘ <b>${san}</b> no es lo mejor: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar ` +
      `(evaluación ${r.tu_eval} frente a ${r.mejor_eval}). Inténtalo otra vez o mira la solución.`,
      "mal"
    );
    estado = "fallado";
    $id("btn-reintentar").classList.remove("oculto");
  }
}

function reintentar() {
  juego = new Chess(actual.fen);
  tablero.position(actual.fen);
  limpiarMarcas();
  estado = "pensando";
  $id("btn-reintentar").classList.add("oculto");
}

async function verSolucion() {
  if (!actual || estado === "solucion" || estado === "comprobando") return;
  guardarProgreso(false);
  mensaje("Stockfish está pensando…", "");
  const r = await api("/api/solucion", { fen: actual.fen });
  mensaje("", "");
  mostrarSolucion(r);
}

// ---------------------------------------------------------------- solución
function mostrarSolucion(r) {
  estado = "solucion";
  $id("btn-reintentar").classList.add("oculto");
  $id("btn-pista").classList.add("oculto");
  $id("btn-solucion").classList.add("oculto");

  // Calculamos todas las posiciones de la línea para poder ir adelante y atrás.
  const g = new Chess(actual.fen);
  const fens = [actual.fen];
  for (const uci of r.linea_uci) {
    g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
    fens.push(g.fen());
  }
  linea = { fens, san: r.linea_san, uci: r.linea_uci, paso: 0 };

  const tuya = actual.tu_jugada;
  const previo = $id("mensaje").innerHTML;
  mensaje(
    (previo ? previo + "<br>" : "") +
    `En la partida jugaste <b style="color:var(--mal)">${tuya}</b> (perdiste ${actual.perdida.toFixed(0)} puntos). ` +
    `Lo mejor era <b style="color:var(--bien)">${r.linea_san[0] || "?"}</b> (evaluación ${r.mejor_eval}).` +
    `<br><a class="boton" href="/jugar?fen=${encodeURIComponent(actual.fen)}">♟ Jugar esta posición contra Stockfish</a>`,
    ""
  );
  $id("controles-linea").classList.remove("oculto");
  irAPaso(0);
}

function irAPaso(paso) {
  if (!linea) return;
  linea.paso = Math.max(0, Math.min(paso, linea.fens.length - 1));
  tablero.position(linea.fens[linea.paso]);
  limpiarMarcas();
  if (linea.paso === 0) {
    // En la posición inicial: rojo = lo que jugaste, verde = lo mejor.
    marcar(actual.tu_jugada_uci, "marca-mala");
    if (linea.uci[0]) marcar(linea.uci[0], "marca-buena");
  } else {
    marcar(linea.uci[linea.paso - 1], "marca-buena");
  }
  // Texto de la línea con la jugada actual resaltada.
  const color = actual.fen.split(" ")[1];
  let n = actual.jugada;
  const partes = linea.san.map((san, i) => {
    const turnoBlancas = (color === "w") === (i % 2 === 0);
    let prefijo = "";
    if (turnoBlancas) prefijo = `${n}. `;
    else if (i === 0) prefijo = `${n}… `;
    if (!turnoBlancas) n += 1;
    return `${prefijo}<span data-i="${i + 1}" class="${i + 1 === linea.paso ? "actual" : ""}">${san}</span>`;
  });
  $id("linea").innerHTML = "<b>Línea de Stockfish:</b> " + partes.join(" ");
}

// ---------------------------------------------------------------- arranque
async function iniciar() {
  tablero = Chessboard("tablero", {
    draggable: true,
    pieceTheme: PIEZAS,
    onDragStart: alEmpezarArrastre,
    onDrop: alSoltar,
    onSnapEnd: alTerminarAnimacion,
  });
  window.addEventListener("resize", () => tablero.resize());

  $id("btn-siguiente").onclick = siguiente;
  $id("btn-solucion").onclick = verSolucion;
  $id("btn-reintentar").onclick = reintentar;
  $id("btn-pista").onclick = () => mensaje("💡 " + (TIPOS[actual?.tipo] || ""), "aviso");
  for (const id of ["filtro-fase", "filtro-tipo", "filtro-gravedad"]) {
    $id(id).onchange = () => { construirCola(); siguiente(); };
  }
  document.querySelectorAll("#controles-linea button").forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.paso;
      irAPaso(p === "inicio" ? 0 : p === "fin" ? linea.fens.length - 1 : linea.paso + Number(p));
    };
  });
  $id("linea").onclick = (ev) => { if (ev.target.dataset.i) irAPaso(Number(ev.target.dataset.i)); };
  document.addEventListener("keydown", (ev) => {
    if (!linea) return;
    if (ev.key === "ArrowLeft") irAPaso(linea.paso - 1);
    if (ev.key === "ArrowRight") irAPaso(linea.paso + 1);
  });

  try {
    ejercicios = (await api("/api/ejercicios")).ejercicios;
  } catch (err) {
    $id("estadisticas").textContent = "No se pudo conectar con el servidor: " + err.message;
    return;
  }
  construirCola();
  siguiente();
}

iniciar();
