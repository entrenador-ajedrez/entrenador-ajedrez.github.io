// Página "Mis partidas": lista de partidas y revisión jugada a jugada.

const RESULTADO = { victoria: "Victoria", derrota: "Derrota", tablas: "Tablas" };
const MOTIVO = {
  timeout: "por tiempo", checkmated: "por mate", resigned: "por abandono",
  abandoned: "por desconexión", agreed: "de mutuo acuerdo", repetition: "por repetición",
  stalemate: "por ahogado", insufficient: "por material insuficiente",
};
const SIMBOLO = { blunder: "??", error: "?", imprecision: "?!" };
const NOMBRE = { blunder: "blunder", error: "error", imprecision: "imprecisión" };

let partidas = [];    // lista que manda el servidor
let revision = null;  // partida abierta: { partida, fen_inicial, eval_inicial, jugadas: [...] }
let ply = 0;          // media jugada que se ve en el tablero (0 = posición inicial)
let tablero = null;

// ---------------------------------------------------------------- lista
function pintarLista() {
  const res = $id("filtro-resultado").value;
  const col = $id("filtro-color").value;
  const visibles = partidas.filter((p) => (!res || p.resultado === res) && (!col || p.color === col));
  $id("filas").innerHTML = visibles.map((p) => `
    <tr data-id="${p.id}" class="fila-${p.resultado}">
      <td>${p.fecha}</td>
      <td>${p.rival} <span class="suave">(${p.elo_rival ?? "?"})</span></td>
      <td>${p.color === "blancas" ? "⚪ Blancas" : "⚫ Negras"}</td>
      <td class="res">${RESULTADO[p.resultado]} <span class="suave">${MOTIVO[p.motivo] || ""}</span></td>
      <td>${p.apertura}</td>
      <td>${p.blunders}</td>
    </tr>`).join("");
  const v = partidas.filter((p) => p.resultado === "victoria").length;
  $id("cabecera").textContent =
    `${partidas.length} partidas · ${v} victorias · haz clic en una para revisarla jugada a jugada`;
}

function mostrarLista() {
  $id("vista-partida").classList.add("oculto");
  $id("vista-lista").classList.remove("oculto");
  revision = null;
  pintarLista();
}

// ---------------------------------------------------------------- partida
async function abrir(id) {
  $id("vista-lista").classList.add("oculto");
  $id("vista-partida").classList.remove("oculto");
  tablero.resize(); // el tablero estaba oculto: hay que recalcular su tamaño
  $id("cabecera").textContent = "Analizando la partida con Stockfish… (la primera vez tarda unos segundos)";
  $id("jugadas").innerHTML = "";
  $id("comentario").innerHTML = "";
  try {
    revision = await api(`/api/partida/${id}`);
  } catch (err) {
    $id("cabecera").textContent = "No se pudo cargar la partida: " + err.message;
    return;
  }
  const p = revision.partida;
  $id("cabecera").textContent = "Usa ← → del teclado para moverte por la partida.";
  $id("titulo-partida").textContent = `${RESULTADO[p.resultado]} ${MOTIVO[p.motivo] || ""} vs ${p.rival} (${p.elo_rival ?? "?"})`;
  $id("datos-partida").innerHTML =
    `${p.fecha} · Con ${p.color} · ${p.apertura} · <a href="${p.url}" target="_blank" rel="noopener">ver en chess.com</a>`;

  // Recuento de errores de cada jugador
  const mias = revision.jugadas.filter((_, i) => esMia(i + 1));
  const suyas = revision.jugadas.filter((_, i) => !esMia(i + 1));
  const contar = (js) => ["blunder", "error", "imprecision"]
    .map((c) => `${js.filter((j) => j.clase === c).length} ${NOMBRE[c]}${c === "error" ? "es" : "s"}`).join(", ");
  $id("recuento").innerHTML = `<b>Tú:</b> ${contar(mias)}<br><b>Rival:</b> ${contar(suyas)}`;

  tablero.orientation(p.color === "blancas" ? "white" : "black");
  $id("barra").classList.toggle("girada", p.color === "negras");
  pintarJugadas();
  pintarGrafica();
  irA(0);
}

// La media jugada número n (1, 2, 3…) la hacen las blancas si n es impar.
function esDeBlancas(n) { return n % 2 === 1; }
function esMia(n) { return esDeBlancas(n) === (revision.partida.color === "blancas"); }
function numero(n) { return Math.floor((n - 1) / 2) + 1; }

function pintarJugadas() {
  let html = "";
  revision.jugadas.forEach((j, i) => {
    const n = i + 1;
    if (esDeBlancas(n)) html += `<span class="num">${numero(n)}.</span>`;
    else if (n === 1) html += `<span class="num">1.</span><span></span>`;
    const clase = j.clase ? `c-${j.clase}` : "";
    html += `<span class="jug ${clase} ${esMia(n) ? "mia" : ""}" data-n="${n}">${j.san}${SIMBOLO[j.clase] || ""}</span>`;
  });
  $id("jugadas").innerHTML = html;
}

function pintarGrafica() {
  const js = revision.jugadas;
  const total = Math.max(js.length, 1);
  const x = (n) => (n / total) * 600;
  const y = (cp) => 120 - probGanar(cp) * 1.2;
  let puntos = `0,${y(revision.eval_inicial)} `;
  js.forEach((j, i) => { puntos += `${x(i + 1)},${y(j.eval)} `; });
  const rayas = js.map((j, i) => (j.clase === "blunder" && esMia(i + 1))
    ? `<line x1="${x(i + 1)}" x2="${x(i + 1)}" y1="0" y2="120" class="raya-blunder"/>` : "").join("");
  $id("grafica").innerHTML = `
    <rect x="0" y="0" width="600" height="120" class="fondo-negras"/>
    <polygon points="0,120 ${puntos} 600,120" class="area-blancas"/>
    <line x1="0" x2="600" y1="60" y2="60" class="linea-media"/>
    ${rayas}
    <line id="cursor" x1="0" x2="0" y1="0" y2="120" class="cursor"/>`;
}

