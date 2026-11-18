// Entrenar aperturas y finales.
//  APERTURAS: juegas la línea de la apertura (si te equivocas, te lo dice); luego juego libre
//    hasta la jugada 10: el rival elige entre las mejores jugadas y Stockfish corrige las tuyas.
//  FINALES: posición fija contra Stockfish a tope con un objetivo (mate, coronar o tablas).

import { apuntarProgreso, todoElProgreso, todosDeUsuario } from "../almacen.js";
import { corregirJugada } from "../analizador.js";
import { APERTURAS, FINALES, JUGADAS_APERTURA } from "../datos-entrenamiento.js";
import { motor } from "../motor.js";
import { Tablero, disposicion, fichaJugador } from "../tablero.js";
import { $, Chess, esc, resumen } from "../util.js";

const OBJETIVOS = {
  mate: "Objetivo: dar jaque mate.",
  coronar: "Objetivo: coronar el peón (convertirlo en dama).",
  tablas: "Objetivo: conseguir tablas. Stockfish intentará ganarte.",
};

export async function montar(vista, { estado }) {
  vista.innerHTML = disposicion("Entrenar");
  $("#barra").classList.add("oculto");

  let modo = "apertura";       // apertura | final
  let def = null;              // entrenamiento elegido
  let juego = new Chess();
  let miColor = "w";
  let paso = 0;                // jugadas de la línea de apertura ya hechas
  let pensando = false, enPausa = false, terminado = false;
  let cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };
  let mensaje = "", claseMsg = "";
  let activa = true;
  let progreso = await todoElProgreso(estado.usuario);

  // Tus estadísticas con cada apertura (de tus partidas guardadas).
  const partidas = (await todosDeUsuario("partidas", estado.usuario)).map((p) => resumen(p));
  const stats = (a) => {
    const js = partidas.filter((r) => r.familia === a.familia && r.color === a.color);
    return { n: js.length, v: js.filter((r) => r.resultado === "victoria").length };
  };

  const tablero = new Tablero($("#tablero"), {
    juego: () => juego,
    puedeMover: () => !!def && !pensando && !enPausa && !terminado && juego.turn() === miColor,
    alMover: (m) => tuJugada(m),
  });

  const enLinea = () => modo === "apertura" && def && paso < def.secuencia.length;
  const lineaTexto = (s) => s.map((x, i) => (i % 2 === 0 ? `${i / 2 + 1}.${x}` : x)).join(" ");

  // ---------------------------------------------------------------- lista
  function pintarLista() {
    def = null;
    juego = new Chess();
    tablero.orientar("w");
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    $("#j-arriba").innerHTML = ""; $("#j-abajo").innerHTML = "";
    const lista = modo === "apertura" ? APERTURAS : FINALES;
    $("#cuerpo").innerHTML = `
      <div class="pestanas">
        <button class="pestana ${modo === "apertura" ? "activa" : ""}" data-modo="apertura">Aperturas</button>
        <button class="pestana ${modo === "final" ? "activa" : ""}" data-modo="final">Finales</button>
      </div>
      <p class="suave pequeno">${modo === "apertura"
        ? "Las aperturas de un repertorio sencillo, con tus estadísticas reales."
        : "Finales básicos que todo jugador debe saber ganar (o defender)."} El medio juego se entrena con tus errores en <a href="#/ejercicios">Ejercicios</a>.</p>
      <div class="lista-entrenos">${lista.map((d, i) => {
        const hecho = progreso.get(`${modo}-${d.id}`)?.aciertos;
        let sub;
        if (modo === "apertura") {
          const s = stats(d);
          sub = `Con ${d.color === "w" ? "blancas" : "negras"} · ${lineaTexto(d.secuencia)} · ` +
            (s.n ? `en tus partidas: ${s.n}, ${Math.round((100 * s.v) / s.n)}% de victorias` : "aún no la has jugado");
        } else sub = `${d.nivel} · ${OBJETIVOS[d.objetivo]}`;
        return `<button class="entreno" data-i="${i}"><b>${esc(d.nombre)}</b>
          ${hecho ? `<span class="hecho">✔ superado ${hecho}×</span>` : ""}<br><span class="suave">${sub}</span></button>`;
      }).join("")}</div>`;
    $("#cuerpo").querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => { modo = b.dataset.modo; pintarLista(); }));
    $("#cuerpo").querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => empezar(lista[Number(b.dataset.i)])));
  }

  // ---------------------------------------------------------------- sesión
  function empezar(d) {
    def = d;
    miColor = d.color;
    juego = new Chess(modo === "final" ? d.fen : undefined);
    paso = 0; cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };
    pensando = false; enPausa = false; terminado = false;
    mensaje = modo === "apertura" ? "Empieza jugando la línea de la apertura." : ""; claseMsg = "";
    tablero.orientar(miColor);
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    tablero.quitarFlechas();
    $("#j-abajo").innerHTML = fichaJugador(esc(estado.usuario), miColor === "w" ? "(blancas)" : "(negras)");
    $("#j-arriba").innerHTML = fichaJugador("Stockfish", modo === "apertura" ? "(rival variado)" : "(a tope)");
    pintarSesion();
    siguienteTurno();
  }

  function pintarSesion() {
    let objetivo;
    if (modo === "apertura") objetivo = `Juegas con ${miColor === "w" ? "blancas" : "negras"}. Línea: ${lineaTexto(def.secuencia)}`;
    else objetivo = `Juegas con ${miColor === "w" ? "blancas" : "negras"}. ${OBJETIVOS[def.objetivo]}` +
      (def.referencia ? ` Un buen jugador lo consigue en unas ${def.referencia} jugadas.` : "");
    const estadoTxt = terminado ? "" : pensando ? "Pensando…" : juego.turn() === miColor ? "Te toca." : "";
    $("#cuerpo").innerHTML = `
      <p><a href="#" id="volver">← Elegir otro</a></p>
      <div class="comentario ${claseMsg}">
        <div class="cabeza"><b>${esc(def.nombre)}</b><span class="ev">${estadoTxt}</span></div>
        <p class="suave pequeno">${objetivo}</p>
        ${mensaje ? `<p>${mensaje}</p>` : ""}
        ${enPausa ? `<div class="botones"><button class="principal" id="btn-deshacer-aviso">Deshacer y probar otra</button>
          <button id="btn-seguir">Seguir igualmente</button></div>` : ""}
        <div class="botones" style="margin-top:8px">
          <button id="btn-reiniciar">↺ Empezar de nuevo</button><button id="btn-deshacer">↶ Deshacer</button>
          <button id="btn-pista">💡 Pista</button>
        </div>
      </div>
      <details open class="ideas"><summary>Ideas clave</summary><ul>${def.ideas.map((t) => `<li>${t}</li>`).join("")}</ul></details>
      <p class="linea-texto">${esc(textoJugadas()) || '<span class="suave">Aún no hay jugadas.</span>'}</p>`;
    $("#volver").onclick = async (e) => { e.preventDefault(); progreso = await todoElProgreso(estado.usuario); pintarLista(); };
    $("#btn-reiniciar").onclick = () => empezar(def);
    $("#btn-deshacer").onclick = deshacer;
    $("#btn-pista").onclick = pista;
    if (enPausa) {
      $("#btn-deshacer-aviso").onclick = deshacer;
      $("#btn-seguir").onclick = () => { enPausa = false; mensaje = ""; claseMsg = ""; siguienteTurno(); };
    }
  }

  function textoJugadas() {
    const g = new Chess(modo === "final" ? def.fen : undefined);
    let texto = "";
    for (const san of juego.history()) {
      const [, color, , , , num] = g.fen().split(" ");
      if (color === "w") texto += `${num}. `;
      else if (!texto) texto += `${num}… `;
      texto += san + " ";
      g.move(san);
    }
    return texto;
  }

  function siguienteTurno() {
    pintarSesion();
    if (terminado || comprobarFin()) return;
    if (juego.turn() === miColor) return;
    if (enLinea()) {
      setTimeout(() => {
        if (!activa || !def) return;
        const m = juego.move(def.secuencia[paso]);
        paso += 1;
        tablero.posicion(juego.fen());
        tablero.ultimaJugada(m.lan);
        siguienteTurno();
      }, 400);
    } else turnoRival();
  }

  async function turnoRival() {
    pensando = true;
    pintarSesion();
    const fen = juego.fen();
    let uci;
    if (modo === "apertura") {
      // El rival elige al azar entre las jugadas casi igual de buenas (≤ 0,3 peones peor).
      const lineas = await motor().analizar(fen, { profundidad: 12, multipv: 3 });
      const signo = juego.turn() === "w" ? 1 : -1;
      const mejor = signo * lineas[0].cp;
      const candidatas = lineas.filter((l) => mejor - signo * l.cp <= 30);
      uci = candidatas[Math.floor(Math.random() * candidatas.length)].pv[0];
    } else {
      uci = await motor().jugar(fen, { skill: 20, ms: 250 });
    }
    if (!activa || fen !== juego.fen()) return;
    const m = juego.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    tablero.posicion(juego.fen());
    tablero.ultimaJugada(m.lan);
    pensando = false;
    siguienteTurno();
  }

  async function tuJugada({ from, to, promotion }) {
    const fenAntes = juego.fen();
    let m;
    try { m = juego.move({ from, to, promotion: promotion || "q" }); } catch { tablero.posicion(fenAntes, false); return; }
    if (enLinea()) {
      const esperada = def.secuencia[paso];
      if (m.san !== esperada) {
        juego.undo();
        tablero.posicion(fenAntes, false);
        mensaje = `En la ${esc(def.nombre)} aquí se juega <b>${esc(esperada)}</b>. ¡Prueba otra vez!`;
        claseMsg = "c-imprecision";
        return pintarSesion();
      }
      paso += 1;
      tablero.posicion(juego.fen(), false);
      tablero.ultimaJugada(m.lan);
      mensaje = paso >= def.secuencia.length ? "✔ Línea completada. Ahora juega libre: Stockfish corregirá cada jugada." : "✔ Correcto.";
      claseMsg = "ok";
      return siguienteTurno();
    }
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(m.lan);
    if (comprobarFin()) return;
    pensando = true;
    pintarSesion();
    const r = await corregirJugada(fenAntes, m.lan, { profundidad: 12 });
    pensando = false;
    if (!activa) return;
    const limite = modo === "apertura" ? 10 : 15;
    if (r.perdida >= limite) {
      cuenta.errores += 1;
      enPausa = true;
      mensaje = `✘ <b>${esc(m.san)}</b> es un error: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar.
        Lo mejor era <b class="txt-bien">${esc(r.mejorSan)}</b>. ¿Deshaces y pruebas otra?`;
      claseMsg = "mal";
      return pintarSesion();
    }
    if (modo === "apertura") {
      if (r.perdida >= 5) {
        cuenta.imprecisiones += 1;
        mensaje = `<b>${esc(m.san)}</b> es una imprecisión (−${r.perdida.toFixed(0)}). Mejor era <b>${esc(r.mejorSan)}</b>.`;
        claseMsg = "c-imprecision";
      } else {
        cuenta.buenas += 1;
        mensaje = r.esLaMejor ? `✔ <b>${esc(m.san)}</b>: ¡la mejor jugada!` : `✔ <b>${esc(m.san)}</b>: buena jugada.`;
        claseMsg = "ok";
      }
    } else { mensaje = ""; claseMsg = ""; }
    siguienteTurno();
  }

  // ---------------------------------------------------------------- fin
  function comprobarFin() {
    if (terminado || !def) return terminado;
    if (modo === "apertura") {
      if (juego.history().length >= 2 * JUGADAS_APERTURA && juego.turn() === miColor) {
        const ok = cuenta.errores === 0;
        terminar(ok, `Apertura completada: ${cuenta.buenas} jugadas buenas, ${cuenta.imprecisiones} imprecisiones y ${cuenta.errores} errores.` +
          (ok ? " ¡Superada!" : " Repítela hasta hacerla sin errores."));
        return true;
      }
      return false;
    }
    const hist = juego.history({ verbose: true });
    const ultima = hist[hist.length - 1];
    const mias = hist.filter((m) => m.color === miColor).length;
    if (def.objetivo === "mate") {
      if (juego.isCheckmate()) { terminar(juego.turn() !== miColor, juego.turn() !== miColor ? `¡Mate en ${mias} jugadas!` : "Te han dado mate."); return true; }
      if (juego.isDraw()) { terminar(false, "Tablas: se ha escapado la victoria (¿ahogado?). Prueba otra vez."); return true; }
    }
    if (def.objetivo === "coronar") {
      if (ultima && ultima.color === miColor && ultima.promotion) {
        if (juego.isDraw()) { terminar(false, "Has coronado, pero es ahogado: tablas. ¡Mira las casillas del rey!"); return true; }
        terminar(true, `¡Peón coronado en ${mias} jugadas!`); return true;
      }
      if (juego.isDraw()) { terminar(false, "Tablas: el peón se ha perdido o es ahogado. Prueba otra vez."); return true; }
    }
    if (def.objetivo === "tablas") {
      if (juego.isDraw()) { terminar(true, `¡Tablas conseguidas en ${mias} jugadas!`); return true; }
      if (ultima && ultima.color !== miColor && ultima.promotion) { terminar(false, "El rival ha coronado. Ponte delante del peón y busca la oposición."); return true; }
    }
    return false;
  }

  async function terminar(exito, texto) {
    terminado = true; enPausa = false;
    mensaje = (exito ? "🏆 " : "✘ ") + texto;
    claseMsg = exito ? "ok" : "mal";
    pintarSesion();
    await apuntarProgreso(estado.usuario, `${modo}-${def.id}`, exito);
  }

  // ---------------------------------------------------------------- ayudas
  function deshacer() {
    if (pensando || juego.history().length === 0) return;
    enPausa = false; terminado = false;
    if (juego.turn() === miColor) juego.undo();
    juego.undo();
    if (modo === "apertura") paso = Math.min(paso, juego.history().length);
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    mensaje = "Jugada deshecha."; claseMsg = "c-imprecision";
    siguienteTurno();
  }

  async function pista() {
    if (pensando || enPausa || terminado || juego.turn() !== miColor) return;
    if (enLinea()) { mensaje = `En esta apertura se juega <b>${esc(def.secuencia[paso])}</b>.`; claseMsg = "c-imprecision"; return pintarSesion(); }
    const [l] = await motor().analizar(juego.fen(), { profundidad: 14 });
    if (!activa) return;
    tablero.ultimaJugada(l.pv[0].slice(0, 2) + l.pv[0].slice(0, 2));
    mensaje = "💡 Pista: mueve la pieza resaltada."; claseMsg = "c-imprecision";
    pintarSesion();
  }

  pintarLista();
  return () => { activa = false; };
}
