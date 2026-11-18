// Página "Entrenar": aperturas de tu repertorio y finales básicos.
//
// APERTURAS: primero juegas las jugadas que definen la apertura (si te equivocas, te lo dice).
//   Después, juego libre: el rival elige entre las mejores jugadas y Stockfish corrige cada
//   jugada tuya. Termina al llegar a la jugada 10.
// FINALES: posición fija contra Stockfish a máxima fuerza, con un objetivo:
//   dar mate, coronar el peón o conseguir tablas.

const UMBRAL_ERROR = 10;        // puntos de prob. de ganar: a partir de aquí, "error"
const UMBRAL_IMPRECISION = 5;
const OBJETIVOS = {
  mate: "Objetivo: dar jaque mate.",
  coronar: "Objetivo: coronar el peón (convertirlo en dama).",
  tablas: "Objetivo: conseguir tablas. Stockfish intentará ganarte.",
};

let datos = null;       // { aperturas, finales, jugadas_apertura }
let modo = "apertura";  // apertura | final
let def = null;         // la apertura o el final elegido
let juego = null, tablero = null, miColor = "w";
let pensando = false, enPausa = false, terminado = false;
let paso = 0;           // en aperturas: cuántas jugadas de la secuencia se han jugado
let cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };

// ---------------------------------------------------------------- lista
function pintarLista() {
  $id("tab-aperturas").classList.toggle("activa", modo === "apertura");
  $id("tab-finales").classList.toggle("activa", modo === "final");
  $id("sesion").classList.add("oculto");
  $id("lista").classList.remove("oculto");
  const lista = modo === "apertura" ? datos.aperturas : datos.finales;
  $id("lista").innerHTML = lista.map((d, i) => {
    const hecho = d.progreso?.aciertos ? `<span class="hecho">✔ superado ${d.progreso.aciertos}×</span>` : "";
    let sub;
    if (modo === "apertura") {
      const t = d.tus_partidas;
      const stats = t.partidas
        ? `En tus partidas: ${t.partidas} jugadas, ${Math.round((100 * t.victorias) / t.partidas)}% de victorias`
        : "Aún no la has jugado";
      sub = `Con ${d.color === "w" ? "blancas" : "negras"} · ${linea(d.secuencia)} · ${stats}`;
    } else {
      sub = `${d.nivel} · ${OBJETIVOS[d.objetivo]}`;
    }
    return `<button class="entreno" data-i="${i}"><b>${d.nombre}</b> ${hecho}<br><span class="suave">${sub}</span></button>`;
  }).join("");
}

function linea(secuencia) {
  return secuencia.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(" ");
}

// ---------------------------------------------------------------- sesión
function empezar(d) {
  def = d;
  $id("lista").classList.add("oculto");
  $id("sesion").classList.remove("oculto");
  $id("titulo").textContent = d.nombre;
  $id("ideas").innerHTML = d.ideas.map((t) => `<li>${t}</li>`).join("");
  miColor = d.color;
  juego = new Chess(modo === "final" ? d.fen : undefined);
  paso = 0;
  cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };
  terminado = false;
  pensando = false;
  ocultarAviso();
  tablero.orientation(miColor === "w" ? "white" : "black");
  tablero.position(juego.fen(), false);
  limpiarMarcas();
  if (modo === "apertura") {
    $id("objetivo").textContent = `Juegas con ${miColor === "w" ? "blancas" : "negras"}. Línea: ${linea(d.secuencia)}`;
    mensaje("Empieza jugando la línea de la apertura.", "");
  } else {
    let obj = OBJETIVOS[d.objetivo];
    if (d.referencia) obj += ` Un buen jugador lo consigue en unas ${d.referencia} jugadas.`;
    $id("objetivo").textContent = `Juegas con ${miColor === "w" ? "blancas" : "negras"}. ${obj}`;
    mensaje("", "");
  }
  actualizar();
  siguienteTurno();
}

function enSecuencia() {
  return modo === "apertura" && paso < def.secuencia.length;
}

// Decide qué pasa después de cada jugada.
function siguienteTurno() {
  actualizar();
  if (terminado || comprobarFin()) return;
  if (juego.turn() === miColor) return; // te toca
  if (enSecuencia()) {
    // El rival juega la jugada de la línea (con una pequeña pausa para que se vea).
    setTimeout(() => {
      const m = juego.move(def.secuencia[paso]);
      paso += 1;
      tablero.position(juego.fen());
      limpiarMarcas();
      marcar(m.from + m.to, "marca-jugada");
      siguienteTurno();
    }, 400);
  } else {
    turnoRival();
  }
}