function irA(n) {
  if (!revision) return;
  ply = Math.max(0, Math.min(n, revision.jugadas.length));
  const j = ply > 0 ? revision.jugadas[ply - 1] : null;
  tablero.position(j ? j.fen : revision.fen_inicial, false);

  // Barra de evaluación: cuánto "llena" el blanco.
  const cp = j ? j.eval : revision.eval_inicial;
  $id("barra-blanca").style.height = probGanar(cp).toFixed(1) + "%";
  $id("barra").title = j ? j.eval_texto : "0.0";

  // Marcas en el tablero: la jugada hecha y, si fue un fallo, la mejor.
  limpiarMarcas();
  if (j) {
    marcar(j.uci, j.clase === "blunder" || j.clase === "error" ? "marca-mala" : "marca-jugada");
    if (j.mejor_uci) marcar(j.mejor_uci, "marca-buena");
  }

  // Lista de jugadas: resaltar la actual.
  document.querySelectorAll("#jugadas .actual").forEach((el) => el.classList.remove("actual"));
  const el = document.querySelector(`#jugadas [data-n="${ply}"]`);
  if (el) { el.classList.add("actual"); el.scrollIntoView({ block: "nearest" }); }

  // Cursor en la gráfica
  const cursor = $id("cursor");
  if (cursor) {
    const xx = (ply / Math.max(revision.jugadas.length, 1)) * 600;
    cursor.setAttribute("x1", xx); cursor.setAttribute("x2", xx);
  }
  comentar(j);
}

function comentar(j) {
  const c = $id("comentario");
  if (!j) { c.innerHTML = "Posición inicial. Avanza con ▶ o con la flecha →."; c.className = "tarjeta comentario"; return; }
  const quien = esMia(ply) ? "Tu jugada" : "Jugada del rival";
  const punto = esDeBlancas(ply) ? "." : "…";
  let texto = `<b>${numero(ply)}${punto} ${j.san}${SIMBOLO[j.clase] || ""}</b> — ${quien}. Evaluación: <b>${j.eval_texto}</b>`;
  if (j.reloj != null) texto += ` · reloj: ${Math.floor(j.reloj / 60)}:${String(Math.floor(j.reloj % 60)).padStart(2, "0")}`;
  if (j.clase) {
    texto += `<br>Es un <b>${NOMBRE[j.clase]}</b>: pierde ${j.perdida.toFixed(0)} puntos de probabilidad de ganar.`;
    if (j.mejor_san) texto += ` Lo mejor era <b class="txt-bien">${j.mejor_san}</b> (en verde).`;
    if (!esMia(ply) && j.clase === "blunder") texto += " ¿Lo aprovechaste en tu siguiente jugada?";
  }
  // Jugar contra Stockfish desde la posición de ANTES de esta jugada (para repetirla mejor).
  const fenAntes = ply > 1 ? revision.jugadas[ply - 2].fen : revision.fen_inicial;
  const miColor = revision.partida.color === "blancas" ? "w" : "b";
  texto += `<br><a class="boton" href="/jugar?fen=${encodeURIComponent(fenAntes)}&color=${miColor}">` +
           `♟ Jugar desde antes de esta jugada</a>`;
  c.innerHTML = texto;
  c.className = "tarjeta comentario " + (j.clase && esMia(ply) ? "c-" + j.clase : "");
}

function siguienteErrorMio() {
  for (let n = ply + 1; n <= revision.jugadas.length; n++) {
    const c = revision.jugadas[n - 1].clase;
    if (esMia(n) && (c === "blunder" || c === "error")) return irA(n);
  }
  $id("cabecera").textContent = "No hay más errores tuyos después de esta jugada.";
}

// ---------------------------------------------------------------- arranque
function ruta() {
  const id = location.hash.slice(1);
  if (id) abrir(id); else mostrarLista();
}

async function iniciar() {
  tablero = Chessboard("tablero", { draggable: false, pieceTheme: PIEZAS });
  window.addEventListener("resize", () => tablero.resize());

  $id("filtro-resultado").onchange = pintarLista;
  $id("filtro-color").onchange = pintarLista;
  $id("filas").onclick = (ev) => {
    const fila = ev.target.closest("tr[data-id]");
    if (fila) location.hash = fila.dataset.id;
  };
  $id("jugadas").onclick = (ev) => { if (ev.target.dataset.n) irA(Number(ev.target.dataset.n)); };
  $id("grafica").onclick = (ev) => {
    const r = $id("grafica").getBoundingClientRect();
    irA(Math.round(((ev.clientX - r.left) / r.width) * revision.jugadas.length));
  };
  document.querySelectorAll(".controles button").forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.paso;
      if (p === "error") return siguienteErrorMio();
      irA(p === "inicio" ? 0 : p === "fin" ? revision.jugadas.length : ply + Number(p));
    };
  });
  document.addEventListener("keydown", (ev) => {
    if (!revision) return;
    if (ev.key === "ArrowLeft") { irA(ply - 1); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { irA(ply + 1); ev.preventDefault(); }
  });
  window.addEventListener("hashchange", ruta);

  try {
    partidas = (await api("/api/partidas")).partidas;
  } catch (err) {
    $id("cabecera").textContent = "No se pudo conectar con el servidor: " + err.message;
    return;
  }
  ruta();
}

iniciar();
