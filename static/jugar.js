// Página "Jugar": partida contra Stockfish, desde el inicio o desde cualquier posición.
//   /jugar                         -> partida normal
//   /jugar?fen=...&color=w|b       -> empezar desde esa posición jugando con ese color

const INICIO = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const UMBRAL_AVISO = 15; // puntos de probabilidad de ganar (= blunder)

let juego = null;      // reglas (chess.js)
let tablero = null;    // dibujo (chessboard.js)
let miColor = "w";
let fenInicial = INICIO;
let pensando = false;  // Stockfish está pensando o estamos comprobando tu jugada
let enPausa = false;   // esperando a que decidas tras un aviso de blunder

// ---------------------------------------------------------------- partida
function nuevaPartida(fen, color) {
  fenInicial = fen || INICIO;
  miColor = color || $id("color").value;
  $id("color").value = miColor;
  juego = new Chess(fenInicial);
  tablero.orientation(miColor === "w" ? "white" : "black");
  $id("barra").classList.toggle("girada", miColor === "b");
  tablero.position(fenInicial, false);
  limpiarMarcas();
  ocultarAviso();
  mensaje("", "");
  pensando = false;
  actualizar();
  if (juego.turn() !== miColor) turnoMotor();
}

function actualizar() {
  // Texto de estado
  let estado;
  if (juego.game_over()) estado = textoFinal();
  else if (pensando) estado = "Stockfish está pensando…";
  else estado = juego.turn() === miColor ? "Te toca." : "Turno de Stockfish.";
  if (!juego.game_over() && juego.in_check()) estado += " ¡Jaque!";
  $id("estado").textContent = estado;

  // Lista de jugadas
  const hist = juego.history();
  const partes = fenInicial.split(" ");
  let n = Number(partes[5]);
  let blancas = partes[1] === "w";
  let texto = "";
  hist.forEach((san, i) => {
    if (blancas) texto += `${n}. `;
    else if (i === 0) texto += `${n}… `;
    texto += san + " ";
    if (!blancas) n += 1;
    blancas = !blancas;
  });
  $id("jugadas-texto").textContent = texto || "Aún no hay jugadas.";

  if ($id("mostrar-eval").checked) actualizarBarra();
}

function textoFinal() {
  if (juego.in_checkmate()) return juego.turn() === miColor ? "Jaque mate. Gana Stockfish." : "¡Jaque mate! ¡Has ganado!";
  if (juego.in_stalemate()) return "Tablas por ahogado.";
  if (juego.in_threefold_repetition()) return "Tablas por triple repetición.";
  if (juego.insufficient_material()) return "Tablas por material insuficiente.";
  return "Tablas.";
}

async function actualizarBarra() {
  const fen = juego.fen();
  const r = await api("/api/evaluar", { fen });
  if (fen !== juego.fen()) return; // la posición cambió mientras tanto
  $id("barra-blanca").style.height = probGanar(r.eval).toFixed(1) + "%";
  $id("barra").title = "Evaluación: " + r.texto;
}

function mensaje(texto, clase) {
  $id("mensaje").innerHTML = texto;
  $id("mensaje").className = "mensaje " + (clase || "");
}

// ---------------------------------------------------------------- tus jugadas
function alEmpezarArrastre(origen, pieza) {
  return !pensando && !enPausa && !juego.game_over() && juego.turn() === miColor && pieza[0] === miColor;
}

function alSoltar(origen, destino) {
  const fenAntes = juego.fen();
  const jugada = juego.move({ from: origen, to: destino, promotion: "q" });
  if (jugada === null) return "snapback";
  trasTuJugada(fenAntes, jugada);
}

function alTerminarAnimacion() {
  tablero.position(juego.fen());
}