async function turnoRival() {
  pensando = true;
  actualizar();
  const fen = juego.fen();
  const r = modo === "apertura"
    ? await api("/api/rival_apertura", { fen })
    : await api("/api/motor", { fen, nivel: 0 });
  if (fen !== juego.fen()) return; // has reiniciado mientras pensaba
  juego.move({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), promotion: r.uci[4] || "q" });
  tablero.position(juego.fen());
  limpiarMarcas();
  marcar(r.uci, "marca-jugada");
  pensando = false;
  siguienteTurno();
}

// ---------------------------------------------------------------- tus jugadas
function alEmpezarArrastre(origen, pieza) {
  return !pensando && !enPausa && !terminado && juego.turn() === miColor && pieza[0] === miColor;
}

function alSoltar(origen, destino) {
  const fenAntes = juego.fen();
  const m = juego.move({ from: origen, to: destino, promotion: "q" });
  if (m === null) return "snapback";

  if (enSecuencia()) {
    const esperada = def.secuencia[paso];
    if (m.san !== esperada) {
      juego.undo();
      mensaje(`En la ${def.nombre} aquí se juega <b>${esperada}</b>. ¡Prueba otra vez!`, "aviso");
      return "snapback";
    }
    paso += 1;
    mensaje(paso >= def.secuencia.length
      ? "✔ Línea completada. Ahora juega libre: Stockfish corregirá cada jugada."
      : "✔ Correcto.", "bien");
    limpiarMarcas();
    marcar(m.from + m.to, "marca-jugada");
    setTimeout(siguienteTurno, 0);
    return;
  }
  corregir(fenAntes, m);
}

function alTerminarAnimacion() {
  tablero.position(juego.fen());
}

async function corregir(fenAntes, m) {
  limpiarMarcas();
  marcar(m.from + m.to, "marca-jugada");
  if (comprobarFin()) return actualizar();
  pensando = true;
  actualizar();
  const r = await api("/api/comprobar", { fen: fenAntes, uci: m.from + m.to + (m.promotion || "") });
  pensando = false;
  const limite = modo === "apertura" ? UMBRAL_ERROR : 15;
  if (r.perdida >= limite) {
    cuenta.errores += 1;
    enPausa = true;
    mensaje(
      `✘ <b>${m.san}</b> es un error: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar. ` +
      `Lo mejor era <b class="txt-bien">${r.linea_san[0]}</b>. ¿Deshaces y pruebas otra?`, "mal");
    $id("aviso-botones").classList.remove("oculto");
    actualizar();
    return;
  }
  if (modo === "apertura") {
    if (r.perdida >= UMBRAL_IMPRECISION) {
      cuenta.imprecisiones += 1;
      mensaje(`<b>${m.san}</b> es una imprecisión (−${r.perdida.toFixed(0)}). Mejor era <b>${r.linea_san[0]}</b>.`, "aviso");
    } else {
      cuenta.buenas += 1;
      mensaje(r.es_la_mejor ? `✔ <b>${m.san}</b>: ¡la mejor jugada!` : `✔ <b>${m.san}</b>: buena jugada.`, "bien");
    }
  } else {
    mensaje("", "");
  }
  siguienteTurno();
}

function ocultarAviso() {
  enPausa = false;
  $id("aviso-botones").classList.add("oculto");
}

// ---------------------------------------------------------------- final de la sesión
function misJugadas() {
  return juego.history({ verbose: true }).filter((m) => m.color === miColor);
}

function comprobarFin() {
  if (terminado) return true;
  if (modo === "apertura") {
    if (juego.history().length >= 2 * datos.jugadas_apertura && juego.turn() === miColor) {
      terminar(cuenta.errores === 0,
        `Apertura completada: ${cuenta.buenas} jugadas buenas, ${cuenta.imprecisiones} imprecisiones y ` +
        `${cuenta.errores} errores.` + (cuenta.errores === 0 ? " ¡Superada!" : " Repítela hasta hacerla sin errores."));
      return true;
    }
    return false;
  }
  // Finales
  const hist = juego.history({ verbose: true });
  const ultima = hist[hist.length - 1];
  const n = misJugadas().length;
  if (def.objetivo === "mate") {
    if (juego.in_checkmate()) {
      terminar(juego.turn() !== miColor, juego.turn() !== miColor ? `¡Mate en ${n} jugadas!` : "Te han dado mate.");
      return true;
    }
    if (juego.in_draw()) { terminar(false, "Tablas: se ha escapado la victoria (¿ahogado?). Prueba otra vez."); return true; }
  }
  if (def.objetivo === "coronar") {
    if (ultima && ultima.color === miColor && ultima.promotion) {
      if (juego.in_draw()) { terminar(false, "Has coronado, pero es ahogado: tablas. ¡Mira las casillas del rey!"); return true; }
      terminar(true, `¡Peón coronado en ${n} jugadas!`);
      return true;
    }
    if (juego.in_draw()) { terminar(false, "Tablas: el peón se ha perdido o es ahogado. Prueba otra vez."); return true; }
  }
  if (def.objetivo === "tablas") {
    if (juego.in_draw()) { terminar(true, `¡Tablas conseguidas en ${n} jugadas!`); return true; }
    if (ultima && ultima.color !== miColor && ultima.promotion) {
      terminar(false, "El rival ha coronado. Ponte delante del peón y busca la oposición.");
      return true;
    }
  }
  return false;
}

