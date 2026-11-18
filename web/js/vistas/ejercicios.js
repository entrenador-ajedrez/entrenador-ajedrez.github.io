// Ejercicios: las posiciones en las que TÚ te equivocaste, para encontrar la mejor jugada.
// Primero salen los nuevos, luego los que fallaste y al final los que ya resolviste.

import { apuntarProgreso, todoElProgreso, todosDeUsuario } from "../almacen.js";
import { corregirJugada, revisar, textoEval } from "../analizador.js";
import { FLECHA, Tablero, disposicion, fichaJugador } from "../tablero.js";
import { $, Chess, esc, fecha, resumen } from "../util.js";

const PISTAS = {
  material: "En la partida acabaste perdiendo material. Antes de mover, mira qué piezas quedan sin defender.",
  mate_contra: "Cuidado: en la partida permitiste un mate. Mira primero los jaques del rival.",
  mate_perdido: "Aquí había un mate. ¡Búscalo! Empieza por los jaques.",
  tactica: "Busca jugadas forzantes: jaques, capturas y amenazas, tuyas y del rival.",
};
const FASES = { apertura: "Apertura", "medio juego": "Medio juego", final: "Final" };

export async function montar(vista, { estado }) {
  vista.innerHTML = disposicion("Ejercicios", {
    controles: `<button data-l="0" title="Inicio">⏮</button><button data-l="-1" title="Atrás">◀</button>
                <button data-l="1" title="Adelante">▶</button><button data-l="99" title="Final">⏭</button>`,
  });
  $("#barra").classList.add("oculto"); // sin barra: daría pistas

  let ejercicios = [];   // todos
  let cola = [];
  let actual = null;
  let estadoEj = "pensando";   // pensando | comprobando | fallado | solucion
  let primerIntento = true;
  let linea = null;            // { fens, san, uci, paso }
  let activa = true;

  const fenActual = () => (linea ? linea.fens[linea.paso] : actual ? actual.fen : new Chess().fen());
  const tablero = new Tablero($("#tablero"), {
    juego: () => new Chess(fenActual()),
    puedeMover: () => estadoEj === "pensando" && !!actual,
    alMover: (m) => comprobar(m),
  });

  async function cargar() {
    const [partidas, analisis, progreso] = await Promise.all([
      todosDeUsuario("partidas", estado.usuario), todosDeUsuario("analisis", estado.usuario), todoElProgreso(estado.usuario),
    ]);
    const porUrl = new Map(analisis.map((a) => [a.url, a]));
    ejercicios = [];
    for (const p of partidas) {
      const a = porUrl.get(p.url);
      if (!a) continue;
      const rev = revisar(p, a);
      const r = resumen(p);
      for (const m of rev.jugadas) {
        if (m.color !== r.color || !["blunder", "error", "oportunidad", "imprecision"].includes(m.clase)) continue;
        const id = `ej:${p.id}:${m.indice}`;
        ejercicios.push({
          id, fen: m.fenAntes, color: m.color, jugada: Math.ceil(m.indice / 2), tuJugada: m.san, tuUci: m.uci,
          clase: m.clase, tipo: m.tipo, fase: m.fase, partidaId: p.id, rival: r.rival.username,
          fecha: fecha(p.end_time), progreso: progreso.get(id) || null,
        });
      }
    }
    return { total: partidas.length, analizadas: analisis.length };
  }

  function construirCola() {
    const f = $("#f-fase")?.value || "", t = $("#f-tipo")?.value || "", g = $("#f-gravedad")?.value || "graves";
    const prioridad = (e) => (!e.progreso ? 0 : e.progreso.ultimo === "fallo" ? 1 : 2);
    cola = ejercicios
      .filter((e) => (!f || e.fase === f) && (!t || e.tipo === t) &&
        (g === "todos" || (g === "graves" ? e.clase !== "imprecision" : e.clase === g)))
      .map((e) => ({ e, azar: Math.random() }))
      .sort((a, b) => prioridad(a.e) - prioridad(b.e) || a.azar - b.azar)
      .map((x) => x.e);
  }

  // ---------------------------------------------------------------- panel
  function pintarPanel(mensaje = "", clase = "") {
    const intentados = ejercicios.filter((e) => e.progreso).length;
    const resueltos = ejercicios.filter((e) => e.progreso?.ultimo === "acierto").length;
    const filtros = `
      <div class="filtros compactos">
        <select id="f-fase"><option value="">Todas las fases</option><option value="apertura">Apertura</option>
          <option value="medio juego">Medio juego</option><option value="final">Final</option></select>
        <select id="f-tipo"><option value="">Todos los tipos</option><option value="material">Pierdes material</option>
          <option value="mate_contra">Permites mate</option><option value="mate_perdido">Mate no visto</option>
          <option value="tactica">Táctico</option></select>
        <select id="f-gravedad"><option value="graves">Blunders y errores</option><option value="blunder">Solo blunders</option>
          <option value="todos">Incluir imprecisiones</option></select>
      </div>
      <p class="suave pequeno">${ejercicios.length} ejercicios de tus partidas · ${intentados} intentados · ${resueltos} resueltos · ${cola.length} en cola</p>`;
    const anterior = { f: $("#f-fase")?.value, t: $("#f-tipo")?.value, g: $("#f-gravedad")?.value };
    if (!actual) {
      $("#cuerpo").innerHTML = filtros + `<div class="comentario"><p>No hay ejercicios con estos filtros.</p></div>`;
    } else {
      const lineaHtml = linea ? `<p class="linea-texto">${linea.san.map((s, i) =>
        `<span class="${i + 1 === linea.paso ? "actual" : ""}" data-p="${i + 1}">${esc(s)}</span>`).join(" ")}</p>` : "";
      $("#cuerpo").innerHTML = filtros + `
        <div class="comentario ${clase}">
          <div class="cabeza"><b>Juegas con ${actual.color === "w" ? "blancas" : "negras"}. ¿Cuál es la mejor jugada?</b></div>
          <p class="suave pequeno">${FASES[actual.fase]} · jugada ${actual.jugada} vs ${esc(actual.rival)} (${actual.fecha})
            ${actual.progreso ? ` · intentado ${actual.progreso.intentos}×` : ""}</p>
          <p>${mensaje}</p>${lineaHtml}
          <div class="botones">
            ${estadoEj === "pensando" ? `<button id="btn-pista">💡 Pista</button><button id="btn-solucion">Ver solución</button>` : ""}
            ${estadoEj === "fallado" ? `<button id="btn-otra">↺ Probar otra vez</button><button id="btn-solucion">Ver solución</button>` : ""}
            <button class="principal" id="btn-siguiente">Siguiente ▸</button>
          </div>
          ${estadoEj === "solucion" ? `<div class="botones" style="margin-top:8px">
            <a class="boton" href="#/partida/${actual.partidaId}">Ver la partida</a>
            <a class="boton" href="#/jugar/${encodeURIComponent(actual.fen)}/${actual.color}">♟ Jugar esta posición</a></div>` : ""}
        </div>`;
    }
    if (anterior.f !== undefined) { $("#f-fase").value = anterior.f; $("#f-tipo").value = anterior.t; $("#f-gravedad").value = anterior.g; }
    for (const id of ["#f-fase", "#f-tipo", "#f-gravedad"]) $(id).onchange = () => { construirCola(); siguiente(); };
    const b = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    b("#btn-siguiente", siguiente);
    b("#btn-solucion", verSolucion);
    b("#btn-pista", () => pintarPanel("💡 " + (PISTAS[actual.tipo] || PISTAS.tactica), "c-imprecision"));
    b("#btn-otra", () => { estadoEj = "pensando"; tablero.posicion(actual.fen, false); tablero.quitarFlechas(); pintarPanel("Prueba otra jugada."); });
    $("#cuerpo .linea-texto")?.addEventListener("click", (ev) => { if (ev.target.dataset.p) irLinea(Number(ev.target.dataset.p)); });
  }

  function siguiente() {
    if (!cola.length) construirCola();
    actual = cola.shift() || null;
    linea = null;
    estadoEj = "pensando";
    primerIntento = true;
    tablero.quitarFlechas();
    tablero.ultimaJugada(null);
    if (actual) {
      tablero.orientar(actual.color);
      tablero.posicion(actual.fen, false);
      $("#j-abajo").innerHTML = fichaJugador(esc(estado.usuario), actual.color === "w" ? "(blancas)" : "(negras)");
      $("#j-arriba").innerHTML = fichaJugador(esc(actual.rival), "");
    }
    pintarPanel();
  }

  async function comprobar({ from, to, promotion }) {
    const g = new Chess(actual.fen);
    let m;
    try { m = g.move({ from, to, promotion: promotion || "q" }); } catch { return; }
    estadoEj = "comprobando";
    tablero.posicion(m.after, false);
    tablero.ultimaJugada(m.lan);
    pintarPanel("Stockfish está comprobando tu jugada…");
    const r = await corregirJugada(actual.fen, m.lan);
    if (!activa) return;
    const acierto = r.esLaMejor || r.perdida < 5;
    if (primerIntento) {
      actual.progreso = await apuntarProgreso(estado.usuario, actual.id, acierto);
      primerIntento = false;
    }
    if (acierto) {
      const extra = r.esLaMejor ? "¡Es la jugada de Stockfish!" : `Stockfish prefería <b>${esc(r.mejorSan)}</b>, pero la tuya también es buena.`;
      mostrarSolucion(r, `✔ <b>${esc(m.san)}</b> funciona. ${extra}`, "ok");
    } else {
      estadoEj = "fallado";
      pintarPanel(`✘ <b>${esc(m.san)}</b> no es lo mejor: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar
        (evaluación ${textoEval(r.cpDespues, r.mateDespues)}).`, "mal");
    }
  }

  async function verSolucion() {
    if (primerIntento) { actual.progreso = await apuntarProgreso(estado.usuario, actual.id, false); primerIntento = false; }
    pintarPanel("Stockfish está pensando…");
    const r = await corregirJugada(actual.fen, actual.tuUci);
    if (activa) mostrarSolucion(r, "", "");
  }

  function mostrarSolucion(r, mensaje, clase) {
    estadoEj = "solucion";
    const g = new Chess(actual.fen);
    linea = { fens: [actual.fen], san: [], uci: [], paso: 0 };
    for (const u of r.lineaMejor.slice(0, 8)) {
      try { const x = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); linea.fens.push(x.after); linea.san.push(x.san); linea.uci.push(x.lan); }
      catch { break; }
    }
    linea.mensaje = `${mensaje ? mensaje + "<br>" : ""}En la partida jugaste <b class="txt-mal">${esc(actual.tuJugada)}</b>.
      Lo mejor era <b class="txt-bien">${esc(r.mejorSan)}</b>. Recorre la línea de Stockfish con ▶:`;
    linea.clase = clase;
    irLinea(0);
  }

  function irLinea(p) {
    if (!linea) return;
    linea.paso = Math.max(0, Math.min(p, linea.fens.length - 1));
    tablero.posicion(linea.fens[linea.paso]);
    tablero.quitarFlechas();
    if (linea.paso === 0) {
      tablero.flecha(actual.tuUci, FLECHA.error);
      tablero.flecha(linea.uci[0], FLECHA.mejor);
      tablero.ultimaJugada(null);
    } else tablero.ultimaJugada(linea.uci[linea.paso - 1]);
    pintarPanel(linea.mensaje, linea.clase);
  }

  vista.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => {
    if (!linea) return;
    const d = Number(b.dataset.l);
    irLinea(d === 0 ? 0 : d === 99 ? linea.fens.length - 1 : linea.paso + d);
  }));
  const teclas = (ev) => {
    if (!linea || ev.target.matches("input, select")) return;
    if (ev.key === "ArrowLeft") irLinea(linea.paso - 1);
    if (ev.key === "ArrowRight") irLinea(linea.paso + 1);
  };
  document.addEventListener("keydown", teclas);

  // ---------------------------------------------------------------- arranque
  const { total, analizadas } = await cargar();
  if (!ejercicios.length) {
    $("#cuerpo").innerHTML = `<div class="comentario"><p>Los ejercicios salen de tus errores en partidas
      <b>analizadas</b>. Tienes ${analizadas} de ${total} analizadas.</p>
      <a class="boton" href="#/partidas">Elegir partidas para analizar</a></div>`;
  } else {
    construirCola();
    siguiente();
  }
  return () => { activa = false; document.removeEventListener("keydown", teclas); };
}
