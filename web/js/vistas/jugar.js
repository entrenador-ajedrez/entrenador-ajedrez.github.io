// Jugar contra Stockfish, desde el inicio o desde cualquier posición:
//   #/jugar                    -> partida normal
//   #/jugar/<fen>/<color w|b>  -> desde esa posición (viene de Ejercicios o de una partida)
// Modo entrenador: si cometes un error grave, te avisa y te deja deshacerlo.

import { corregirJugada, textoEval } from "../analizador.js";
import { NIVELES } from "../datos-entrenamiento.js";
import { motor, probGanar } from "../motor.js";
import { Tablero, disposicion, fichaJugador, ponerBarra } from "../tablero.js";
import { chip, corta, usarTablero } from "../notacion.js";
import { $, Chess, esc } from "../util.js";

const INICIO = new Chess().fen();
const UMBRAL_AVISO = 15; // = blunder

export async function montar(vista, { parametros, estado }) {
  vista.innerHTML = disposicion("Jugar contra Stockfish");
  let juego = new Chess();
  let fenInicial = INICIO;
  let miColor = "w";
  let nivel = 3;
  let pensando = false;
  let enPausa = false;          // esperando tu decisión tras un aviso de blunder
  let mensaje = "", claseMsg = "";
  let activa = true;
  let avisar = true, verBarra = false;

  const tablero = new Tablero($("#tablero"), {
    juego: () => juego,
    puedeMover: () => !pensando && !enPausa && !juego.isGameOver() && juego.turn() === miColor,
    alMover: (m) => tuJugada(m),
  });
  usarTablero(tablero);

  // ---------------------------------------------------------------- panel
  function pintar() {
    const nivelTxt = NIVELES.find((n) => n.id === nivel).nombre;
    $("#j-abajo").innerHTML = fichaJugador(esc(estado.usuario), miColor === "w" ? "(blancas)" : "(negras)");
    $("#j-arriba").innerHTML = fichaJugador("Stockfish", `(${nivelTxt})`);
    $("#barra").classList.toggle("oculto", !verBarra);
    $("#barra").classList.toggle("girada", miColor === "b");

    let estadoTxt;
    if (juego.isGameOver()) estadoTxt = textoFinal();
    else if (enPausa) estadoTxt = "Partida en pausa: ¿deshaces la jugada?";
    else if (pensando) estadoTxt = "Stockfish está pensando…";
    else estadoTxt = juego.turn() === miColor ? "Te toca." : "Turno de Stockfish.";
    if (!juego.isGameOver() && juego.inCheck()) estadoTxt += " ¡Jaque!";

    $("#cuerpo").innerHTML = `
      <div class="filtros compactos">
        <select id="nivel">${NIVELES.map((n) => `<option value="${n.id}" ${n.id === nivel ? "selected" : ""}>${n.nombre}</option>`).join("")}</select>
        <select id="color"><option value="w" ${miColor === "w" ? "selected" : ""}>Con blancas</option>
          <option value="b" ${miColor === "b" ? "selected" : ""}>Con negras</option></select>
        <button class="principal" id="btn-nueva">Nueva partida</button>
      </div>
      <label class="opcion"><input type="checkbox" id="avisar" ${avisar ? "checked" : ""}> Modo entrenador: avísame si cometo un error grave</label>
      <label class="opcion"><input type="checkbox" id="ver-barra" ${verBarra ? "checked" : ""}> Mostrar la barra de evaluación</label>
      <div class="comentario ${claseMsg}" style="margin-top:12px">
        <div class="cabeza"><b>${estadoTxt}</b></div>
        ${mensaje ? `<p>${mensaje}</p>` : ""}
        ${enPausa ? `<div class="botones"><button class="principal" id="btn-deshacer-aviso">Deshacer y pensar otra</button>
          <button id="btn-seguir">Seguir igualmente</button></div>` : ""}
        <div class="botones" style="margin-top:8px">
          <button id="btn-deshacer">↶ Deshacer</button><button id="btn-pista">💡 Pista</button><button id="btn-girar">⟲ Girar</button>
        </div>
      </div>
      <p class="linea-texto">${textoJugadas() || '<span class="suave">Aún no hay jugadas.</span>'}</p>`;

    $("#nivel").onchange = (e) => { nivel = Number(e.target.value); pintar(); };
    $("#color").onchange = (e) => { miColor = e.target.value; };
    $("#btn-nueva").onclick = () => nueva(INICIO, $("#color").value);
    $("#avisar").onchange = (e) => (avisar = e.target.checked);
    $("#ver-barra").onchange = (e) => { verBarra = e.target.checked; pintar(); if (verBarra) actualizarBarra(); };
    $("#btn-deshacer").onclick = deshacer;
    $("#btn-pista").onclick = pista;
    $("#btn-girar").onclick = () => tablero.girar();
    if (enPausa) {
      $("#btn-deshacer-aviso").onclick = deshacer;
      $("#btn-seguir").onclick = () => { enPausa = false; mensaje = ""; claseMsg = ""; turnoMotor(); };
    }
  }

  function textoJugadas() {
    const partes = fenInicial.split(" ");
    let n = Number(partes[5]), blancas = partes[1] === "w", texto = "";
    juego.history({ verbose: true }).forEach((mv, i) => {
      if (blancas) texto += `${n}. `;
      else if (i === 0) texto += `${n}… `;
      texto += corta(mv.before, mv.san) + " ";
      if (!blancas) n += 1;
      blancas = !blancas;
    });
    return texto;
  }

  function textoFinal() {
    if (juego.isCheckmate()) return juego.turn() === miColor ? "Jaque mate. Gana Stockfish." : "¡Jaque mate! ¡Has ganado! 🏆";
    if (juego.isStalemate()) return "Tablas por ahogado.";
    if (juego.isThreefoldRepetition()) return "Tablas por triple repetición.";
    if (juego.isInsufficientMaterial()) return "Tablas por material insuficiente.";
    return "Tablas.";
  }

  async function actualizarBarra() {
    if (!verBarra) return;
    const fen = juego.fen();
    if (juego.isGameOver()) { ponerBarra(juego.isCheckmate() ? (juego.turn() === "w" ? -10000 : 10000) : 0, juego.isCheckmate() ? 0 : null, probGanar); return; }
    const [l] = await motor().analizar(fen, { profundidad: 12 });
    if (activa && fen === juego.fen()) ponerBarra(l.cp, l.mate, probGanar);
  }

  // ---------------------------------------------------------------- partida
  function nueva(fen, color) {
    fenInicial = fen;
    miColor = color;
    juego = new Chess(fen);
    enPausa = false; pensando = false; mensaje = ""; claseMsg = "";
    tablero.orientar(miColor);
    tablero.posicion(fen, false);
    tablero.ultimaJugada(null);
    tablero.quitarFlechas();
    pintar();
    actualizarBarra();
    if (juego.turn() !== miColor) turnoMotor();
  }

  async function tuJugada({ from, to, promotion }) {
    const fenAntes = juego.fen();
    let m;
    try { m = juego.move({ from, to, promotion: promotion || "q" }); } catch { tablero.posicion(fenAntes, false); return; }
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(m.lan);
    tablero.quitarFlechas();
    mensaje = ""; claseMsg = "";
    if (juego.isGameOver()) { pintar(); actualizarBarra(); return; }
    if (avisar) {
      pensando = true;
      pintar();
      const r = await corregirJugada(fenAntes, m.lan, { profundidad: 12 });
      pensando = false;
      if (!activa) return;
      if (r.perdida >= UMBRAL_AVISO) {
        enPausa = true;
        mensaje = `⚠ ${chip(fenAntes, m.san, "error")} parece un <b>error grave</b>: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar
          (evaluación ${textoEval(r.cpDespues, r.mateDespues)}). Mira qué puede hacer Stockfish ahora.`;
        claseMsg = "mal";
        pintar();
        return;
      }
    }
    turnoMotor();
  }

  async function turnoMotor() {
    if (juego.isGameOver()) return pintar();
    pensando = true;
    pintar();
    const fen = juego.fen();
    const n = NIVELES.find((x) => x.id === nivel);
    const uci = await motor().jugar(fen, { skill: n.skill ?? 20, elo: n.elo ?? null, ms: n.ms, profundidad: n.profundidad ?? null });
    if (!activa || fen !== juego.fen()) return;
    const m = juego.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    tablero.posicion(juego.fen());
    tablero.ultimaJugada(m.lan);
    pensando = false;
    pintar();
    actualizarBarra();
  }

  function deshacer() {
    if (pensando || juego.history().length === 0) return;
    if (juego.turn() === miColor) juego.undo(); // la de Stockfish
    juego.undo();                               // la tuya
    enPausa = false;
    mensaje = "Jugada deshecha. Piensa con calma: jaques, capturas y amenazas.";
    claseMsg = "c-imprecision";
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    tablero.quitarFlechas();
    pintar();
    actualizarBarra();
    if (!juego.isGameOver() && juego.turn() !== miColor) turnoMotor();
  }

  async function pista() {
    if (pensando || enPausa || juego.isGameOver() || juego.turn() !== miColor) return;
    const [l] = await motor().analizar(juego.fen(), { profundidad: 14 });
    if (!activa) return;
    tablero.ultimaJugada(null);
    tablero.ultimaJugada(l.pv[0].slice(0, 2) + l.pv[0].slice(0, 2)); // resalta solo la pieza a mover
    mensaje = "💡 Pista: la mejor jugada mueve la pieza resaltada. ¿Adónde?";
    claseMsg = "c-imprecision";
    pintar();
  }

  // ---------------------------------------------------------------- arranque
  if (parametros?.[0]) {
    try { new Chess(parametros[0]); nueva(parametros[0], parametros[1] || parametros[0].split(" ")[1]); }
    catch { nueva(INICIO, "w"); }
  } else nueva(INICIO, "w");
  return () => { activa = false; };
}