async function terminar(exito, texto) {
  terminado = true;
  ocultarAviso();
  mensaje((exito ? "🏆 " : "✘ ") + texto, exito ? "bien" : "mal");
  actualizar();
  await api("/api/progreso", { id: `${modo}-${def.id}`, acierto: exito });
  def.progreso = (await api("/api/entrenamiento"))[modo === "apertura" ? "aperturas" : "finales"]
    .find((d) => d.id === def.id).progreso;
}

// ---------------------------------------------------------------- ayudas
function actualizar() {
  const hist = juego.history();
  // Numeración desde la posición de partida
  const g = new Chess(modo === "final" ? def.fen : undefined);
  let texto = "";
  for (const san of hist) {
    const [, color, , , , num] = g.fen().split(" ");
    if (color === "w") texto += `${num}. `;
    else if (texto === "") texto += `${num}… `;
    texto += san + " ";
    g.move(san);
  }
  let estado = "";
  if (terminado) estado = "";
  else if (pensando) estado = "Pensando…";
  else if (juego.turn() === miColor) estado = "Te toca.";
  $id("jugadas-texto").textContent = (texto || "Aún no hay jugadas.") + (estado ? `  — ${estado}` : "");
}

function deshacer() {
  if (pensando || juego.history().length === 0) return;
  ocultarAviso();
  terminado = false;
  if (juego.turn() === miColor) juego.undo();
  juego.undo();
  // En aperturas, si deshacemos dentro de la línea, retrocede también el contador.
  if (modo === "apertura") paso = Math.min(paso, juego.history().length);
  tablero.position(juego.fen());
  limpiarMarcas();
  mensaje("Jugada deshecha.", "aviso");
  siguienteTurno();
}

async function pista() {
  if (pensando || enPausa || terminado || juego.turn() !== miColor) return;
  if (enSecuencia()) {
    mensaje(`En esta apertura se juega <b>${def.secuencia[paso]}</b>.`, "aviso");
    return;
  }
  const r = await api("/api/solucion", { fen: juego.fen() });
  limpiarMarcas();
  const origen = r.linea_uci[0].slice(0, 2);
  document.querySelectorAll(`#tablero .square-${origen}`).forEach((el) => el.classList.add("marca-buena"));
  mensaje("💡 Pista: mueve la pieza marcada en verde.", "aviso");
}

function mensaje(texto, clase) {
  $id("mensaje").innerHTML = texto;
  $id("mensaje").className = "mensaje " + (clase || "");
}

// ---------------------------------------------------------------- arranque
async function iniciar() {
  tablero = Chessboard("tablero", {
    draggable: true,
    pieceTheme: PIEZAS,
    position: "start",
    onDragStart: alEmpezarArrastre,
    onDrop: alSoltar,
    onSnapEnd: alTerminarAnimacion,
  });
  window.addEventListener("resize", () => tablero.resize());

  datos = await api("/api/entrenamiento");
  $id("tab-aperturas").onclick = () => { modo = "apertura"; pintarLista(); };
  $id("tab-finales").onclick = () => { modo = "final"; pintarLista(); };
  $id("lista").onclick = (ev) => {
    const b = ev.target.closest("button[data-i]");
    if (b) empezar((modo === "apertura" ? datos.aperturas : datos.finales)[Number(b.dataset.i)]);
  };
  $id("btn-reiniciar").onclick = () => empezar(def);
  $id("btn-volver").onclick = async () => {
    datos = await api("/api/entrenamiento"); // para ver los ✔ actualizados
    pintarLista();
  };
  $id("btn-deshacer").onclick = deshacer;
  $id("btn-deshacer-aviso").onclick = deshacer;
  $id("btn-seguir").onclick = () => { ocultarAviso(); mensaje("", ""); siguienteTurno(); };
  $id("btn-pista").onclick = pista;
  pintarLista();
}

iniciar();