async function trasTuJugada(fenAntes, jugada) {
  limpiarMarcas();
  marcar(jugada.from + jugada.to, "marca-jugada");
  mensaje("", "");
  if (juego.game_over()) return actualizar();

  if ($id("avisar").checked) {
    pensando = true;
    actualizar();
    $id("estado").textContent = "Comprobando tu jugada…";
    const r = await api("/api/comprobar", { fen: fenAntes, uci: jugada.from + jugada.to + (jugada.promotion || "") });
    pensando = false;
    if (r.perdida >= UMBRAL_AVISO) {
      enPausa = true;
      actualizar();
      mensaje(
        `⚠ <b>${jugada.san}</b> parece un <b>blunder</b>: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad ` +
        `de ganar (evaluación ${r.tu_eval}). Mira qué puede hacer el rival ahora. ¿Quieres deshacerla?`,
        "mal"
      );
      $id("aviso-botones").classList.remove("oculto");
      return;
    }
  }
  turnoMotor();
}

function ocultarAviso() {
  enPausa = false;
  $id("aviso-botones").classList.add("oculto");
}

// ---------------------------------------------------------------- Stockfish
async function turnoMotor() {
  if (juego.game_over()) return actualizar();
  pensando = true;
  actualizar();
  const fen = juego.fen();
  let r;
  try {
    r = await api("/api/motor", { fen, nivel: Number($id("nivel").value) });
  } catch (err) {
    pensando = false;
    mensaje("Error al pedir la jugada a Stockfish: " + err.message, "mal");
    return;
  }
  if (fen !== juego.fen()) return; // empezaste otra partida mientras pensaba
  juego.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] || "q" });
  tablero.position(juego.fen());
  limpiarMarcas();
  marcar(r.uci, "marca-jugada");
  pensando = false;
  actualizar();
}

// ---------------------------------------------------------------- ayudas
function deshacer() {
  if (pensando) return;
  ocultarAviso();
  // Deshacemos hasta volver a una posición en la que te toque, quitando tu última jugada.
  if (juego.history().length === 0) return;
  if (juego.turn() === miColor) juego.undo(); // la jugada de Stockfish
  juego.undo();                                // la tuya
  tablero.position(juego.fen());
  limpiarMarcas();
  mensaje("Jugada deshecha. Piensa con calma: jaques, capturas y amenazas.", "aviso");
  actualizar();
  if (!juego.game_over() && juego.turn() !== miColor) turnoMotor();
}

async function pista() {
  if (pensando || enPausa || juego.game_over() || juego.turn() !== miColor) return;
  const r = await api("/api/solucion", { fen: juego.fen() });
  limpiarMarcas();
  const origen = r.linea_uci[0].slice(0, 2);
  document.querySelectorAll(`#tablero .square-${origen}`).forEach((el) => el.classList.add("marca-buena"));
  mensaje("💡 Pista: la mejor jugada mueve la pieza marcada en verde.", "aviso");
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

  const { niveles } = await api("/api/niveles");
  $id("nivel").innerHTML = niveles.map((n) => `<option value="${n.id}">${n.nombre}</option>`).join("");
  $id("nivel").value = "3";

  $id("btn-nueva").onclick = () => nuevaPartida(INICIO, $id("color").value);
  $id("btn-deshacer").onclick = deshacer;
  $id("btn-deshacer-aviso").onclick = deshacer;
  $id("btn-seguir").onclick = () => { ocultarAviso(); mensaje("", ""); turnoMotor(); };
  $id("btn-pista").onclick = pista;
  $id("btn-girar").onclick = () => tablero.flip();
  $id("mostrar-eval").onchange = () => {
    $id("barra").classList.toggle("oculto", !$id("mostrar-eval").checked);
    if ($id("mostrar-eval").checked) actualizarBarra();
  };
  $id("barra").classList.add("oculto");

  // ¿Venimos de un ejercicio o de una partida? Entonces empezamos desde esa posición.
  const params = new URLSearchParams(location.search);
  const fen = params.get("fen");
  if (fen) {
    const color = params.get("color") || fen.split(" ")[1];
    $id("cabecera").textContent = "Partida desde una posición de tus partidas. Intenta jugarla mejor que la primera vez.";
    nuevaPartida(fen, color);
  } else {
    nuevaPartida(INICIO, "w");
  }
}

iniciar();
