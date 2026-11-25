// Revisión de una partida:
//   - resumen: precisión de cada jugador, recuento de clasificaciones y gráfica
//   - paso a paso: comentario de cada jugada con su icono (también sobre el tablero)
//   - "Mejor": muestra la línea de Stockfish · "Reintentar": busca tú una jugada mejor
//   - puedes mover piezas para explorar variantes (Stockfish las evalúa en directo)

import { obtener, todosDeUsuario } from "../almacen.js";
import { AnalisisCancelado, CLASES, MALAS, iconoSvg, analisisGuardado, analizarPartida, revisar, textoEval } from "../analizador.js";
import { MATE, motor, probGanar } from "../motor.js";
import { FLECHA, Tablero } from "../tablero.js";
import { aperturaEs, evalPalabras } from "../lenguaje.js";
import { corta, negrita, usarTablero } from "../notacion.js";
import { SIGNIFICADO } from "../leyenda.js";
import { $, Chess, MOTIVOS, esc, fecha, formatoReloj, leerPartida, resumen } from "../util.js";

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const FRASE = {
  brillante: "es brillante", genial: "es genial", mejor: "es la mejor", excelente: "es excelente",
  buena: "es buena", libro: "es de libro", imprecision: "es una imprecisión", error: "es un error",
  oportunidad: "es una oportunidad perdida", blunder: "es un error grave",
};

export async function montar(vista, { parametro, parametros = [], estado }) {
  const partida = (await todosDeUsuario("partidas", estado.usuario)).find((p) => p.id === parametro);
  if (!partida) {
    vista.innerHTML = `<p>No encuentro esa partida. <a href="#/partidas">Volver a la lista</a></p>`;
    return;
  }
  const r = resumen(partida);
  const { inicio, jugadas } = leerPartida(partida);

  vista.innerHTML = `
    <div class="con-tablero">
      <div class="col-tablero">
        <div class="jugador" id="j-arriba"></div>
        <div class="tablero-y-barra">
          <div class="barra-eval" id="barra"><div class="blanca"></div><div class="numero"></div></div>
          <div class="tablero" id="tablero"><div id="icono-jugada" class="icono-jugada oculto"></div></div>
        </div>
        <div class="jugador" id="j-abajo"></div>
      </div>
      <aside class="panel-derecho">
        <div class="titulo-panel">Revisión de partida</div>
        <div class="cuerpo" id="cuerpo"></div>
        <div class="controles">
          <button data-ir="inicio" title="Inicio">⏮</button>
          <button data-ir="atras" title="Atrás (←)">◀</button>
          <button data-ir="adelante" title="Adelante (→)">▶</button>
          <button data-ir="fin" title="Final">⏭</button>
          <button data-ir="girar" title="Girar tablero">⟲</button>
        </div>
      </aside>
    </div>`;

  // ------------------------------------------------------------ estado de la pantalla
  let revision = null;      // resultado de revisar() cuando el análisis está listo
  let progreso = 0;         // 0..1 mientras se analiza
  let modo = "resumen";     // resumen | paso | reintento
  let ply = Math.max(0, Math.min(Number(parametros[1]) || 0, jugadas.length)); // jugada en pantalla (0 = inicio; #/partida/<id>/<n> abre en la n)
  let variante = null;      // { desde, jugadas: [{san, uci, fen}], paso, titulo }
  let reintento = null;     // { mensaje, clase }
  let consulta = 0;         // para descartar evaluaciones antiguas
  let vivo = null;          // evaluación en directo de una variante { cp, mate }

  const fenPartida = (n) => (n > 0 ? jugadas[n - 1].fen : inicio);
  const fenActual = () => {
    if (modo === "reintento") return reintento.fen;
    if (variante) return variante.paso > 0 ? variante.jugadas[variante.paso - 1].fen : fenPartida(variante.desde);
    return fenPartida(ply);
  };

  const tablero = new Tablero($("#tablero"), {
    orientacion: r.color,
    juego: () => new Chess(fenActual()),
    puedeMover: () => modo !== "reintento" || !reintento.hecho,
    alMover: (m) => (modo === "reintento" ? intentar(m) : mover(m)),
  });
  usarTablero(tablero);
  $("#barra").classList.toggle("girada", r.color === "b");

  // ------------------------------------------------------------ jugadores y relojes
  function pintarJugadores() {
    const base = partida.time_control?.includes("/") ? null : parseInt(partida.time_control, 10) || null;
    const n = variante ? variante.desde : ply;
    const reloj = (color) => {
      for (let i = n - 1; i >= 0; i--) if (jugadas[i].color === color) return jugadas[i].reloj;
      return base;
    };
    const ficha = (color) => {
      const j = color === "w" ? partida.white : partida.black;
      const prec = revision ? (color === "w" ? revision.blancas : revision.negras).precision : null;
      return `<div class="avatar">${esc(j.username[0].toUpperCase())}</div>
        <span class="nombre">${esc(j.username)}</span><span class="elo">(${j.rating ?? "?"})</span>
        ${prec != null ? `<span class="prec-mini" title="Precisión">${prec.toFixed(1)}%</span>` : ""}
        <span class="reloj ${!variante && n < jugadas.length && jugadas[n].color === color ? "activo" : ""}">${formatoReloj(reloj(color))}</span>`;
    };
    const abajo = tablero.orientacion();
    $("#j-abajo").innerHTML = ficha(abajo);
    $("#j-arriba").innerHTML = ficha(abajo === "w" ? "b" : "w");
  }

  // ------------------------------------------------------------ panel derecho
  function icono(clase, grande = false) {
    return `<span class="icono c-${clase} ${grande ? "grande" : ""}" data-clase="${clase}" role="button" title="${CLASES[clase].nombre}: toca para ver qué significa" aria-label="${CLASES[clase].nombre}">${iconoSvg(clase)}</span>`;
  }

  function htmlResumen() {
    const filas = Object.entries(CLASES).sort((a, b) => a[1].orden - b[1].orden).map(([c, d]) => `
      <tr><td>${d.nombre}<small class="solo-pc sig-icono">${SIGNIFICADO[c]}</small></td><td class="num">${revision.blancas.cuenta[c]}</td>
          <td>${icono(c)}</td><td class="num">${revision.negras.cuenta[c]}</td></tr>`).join("");
    const caja = (color) => {
      const p = (color === "w" ? revision.blancas : revision.negras).precision;
      return `<div class="caja-prec ${color}">${p == null ? "—" : p.toFixed(1)}</div>`;
    };
    return `
      <div class="resumen">
        <table class="tabla-resumen">
          <thead><tr><th></th><th>${esc(partida.white.username)}</th><th></th><th>${esc(partida.black.username)}</th></tr></thead>
          <tbody>
            <tr><td>Precisión</td><td>${caja("w")}</td><td></td><td>${caja("b")}</td></tr>
            ${filas}
          </tbody>
        </table>
        ${htmlGrafica()}
        <button class="principal ancho" id="btn-empezar">Empezar revisión ▸</button>
        <p class="suave pequeno">${fecha(partida.end_time)} · ${esc(aperturaEs(r.apertura))} ·
          <span class="res-${r.resultado}">${r.resultado}</span> ${MOTIVOS[r.motivo] || ""} ·
          <a href="${esc(partida.url)}" target="_blank" rel="noopener">ver en chess.com</a></p>
      </div>`;
  }

  function htmlComentario() {
    if (modo === "reintento") {
      return `<div class="comentario ${reintento.clase || ""}">
        <div class="cabeza">${reintento.clase === "ok" ? icono("mejor", true) : reintento.clase === "mal" ? icono("error", true) : ""}
          <b>Reintentar</b></div>
        <p>${reintento.mensaje}</p>
        <div class="botones">
          ${reintento.hecho && reintento.clase === "mal" ? `<button id="btn-otra">Probar otra vez</button>` : ""}
          <button id="btn-ver-mejor">✔ Ver la mejor</button>
          <button id="btn-salir">Volver a la partida</button>
        </div></div>`;
    }
    if (ply === 0) return `<div class="comentario"><p>Posición inicial. Avanza con ▶ o con la flecha →.</p></div>`;
    const m = revision.jugadas[ply - 1];
    const puedeReintentar = MALAS.has(m.clase);
    return `<div class="comentario c-${m.clase}">
      <div class="cabeza">${icono(m.clase, true)}<b>${corta(m.fenAntes, m.san)} ${FRASE[m.clase]}</b>
        <span class="ev">${textoEval(m.cp, m.mate)}</span></div>
      ${m.comentario.startsWith("<") ? m.comentario : `<p>${m.comentario}</p>`}
      <div class="evalpal">${cap(evalPalabras(m.cp, m.mate))} <small>(${textoEval(m.cp, m.mate)})</small></div>
      <div class="botones">
        ${m.mejorUci ? `<button id="btn-mejor">✔ Mejor</button>` : ""}
        ${puedeReintentar ? `<button id="btn-reintentar">↺ Reintentar</button>` : ""}
        <button class="principal" id="btn-siguiente">Siguiente ▸</button>
      </div></div>`;
  }

  function htmlJugadas() {
    let html = "";
    jugadas.forEach((j, i) => {
      if (j.color === "w") html += `<span class="num">${Math.floor(i / 2) + 1}.</span>`;
      else if (i === 0) html += `<span class="num">1.</span><span></span>`;
      const clase = revision?.jugadas[i].clase;
      const marca = clase && clase !== "buena" && clase !== "excelente" ? icono(clase) : "";
      html += `<span class="jug ${!variante && modo !== "reintento" && i + 1 === ply ? "actual" : ""}" data-n="${i + 1}">${marca}${corta(i === 0 ? inicio : jugadas[i - 1].fen, j.san)}</span>`;
    });
    return `<div class="lista-jugadas">${html}</div>`;
  }

  function htmlGrafica() {
    if (!revision) return "";
    const total = Math.max(jugadas.length, 1);
    const x = (n) => (n / total) * 600;
    const y = (cp) => 100 - probGanar(cp);
    let puntos = `0,${y(revision.evalInicial)} `;
    revision.jugadas.forEach((m, i) => (puntos += `${x(i + 1)},${y(m.cp)} `));
    const destacar = new Set(["brillante", "genial", "imprecision", "error", "oportunidad", "blunder"]);
    const marcas = revision.jugadas.map((m, i) => destacar.has(m.clase)
      ? `<circle cx="${x(i + 1)}" cy="${y(m.cp)}" r="4" class="punto c-${m.clase}" data-n="${i + 1}"/>` : "").join("");
    const cursor = !variante && modo !== "reintento" ? `<line x1="${x(ply)}" x2="${x(ply)}" y1="0" y2="100" class="cursor"/>` : "";
    return `<svg class="grafica" id="grafica" viewBox="0 0 600 100" preserveAspectRatio="none">
      <rect x="0" y="0" width="600" height="100" class="fondo"/>
      <polygon points="0,100 ${puntos} 600,100" class="area"/>
      <line x1="0" x2="600" y1="50" y2="50" class="media"/>${cursor}${marcas}</svg>`;
  }

  function pintarCuerpo() {
    const c = $("#cuerpo");
    if (!revision) {
      c.innerHTML = `
        <div class="analizando">
          <b>Analizando la partida con Stockfish…</b>
          <div class="barra-progreso"><span style="width:${(progreso * 100).toFixed(0)}%"></span></div>
          <span class="suave">${(progreso * 100).toFixed(0)}% · solo se hace una vez: después queda guardado</span>
        </div>${htmlJugadas()}`;
    } else if (modo === "resumen") {
      c.innerHTML = htmlResumen();
      $("#btn-empezar").onclick = () => { modo = "paso"; ir(1); };
    } else {
      const aviso = variante ? `<div class="variante-aviso"><span>${esc(variante.titulo)}:
          <b>${variante.jugadas.slice(0, variante.paso).map((j, k) => corta(k === 0 ? fenPartida(variante.desde) : variante.jugadas[k - 1].fen, j.san)).join(" ") || "…"}</b>
          ${vivo ? `<span class="ev">${textoEval(vivo.cp, vivo.mate)}</span>` : ""}</span>
          <button id="btn-volver">Volver a la partida</button></div>` : "";
      c.innerHTML = htmlComentario() + aviso + htmlJugadas() + htmlGrafica();
      enlazarBotones();
    }
    const lista = c.querySelector(".lista-jugadas");
    const actual = c.querySelector(".lista-jugadas .actual");
    if (actual && lista.scrollWidth > lista.clientWidth + 2) {
      // En el móvil la lista es una tira horizontal: centramos la jugada sin mover la página.
      lista.scrollLeft = actual.offsetLeft - lista.clientWidth / 2 + actual.offsetWidth / 2;
    } else actual?.scrollIntoView({ block: "nearest" });
    if (lista) lista.onclick = (ev) => {
      const n = ev.target.closest("[data-n]")?.dataset.n;
      if (n) { if (revision && modo === "resumen") modo = "paso"; salirDeTodo(); ir(Number(n)); }
    };
    const g = $("#grafica");
    if (g) g.onclick = (ev) => {
      const rect = g.getBoundingClientRect();
      if (modo === "resumen") modo = "paso";
      salirDeTodo();
      ir(Math.round(((ev.clientX - rect.left) / rect.width) * jugadas.length));
    };
  }

  function enlazarBotones() {
    const b = (id, f) => { const el = $(id); if (el) el.onclick = f; };
    b("#btn-siguiente", () => ir(ply + 1));
    b("#btn-mejor", () => verMejor(ply));
    b("#btn-reintentar", () => empezarReintento(ply));
    b("#btn-volver", () => { variante = null; vivo = null; pintar(); });
    b("#btn-otra", () => empezarReintento(reintento.ply));
    b("#btn-ver-mejor", () => { const n = reintento.ply; modo = "paso"; reintento = null; verMejor(n); });
    b("#btn-salir", () => { const n = reintento.ply; modo = "paso"; reintento = null; ir(n); });
  }

  // ------------------------------------------------------------ tablero
  function pintar(animar = true) {
    const fen = fenActual();
    tablero.posicion(fen, animar); // la animación es solo visual: no hace falta esperarla
    tablero.quitarFlechas();
    $("#icono-jugada").classList.add("oculto");

    let ultima = null;
    if (modo === "reintento") ultima = reintento.ultima || null;
    else if (variante) ultima = variante.paso > 0 ? variante.jugadas[variante.paso - 1].uci : null;
    else ultima = ply > 0 ? jugadas[ply - 1].uci : null;
    tablero.ultimaJugada(ultima);

    // Barra de evaluación
    if (variante || modo === "reintento") {
      if (vivo) ponerBarra(vivo.cp, vivo.mate);
    } else if (revision) {
      const m = ply > 0 ? revision.jugadas[ply - 1] : null;
      ponerBarra(m ? m.cp : revision.evalInicial, m ? m.mate : null);
      if (m && modo === "paso") {
        ponerIcono(m);
        if (m.mejorUci && MALAS.has(m.clase)) { tablero.flecha(m.uci, FLECHA.error); tablero.flecha(m.mejorUci, FLECHA.mejor); }
      }
    }
    if (variante?.mostrarFlecha && variante.paso < variante.jugadas.length)
      tablero.flecha(variante.jugadas[variante.paso].uci, FLECHA.mejor);
    pintarJugadores();
    pintarCuerpo();
    if (variante) evaluarEnDirecto(fen);
  }

  function ponerBarra(cp, mate) {
    $("#barra .blanca").style.height = probGanar(cp).toFixed(1) + "%";
    $("#barra .numero").textContent = mate === 0 ? "#" : mate ? `M${Math.abs(mate)}` : Math.abs(cp / 100).toFixed(1);
    $("#barra").classList.toggle("negras-ganan", cp < 0);
  }

  // Icono de la clasificación encima de la casilla de destino (como en las webs de ajedrez).
  function ponerIcono(m) {
    const caja = $("#tablero").getBoundingClientRect();
    const casilla = tablero.rectanguloCasilla(m.uci.slice(2, 4));
    if (!casilla) return;
    const el = $("#icono-jugada");
    el.className = `icono-jugada c-${m.clase}`;
    el.innerHTML = iconoSvg(m.clase);
    const t = casilla.width * 0.42;
    el.style.width = el.style.height = t + "px";
    el.style.fontSize = t * 0.5 + "px";
    el.style.left = casilla.right - caja.left - t * 0.7 + "px";
    el.style.top = casilla.top - caja.top - t * 0.3 + "px";
  }

  async function evaluarEnDirecto(fen) {
    const id = ++consulta;
    const g = new Chess(fen);
    if (g.isGameOver()) { vivo = { cp: g.isCheckmate() ? (g.turn() === "w" ? -MATE : MATE) : 0, mate: g.isCheckmate() ? 0 : null }; ponerBarra(vivo.cp, vivo.mate); return; }
    const [l] = await motor().analizar(fen, { profundidad: 14 });
    if (id !== consulta || !l) return;
    vivo = { cp: l.cp, mate: l.mate };
    ponerBarra(l.cp, l.mate);
    const ev = document.querySelector(".variante-aviso .ev");
    if (ev) ev.textContent = textoEval(l.cp, l.mate);
    else pintarCuerpo();
    if (variante && !variante.mostrarFlecha) tablero.flecha(l.pv[0], FLECHA.mejor);
  }

  // ------------------------------------------------------------ navegación y acciones
  function salirDeTodo() { variante = null; vivo = null; reintento = null; if (modo === "reintento") modo = "paso"; }

  function ir(destino) {
    if (destino === "girar") {
      tablero.girar().then(() => { $("#barra").classList.toggle("girada"); pintar(false); });
      return;
    }
    if (modo === "reintento") { modo = "paso"; reintento = null; }
    if (variante) {
      const max = variante.jugadas.length;
      const p = typeof destino === "number" ? destino
        : { inicio: 0, atras: variante.paso - 1, adelante: variante.paso + 1, fin: max }[destino];
      if (p < 0) { variante = null; vivo = null; } else variante.paso = Math.min(p, max);
      return pintar();
    }
    const p = typeof destino === "number" ? destino
      : { inicio: 0, atras: ply - 1, adelante: ply + 1, fin: jugadas.length }[destino];
    ply = Math.max(0, Math.min(p, jugadas.length));
    if (revision && modo === "resumen" && ply > 0) modo = "paso";
    pintar();
  }

  // Mover una pieza: si coincide con la partida avanza; si no, abre una variante para explorar.
  function mover({ from, to, promotion }) {
    const g = new Chess(fenActual());
    let m;
    try { m = g.move({ from, to, promotion: promotion || "q" }); } catch { return pintar(false); }
    if (!variante && jugadas[ply]?.uci === m.lan) { ply += 1; if (modo === "resumen" && revision) modo = "paso"; return pintar(false); }
    if (!variante) variante = { desde: ply, jugadas: [], paso: 0, titulo: "Explorando" };
    if (variante.esLineaMejor) { variante.esLineaMejor = false; variante.mostrarFlecha = false; variante.titulo = "Explorando"; }
    variante.jugadas = variante.jugadas.slice(0, variante.paso);
    variante.jugadas.push({ san: m.san, uci: m.lan, fen: m.after });
    variante.paso += 1;
    if (modo === "resumen") modo = "paso";
    pintar(false);
  }

  // "Mejor": la línea de Stockfish desde la posición anterior a la jugada n.
  function verMejor(n) {
    const m = revision.jugadas[n - 1];
    const g = new Chess(m.fenAntes);
    const linea = [];
    for (const u of m.lineaMejor.slice(0, 8)) {
      try { const x = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); linea.push({ san: x.san, uci: x.lan, fen: x.after }); }
      catch { break; }
    }
    ply = n;
    variante = { desde: n - 1, jugadas: linea, paso: 0, titulo: "Línea de Stockfish", esLineaMejor: true, mostrarFlecha: true };
    vivo = null;
    pintar();
  }

  // "Reintentar": vuelves a la posición anterior y buscas una jugada mejor.
  function empezarReintento(n) {
    const m = revision.jugadas[n - 1];
    modo = "reintento";
    variante = null; vivo = null;
    reintento = {
      ply: n, fen: m.fenAntes, fenIni: m.fenAntes, hecho: false, clase: "",
      mensaje: `Juegas con ${m.color === "w" ? "blancas" : "negras"}. En la partida jugaste ${negrita(m.fenAntes, m.san)}. ¿Encuentras algo mejor?`,
    };
    pintar();
  }

  async function intentar({ from, to, promotion }) {
    const m = revision.jugadas[reintento.ply - 1];
    const g = new Chess(reintento.fen);
    let x;
    try { x = g.move({ from, to, promotion: promotion || "q" }); } catch { return pintar(false); }
    reintento.fen = x.after; reintento.ultima = x.lan; reintento.hecho = true;
    reintento.mensaje = "Stockfish está comprobando tu jugada…";
    reintento.clase = "";
    pintar(false);
    const antes = (await obtener("analisis", partida.url)).evals[reintento.ply - 1];
    const [l] = g.isGameOver() ? [{ cp: g.isCheckmate() ? (g.turn() === "w" ? -MATE : MATE) : 0, mate: g.isCheckmate() ? 0 : null }]
      : await motor().analizar(x.after, { profundidad: 14 });
    const signo = m.color === "w" ? 1 : -1;
    const perdida = Math.max(0, probGanar(signo * antes.cp) - probGanar(signo * l.cp));
    vivo = { cp: l.cp, mate: l.mate };
    if (x.lan === antes.pv[0] || perdida < 5) {
      reintento.clase = "ok";
      reintento.mensaje = `✔ ¡Bien! ${negrita(reintento.fenIni, x.san)} ${x.lan === antes.pv[0] ? "es la mejor jugada." : "es una buena jugada."}`;
    } else {
      reintento.clase = "mal";
      reintento.mensaje = `✘ ${negrita(reintento.fenIni, x.san)} tampoco es buena: pierdes ${perdida.toFixed(0)} puntos de probabilidad de ganar.`;
    }
    pintar(false);
  }

  // ------------------------------------------------------------ arranque
  vista.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => ir(b.dataset.ir)));
  const teclas = (ev) => {
    if (ev.target.matches("input, select, textarea")) return;
    if (ev.key === "ArrowLeft") { ir("atras"); ev.preventDefault(); }
    if (ev.key === "ArrowRight") { ir("adelante"); ev.preventDefault(); }
  };
  document.addEventListener("keydown", teclas);
  const alRedimensionar = () => pintar(false);
  window.addEventListener("resize", alRedimensionar);
  let activa = true;

  pintar(false);
  // El análisis va aparte: la pantalla no espera a que termine (así puedes salir cuando quieras).
  (async () => {
    const alProgreso = (x) => { progreso = x; if (activa && !revision) pintarCuerpo(); };
    let analisis = await analisisGuardado(partida.url);
    while (!analisis && activa) {
      try {
        analisis = await analizarPartida(partida, alProgreso);
      } catch (err) {
        // Si alguien pulsó "Parar" en un lote que incluía esta partida, la analizamos por nuestra cuenta.
        if (!(err instanceof AnalisisCancelado)) throw err;
      }
    }
    if (analisis && activa) {
      revision = revisar(partida, analisis);
      if (ply > 0) modo = "paso";
      pintar(false);
    }
  })();

  return () => {
    activa = false;
    document.removeEventListener("keydown", teclas);
    window.removeEventListener("resize", alRedimensionar);
  };
}
