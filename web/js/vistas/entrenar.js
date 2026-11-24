// Entrenar aperturas y finales, con tres pestañas en cada uno:
//   Tuyas        -> sacadas de TUS partidas (tus líneas más repetidas / tus finales reales)
//   Recomendadas -> variantes y relacionadas de lo que más juegas, para salir de tu zona de confort
//   Guía         -> catálogo completo (web/js/catalogo.json, verificado con Stockfish)
//
// Sesión de APERTURA: juegas la línea (si te sales, te lo dice); después juego libre hasta la
//   jugada 10 con un rival que elige entre las mejores jugadas y Stockfish corrige las tuyas.
// Sesión de FINAL: posición contra Stockfish con un objetivo: mate, coronar, ganar, tablas
//   o "aguantar" (que la posición no empeore durante N jugadas).

import { apuntarProgreso, todoElProgreso, todosDeUsuario } from "../almacen.js";
import { corregirJugada, revisar } from "../analizador.js";
import { motor, probGanar } from "../motor.js";
import { FLECHA, Tablero, disposicion, fichaJugador } from "../tablero.js";
import { aperturaEs } from "../lenguaje.js";
import { chip, corta, instruccion, usarTablero } from "../notacion.js";
import { $, Chess, esc, fecha, leerPartida, resumen } from "../util.js";

const JUGADAS_APERTURA = 10;  // jugadas de cada bando que dura un entrenamiento de apertura
const JUGADAS_TUS_FINALES = 12;
const OBJETIVOS = {
  mate: "Objetivo: dar jaque mate.",
  coronar: "Objetivo: coronar un peón.",
  ganar: "Objetivo: ganar (dar mate o dejar al rival solo con el rey).",
  tablas: "Objetivo: conseguir tablas. Stockfish intentará ganarte.",
  aguantar: "Objetivo: que tu posición no empeore.",
};
const COLOR = { w: "blancas", b: "negras" };
const NOMBRE_PZ = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
let catalogo = null; // se carga una vez

export async function montar(vista, { estado }) {
  vista.innerHTML = disposicion("Entrenar");
  $("#barra").classList.add("oculto");
  $("#cuerpo").innerHTML = `<p class="cargando">Cargando…</p>`;
  if (!catalogo) catalogo = await (await fetch("js/catalogo.json")).json();
  const porId = new Map([...catalogo.aperturas, ...catalogo.finales].map((x) => [x.id, x]));

  let seccion = "aperturas";   // aperturas | finales
  let pestana = "tuyas";       // tuyas | recomendadas | guia
  let filtroColor = "";
  let def = null;              // entrenamiento elegido (de cualquier pestaña)
  let juego = new Chess();
  let miColor = "w";
  let paso = 0;                // jugadas de la línea de apertura ya hechas
  let pensando = false, enPausa = false, terminado = false;
  let cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };
  let mensaje = "", claseMsg = "", nota = "";
  let guiar = true, ayudaFlecha = false;   // guía paso a paso y flecha de ayuda (solo aperturas)
  let activa = true;
  let progreso = await todoElProgreso(estado.usuario);

  // ---------------------------------------------------------------- datos del usuario
  const partidas = await todosDeUsuario("partidas", estado.usuario);
  const resumenes = partidas.map((p) => ({ p, r: resumen(p) }));
  const lineasTuyas = calcularLineas(resumenes);
  const finalesTuyos = await calcularFinales(partidas, estado.usuario);

  const tablero = new Tablero($("#tablero"), {
    juego: () => juego,
    puedeMover: () => !!def && !pensando && !enPausa && !terminado && juego.turn() === miColor,
    alMover: (m) => tuJugada(m),
  });
  usarTablero(tablero);

  const esApertura = () => !!def?.secuencia;
  const enLinea = () => esApertura() && paso < def.secuencia.length;

  // Línea como texto corto con los tres formatos (para las listas).
  const lineaNota = (s) => {
    const g = new Chess();
    return s.map((x, i) => { const f = g.fen(); try { g.move(x); } catch { /* línea rota */ } return (i % 2 === 0 ? `${i / 2 + 1}.` : "") + corta(f, x); }).join(" ");
  };

  // La línea de apertura como pasos (no como cadena): hechos, el de ahora y los que faltan.
  function pasosHtml() {
    if (!esApertura()) return "";
    const g = new Chess();
    const items = def.secuencia.map((san, i) => {
      const f = g.fen();
      try { g.move(san); } catch { /* línea rota */ }
      const mio = (i % 2 === 0) === (miColor === "w");
      const est = i < paso ? "hecho" : i === paso ? "ahora" : "";
      return `<li class="${est} ${mio ? "mio" : "rival"}"><span class="quien">${mio ? "Tú" : "Rival"}</span> ${chip(f, san, mio ? "mejor" : "jugada")}</li>`;
    });
    return `<details open class="pasos-linea"><summary>La línea, paso a paso</summary><ol>${items.join("")}</ol></details>`;
  }

  // ---------------------------------------------------------------- listas
  function pintarLista() {
    def = null;
    juego = new Chess();
    tablero.orientar("w");
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    tablero.quitarFlechas();
    $("#j-arriba").innerHTML = ""; $("#j-abajo").innerHTML = "";

    let contenido = "";
    if (seccion === "aperturas") contenido = pestana === "tuyas" ? htmlTusAperturas() : pestana === "recomendadas" ? htmlRecomendadasAperturas() : htmlGuiaAperturas();
    else contenido = pestana === "tuyas" ? htmlTusFinales() : pestana === "recomendadas" ? htmlRecomendadosFinales() : htmlGuiaFinales();

    $("#cuerpo").innerHTML = `
      <div class="pestanas">
        <button class="pestana ${seccion === "aperturas" ? "activa" : ""}" data-seccion="aperturas">Aperturas</button>
        <button class="pestana ${seccion === "finales" ? "activa" : ""}" data-seccion="finales">Finales</button>
      </div>
      <div class="subpestanas">
        ${[["tuyas", seccion === "aperturas" ? "Tus aperturas" : "Tus finales"], ["recomendadas", "Recomendadas"], ["guia", "Guía completa"]]
          .map(([id, txt]) => `<button class="subpestana ${pestana === id ? "activa" : ""}" data-pestana="${id}">${txt}</button>`).join("")}
      </div>
      ${contenido}`;
    $("#cuerpo").querySelectorAll("[data-seccion]").forEach((b) => (b.onclick = () => { seccion = b.dataset.seccion; pintarLista(); }));
    $("#cuerpo").querySelectorAll("[data-pestana]").forEach((b) => (b.onclick = () => { pestana = b.dataset.pestana; pintarLista(); }));
    $("#cuerpo").querySelectorAll("[data-entreno]").forEach((b) => (b.onclick = () => empezar(JSON.parse(b.dataset.entreno))));
    const fc = $("#f-color");
    if (fc) fc.onchange = () => { filtroColor = fc.value; pintarLista(); };
  }

  // Botón de un entrenamiento. 'datos' es lo necesario para empezarlo.
  function boton(datos, titulo, sub, extra = "") {
    const hecho = progreso.get(datos.progresoId)?.aciertos;
    return `<button class="entreno" data-entreno='${esc(JSON.stringify(datos))}'>
      <b>${titulo}</b>${hecho ? `<span class="hecho">✔ superado ${hecho}×</span>` : ""}${extra}<br>
      <span class="suave">${sub}</span></button>`;
  }

  const botonApertura = (a, extra = "") => boton({ tipo: "catalogo", id: a.id, progresoId: `apertura-${a.id}` }, esc(a.nombre),
    `Con ${COLOR[a.color]} · ${lineaNota(a.secuencia)} · ${a.nivel}`, extra);
  const botonFinal = (f) => boton({ tipo: "catalogo", id: f.id, progresoId: `final-${f.id}` }, esc(f.nombre),
    `${f.nivel} · ${OBJETIVOS[f.objetivo]}${f.jugadas ? ` (${f.jugadas} jugadas)` : ""}`);

  function htmlTusAperturas() {
    if (!lineasTuyas.length) return `<p class="suave">Aún no hay suficientes partidas para encontrar líneas repetidas (hace falta que una línea aparezca en 3 partidas o más).</p>`;
    const bloque = (color) => {
      const ls = lineasTuyas.filter((l) => l.color === color);
      if (!ls.length) return "";
      return `<h3 class="grupo">Con ${COLOR[color]}</h3><div class="lista-entrenos">${ls.map((l) =>
        boton({ tipo: "tuya", secuencia: l.secuencia, color, nombre: l.nombre, progresoId: `tuya-${l.secuencia.join("_")}` },
          esc(l.nombre), `${lineaNota(l.secuencia)} · en ${l.n} partidas · ${Math.round((100 * l.v) / l.n)}% de victorias`,
          l.v / l.n < 0.4 && l.n >= 3 ? ` <span class="etiqueta mal">te cuesta</span>` : "")).join("")}</div>`;
    };
    return `<p class="suave pequeno">Las líneas que más repites en tus partidas. Al entrenarlas, Stockfish te avisa si tu jugada habitual no es la mejor.</p>
      ${bloque("w")}${bloque("b")}`;
  }

  function htmlRecomendadasAperturas() {
    // Tus familias de aperturas por color, de más a menos jugadas.
    const familias = {};
    for (const { r } of resumenes) {
      const k = `${r.color}|${r.familia}`;
      (familias[k] ||= { color: r.color, familia: r.familia, n: 0, v: 0 }).n += 1;
      if (r.resultado === "victoria") familias[k].v += 1;
    }
    const tuyas = Object.values(familias).filter((f) => f.n >= 2).sort((a, b) => b.n - a.n);
    const vistas = new Set();
    let variantes = "", relacionadas = [];
    for (const f of tuyas) {
      const entradas = catalogo.aperturas.filter((a) => a.familia === f.familia && a.color === f.color && !vistas.has(a.id));
      if (!entradas.length) continue;
      entradas.forEach((a) => vistas.add(a.id));
      const pct = Math.round((100 * f.v) / f.n);
      variantes += `<h3 class="grupo">${esc(aperturaEs(f.familia))} con ${COLOR[f.color]}
        <span class="suave">(${f.n} partidas, ${pct}% victorias)${pct < 40 ? ` <span class="etiqueta mal">te cuesta</span>` : ""}</span></h3>
        <div class="lista-entrenos">${entradas.map((a) => botonApertura(a)).join("")}</div>`;
      for (const a of entradas) relacionadas.push(...a.relacionadas);
    }
    relacionadas = [...new Set(relacionadas)].filter((id) => !vistas.has(id)).map((id) => porId.get(id)).filter(Boolean).slice(0, 8);
    if (!variantes) {
      const inicio = ["italiana", "caro-kann-clasica", "londres", "peon-dama"].map((id) => porId.get(id));
      return `<p class="suave pequeno">Cuando tengas más partidas, aquí verás variantes de lo que juegas. Para empezar, un repertorio sencillo:</p>
        <div class="lista-entrenos">${inicio.map((a) => botonApertura(a)).join("")}</div>`;
    }
    return `<p class="suave pequeno">Variantes de las aperturas que más juegas y, debajo, otras relacionadas para salir de tu zona de confort.</p>
      ${variantes}
      ${relacionadas.length ? `<h3 class="grupo">Para salir de tu zona de confort</h3>
        <div class="lista-entrenos">${relacionadas.map((a) => botonApertura(a)).join("")}</div>` : ""}`;
  }

  function htmlGuiaAperturas() {
    const grupos = {};
    catalogo.aperturas.filter((a) => !filtroColor || a.color === filtroColor).forEach((a) => (grupos[a.grupo] ||= []).push(a));
    return `<div class="filtros compactos"><select id="f-color">
        <option value="">Blancas y negras</option><option value="w" ${filtroColor === "w" ? "selected" : ""}>Para jugar con blancas</option>
        <option value="b" ${filtroColor === "b" ? "selected" : ""}>Para jugar con negras</option></select>
        <span class="suave pequeno" style="align-self:center">${catalogo.aperturas.length} aperturas, todas comprobadas con Stockfish</span></div>
      ${Object.entries(grupos).map(([g, as]) => `<h3 class="grupo">${esc(g)}</h3>
        <div class="lista-entrenos">${as.map((a) => botonApertura(a)).join("")}</div>`).join("")}`;
  }

  function htmlTusFinales() {
    if (!finalesTuyos.length) return `<p class="suave">Aquí aparecerán las posiciones de final de tus partidas <b>analizadas</b>.
      <a href="#/partidas">Elige partidas para analizar</a>.</p>`;
    const porTipo = {};
    finalesTuyos.forEach((f) => (porTipo[f.tipoFinal] ||= []).push(f));
    const orden = Object.entries(porTipo).sort((a, b) => b[1].length - a[1].length);
    return `<p class="suave pequeno">La posición de cada partida tuya en el momento en que empezó el final. Objetivo: jugar
      ${JUGADAS_TUS_FINALES} jugadas contra Stockfish sin que tu posición empeore.</p>
      <p class="pequeno">Tus finales más frecuentes: ${orden.map(([t, l]) => `<b>${esc(t)}</b> (${l.length})`).join(" · ")}</p>
      ${orden.map(([t, lista]) => `<h3 class="grupo">${esc(t)}</h3><div class="lista-entrenos">${lista.map((f) =>
        boton({ tipo: "tuyo", fen: f.fen, color: f.color, wpInicial: f.wpInicial, nombre: `Final vs ${f.rival}`, progresoId: `tuyo-${f.id}` },
          `vs ${esc(f.rival)} <span class="suave">(${f.fecha})</span>`,
          `Juegas con ${COLOR[f.color]} · tu probabilidad de ganar al empezar: ${f.wpInicial.toFixed(0)}% · ${f.resultadoTxt}`)).join("")}</div>`).join("")}`;
  }

  function htmlRecomendadosFinales() {
    const tipos = {};
    finalesTuyos.forEach((f) => (tipos[f.tipoFinal] = (tipos[f.tipoFinal] || 0) + 1));
    const orden = Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const ids = [];
    for (const t of orden) for (const id of catalogo.recomendacionesFinales[t] || []) if (!ids.includes(id)) ids.push(id);
    for (const id of ["mate-dama", "mate-torre", "oposicion"]) if (!ids.includes(id)) ids.push(id); // imprescindibles
    return `<p class="suave pequeno">${orden.length ? `Según tus finales más frecuentes (${orden.map(esc).join(", ")}),
      estas posiciones teóricas son las que más te van a servir.` : "Los finales básicos que todo jugador debe dominar."}</p>
      <div class="lista-entrenos">${ids.map((id) => botonFinal(porId.get(id))).join("")}</div>`;
  }

  function htmlGuiaFinales() {
    const grupos = {};
    catalogo.finales.forEach((f) => (grupos[f.grupo] ||= []).push(f));
    return `<p class="suave pequeno">${catalogo.finales.length} finales, del mate con dama a la posición de Lucena.</p>
      ${Object.entries(grupos).map(([g, fs]) => `<h3 class="grupo">${esc(g)}</h3>
        <div class="lista-entrenos">${fs.map((f) => botonFinal(f)).join("")}</div>`).join("")}`;
  }

  // ---------------------------------------------------------------- sesión
  async function empezar(datos) {
    if (datos.tipo === "catalogo") def = { ...porId.get(datos.id), progresoId: datos.progresoId };
    else if (datos.tipo === "tuya") def = { id: datos.progresoId, nombre: datos.nombre, color: datos.color, secuencia: datos.secuencia,
      progresoId: datos.progresoId, tuya: true, ideas: ["Es una línea que juegas a menudo: practícala hasta hacerla sin pensar.", "Stockfish te avisará si alguna de tus jugadas de siempre no es la mejor."] };
    else def = { id: datos.progresoId, nombre: datos.nombre, color: datos.color, fen: datos.fen, objetivo: "aguantar",
      jugadas: JUGADAS_TUS_FINALES, wpInicial: datos.wpInicial, progresoId: datos.progresoId,
      ideas: ["Es una posición real de tus partidas. Piensa en el plan: activa el rey, crea peones pasados, corta al rey rival."] };
    miColor = def.color;
    juego = new Chess(def.fen || undefined);
    paso = 0; cuenta = { buenas: 0, imprecisiones: 0, errores: 0 };
    pensando = false; enPausa = false; terminado = false; nota = "";
    mensaje = esApertura() ? "Empieza jugando la línea." : ""; claseMsg = "";
    tablero.orientar(miColor);
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    tablero.quitarFlechas();
    $("#j-abajo").innerHTML = fichaJugador(esc(estado.usuario), `(${COLOR[miColor]})`);
    $("#j-arriba").innerHTML = fichaJugador("Stockfish", esApertura() ? "(rival variado)" : "(a tope)");
    // Para "aguantar" necesitamos saber cómo está la posición al empezar.
    if (def.objetivo === "aguantar" && def.wpInicial == null) {
      pensando = true; pintarSesion();
      const [l] = await motor().analizar(juego.fen(), { profundidad: 14 });
      def.wpInicial = probGanar((miColor === "w" ? 1 : -1) * l.cp);
      pensando = false;
    }
    pintarSesion();
    siguienteTurno();
  }

  const misJugadas = () => juego.history({ verbose: true }).filter((m) => m.color === miColor).length;

  function pintarSesion() {
    let objetivo = `Juegas con ${COLOR[miColor]}. `;
    if (esApertura()) objetivo += "Aprende esta línea jugándola.";
    else {
      objetivo += OBJETIVOS[def.objetivo];
      if (def.objetivo === "aguantar") objetivo += ` Juega ${def.jugadas} jugadas (llevas ${misJugadas()}).`;
      if (def.referencia) objetivo += ` Un buen jugador lo consigue en unas ${def.referencia} jugadas.`;
    }
    const estadoTxt = terminado ? "" : pensando ? "Pensando…" : juego.turn() === miColor ? "Te toca." : "";
    const toca = esApertura() && enLinea() && juego.turn() === miColor && !pensando && !terminado && !enPausa;
    const guia = toca && guiar ? `<p class="guia"><span class="et">Tu turno</span><b>${instruccion(juego.fen(), def.secuencia[paso])}.</b></p>` : "";
    const ajustes = esApertura() ? `<div class="ajustes-guia">
        <label class="opcion"><input type="checkbox" id="chk-guiar" ${guiar ? "checked" : ""}> Decirme qué mover</label>
        <label class="opcion"><input type="checkbox" id="chk-flecha" ${ayudaFlecha ? "checked" : ""}> Flecha de ayuda</label></div>` : "";
    $("#cuerpo").innerHTML = `
      <p><a href="#" id="volver">← Elegir otro</a></p>
      <div class="comentario ${claseMsg}">
        <div class="cabeza"><b>${esc(def.nombre)}</b><span class="ev">${estadoTxt}</span></div>
        <p class="suave pequeno">${objetivo}</p>
        ${mensaje ? `<p>${mensaje}</p>` : ""}${guia}
        ${nota ? `<p class="nota-linea">${nota}</p>` : ""}
        ${enPausa ? `<div class="botones"><button class="principal" id="btn-deshacer-aviso">Deshacer y probar otra</button>
          <button id="btn-seguir">Seguir igualmente</button></div>` : ""}
        <div class="botones" style="margin-top:8px">
          <button id="btn-reiniciar">↺ Empezar de nuevo</button><button id="btn-deshacer">↶ Deshacer</button>
          <button id="btn-pista">💡 Pista</button>
        </div>
      </div>
      ${ajustes}${pasosHtml()}
      <details open class="ideas"><summary>Ideas clave</summary><ul>${(def.ideas || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>
      <p class="linea-texto">${textoJugadas() || '<span class="suave">Las jugadas que hagas aparecerán aquí.</span>'}</p>`;
    $("#volver").onclick = async (e) => { e.preventDefault(); progreso = await todoElProgreso(estado.usuario); pintarLista(); };
    $("#btn-reiniciar").onclick = () => empezar(def.secuencia && !def.tuya ? { tipo: "catalogo", id: def.id, progresoId: def.progresoId }
      : def.tuya ? { tipo: "tuya", secuencia: def.secuencia, color: def.color, nombre: def.nombre, progresoId: def.progresoId }
      : porId.has(def.id) ? { tipo: "catalogo", id: def.id, progresoId: def.progresoId }
      : { tipo: "tuyo", fen: def.fen, color: def.color, wpInicial: def.wpInicial, nombre: def.nombre, progresoId: def.progresoId });
    $("#btn-deshacer").onclick = deshacer;
    $("#btn-pista").onclick = pista;
    if ($("#chk-guiar")) $("#chk-guiar").onchange = (e) => { guiar = e.target.checked; pintarSesion(); };
    if ($("#chk-flecha")) $("#chk-flecha").onchange = (e) => { ayudaFlecha = e.target.checked; pintarSesion(); };
    tablero.quitarFlechas();
    if (toca && ayudaFlecha) {
      const mv = (() => { try { return new Chess(juego.fen()).move(def.secuencia[paso]); } catch { return null; } })();
      if (mv) tablero.flecha(mv.lan, FLECHA.mejor);
    }
    if (enPausa) {
      $("#btn-deshacer-aviso").onclick = deshacer;
      $("#btn-seguir").onclick = () => { enPausa = false; mensaje = ""; claseMsg = ""; siguienteTurno(); };
    }
  }

  function textoJugadas() {
    const g = new Chess(def.fen || undefined);
    let texto = "";
    for (const san of juego.history()) {
      const [, color, , , , num] = g.fen().split(" ");
      if (color === "w") texto += `${num}. `;
      else if (!texto) texto += `${num}… `;
      texto += corta(g.fen(), san) + " ";
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
        if (!activa || !def || !enLinea()) return;
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
    if (esApertura()) {
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
        mensaje = def.tuya ? `En tus partidas aquí sueles jugar ${chip(fenAntes, esperada, "mejor")}. ¡Prueba esa!`
          : `En la ${esc(def.nombre)} aquí se juega ${chip(fenAntes, esperada, "mejor")}. ¡Prueba otra vez!`;
        claseMsg = "c-imprecision";
        return pintarSesion();
      }
      paso += 1;
      tablero.posicion(juego.fen(), false);
      tablero.ultimaJugada(m.lan);
      mensaje = paso >= def.secuencia.length ? "✔ Línea completada. Ahora juega libre: Stockfish corregirá cada jugada." : "✔ Correcto.";
      claseMsg = "ok";
      // En TUS líneas, comprobamos si tu jugada habitual es buena (sin bloquear la partida).
      if (def.tuya) revisarHabitual(fenAntes, m);
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
    const limite = esApertura() ? 10 : 15;
    if (r.perdida >= limite) {
      cuenta.errores += 1;
      enPausa = true;
      mensaje = `✘ ${chip(fenAntes, m.san, "error")} es un error: pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar.
        Lo mejor era ${chip(fenAntes, r.mejorSan, "mejor")}. ¿Deshaces y pruebas otra?`;
      claseMsg = "mal";
      return pintarSesion();
    }
    if (esApertura()) {
      if (r.perdida >= 5) {
        cuenta.imprecisiones += 1;
        mensaje = `${chip(fenAntes, m.san, "jugada")} es una imprecisión (−${r.perdida.toFixed(0)}). Mejor era ${chip(fenAntes, r.mejorSan, "mejor")}.`;
        claseMsg = "c-imprecision";
      } else {
        cuenta.buenas += 1;
        mensaje = r.esLaMejor ? `✔ ${chip(fenAntes, m.san, "mejor")}: ¡la mejor jugada!` : `✔ ${chip(fenAntes, m.san, "jugada")}: buena jugada.`;
        claseMsg = "ok";
      }
    } else { mensaje = ""; claseMsg = ""; }
    siguienteTurno();
  }

  async function revisarHabitual(fenAntes, m) {
    const r = await corregirJugada(fenAntes, m.lan, { profundidad: 14 });
    if (!activa || !def?.tuya) return;
    if (r.perdida >= 5) {
      nota = `⚠ Ojo: ${chip(fenAntes, m.san, "error")} es tu jugada habitual aquí, pero Stockfish prefiere ${chip(fenAntes, r.mejorSan, "mejor")}
        (pierdes ${r.perdida.toFixed(0)} puntos de probabilidad de ganar). Quizá te convenga cambiarla.`;
      pintarSesion();
    }
  }

  // ---------------------------------------------------------------- fin de la sesión
  function comprobarFin() {
    if (terminado || !def) return terminado;
    if (esApertura()) {
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
    const n = misJugadas();
    if (juego.isCheckmate()) {
      const gano = juego.turn() !== miColor;
      terminar(gano, gano ? `¡Jaque mate en ${n} jugadas!` : "Te han dado mate.");
      return true;
    }
    const obj = def.objetivo;
    if (obj === "mate" && juego.isDraw()) { terminar(false, "Tablas: se ha escapado la victoria (¿ahogado?). Prueba otra vez."); return true; }
    if (obj === "coronar") {
      if (ultima && ultima.color === miColor && ultima.promotion) {
        if (juego.isDraw()) { terminar(false, "Has coronado, pero es ahogado: tablas."); return true; }
        terminar(true, `¡Peón coronado en ${n} jugadas!`); return true;
      }
      if (juego.isDraw()) { terminar(false, "Tablas: el peón se ha perdido o es ahogado. Prueba otra vez."); return true; }
    }
    if (obj === "ganar") {
      if (soloRey(juego, miColor === "w" ? "b" : "w") && tienePiezaMayor(juego, miColor)) { terminar(true, `¡Ganado! El rival se ha quedado solo con el rey (${n} jugadas).`); return true; }
      if (juego.isDraw()) { terminar(false, "Tablas: se ha escapado la victoria. Prueba otra vez."); return true; }
    }
    if (obj === "tablas") {
      if (juego.isDraw()) { terminar(true, `¡Tablas conseguidas en ${n} jugadas!`); return true; }
      if (ultima && ultima.color !== miColor && ultima.promotion) { terminar(false, "El rival ha coronado. Ponte delante del peón y busca la oposición."); return true; }
    }
    if (obj === "aguantar") {
      if (juego.isDraw()) { terminar(def.wpInicial <= 60, def.wpInicial <= 60 ? "¡Tablas! Objetivo cumplido." : "Tablas, pero estabas mejor: se podía ganar."); return true; }
      if (n >= def.jugadas && juego.turn() !== miColor) { evaluarAguante(); return true; }
    }
    return false;
  }

  async function evaluarAguante() {
    terminado = true; pensando = true; pintarSesion();
    const [l] = await motor().analizar(juego.fen(), { profundidad: 14 });
    if (!activa) return;
    pensando = false;
    const wpFinal = probGanar((miColor === "w" ? 1 : -1) * l.cp);
    const ok = wpFinal >= def.wpInicial - 10;
    terminado = false;
    terminar(ok, `${def.jugadas} jugadas hechas. Tu probabilidad de ganar pasó de ${def.wpInicial.toFixed(0)}% a ${wpFinal.toFixed(0)}%.` +
      (ok ? " ¡Has mantenido la posición!" : " La posición ha empeorado: repítelo y busca un plan mejor."));
  }

  async function terminar(exito, texto) {
    if (terminado) return;
    terminado = true; enPausa = false;
    mensaje = (exito ? "🏆 " : "✘ ") + texto;
    claseMsg = exito ? "ok" : "mal";
    pintarSesion();
    await apuntarProgreso(estado.usuario, def.progresoId, exito);
  }

  // ---------------------------------------------------------------- ayudas
  function deshacer() {
    if (pensando || juego.history().length === 0) return;
    enPausa = false; terminado = false;
    if (juego.turn() === miColor) juego.undo();
    juego.undo();
    if (esApertura()) paso = Math.min(paso, juego.history().length);
    tablero.posicion(juego.fen(), false);
    tablero.ultimaJugada(null);
    mensaje = "Jugada deshecha."; claseMsg = "c-imprecision";
    siguienteTurno();
  }

  async function pista() {
    if (pensando || enPausa || terminado || juego.turn() !== miColor) return;
    if (enLinea()) {
      const mv = (() => { try { return new Chess(juego.fen()).move(def.secuencia[paso]); } catch { return null; } })();
      if (mv) tablero.ultimaJugada(mv.from + mv.from);   // resalta la pieza que hay que mover
      mensaje = `💡 ${mv ? instruccion(juego.fen(), def.secuencia[paso]) : "Sigue la línea"}.`; claseMsg = "c-imprecision";
      return pintarSesion();
    }
    const [l] = await motor().analizar(juego.fen(), { profundidad: 14 });
    if (!activa) return;
    tablero.ultimaJugada(l.pv[0].slice(0, 2) + l.pv[0].slice(0, 2));
    const pz = juego.get(l.pv[0].slice(0, 2));
    mensaje = `💡 Pista: mueve ${pz ? `el ${NOMBRE_PZ[pz.type]} de ${l.pv[0].slice(0, 2)}` : "la pieza resaltada"}.`; claseMsg = "c-imprecision";
    pintarSesion();
  }

  pintarLista();
  return () => { activa = false; };
}

// ------------------------------------------------------------------ cálculos sobre tus partidas
// Tus líneas más repetidas: para cada partida, la secuencia más larga (hasta 12 medias jugadas)
// que se repite en al menos 3 de tus partidas con ese color.
function calcularLineas(resumenes) {
  const MAX = 12, MIN_PARTIDAS = 3, MIN_PLIES = 4;
  const lineas = new Map();
  for (const color of ["w", "b"]) {
    const juegos = resumenes.filter(({ r }) => r.color === color).map(({ p, r }) => {
      try { return { sans: leerPartida(p).jugadas.slice(0, MAX).map((j) => j.san), r }; } catch { return null; }
    }).filter(Boolean);
    const cuenta = new Map();
    for (const j of juegos) for (let k = MIN_PLIES; k <= j.sans.length; k++) {
      const clave = j.sans.slice(0, k).join(" ");
      cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
    }
    for (const j of juegos) {
      let mejor = null;
      for (let k = MIN_PLIES; k <= j.sans.length; k++) {
        const clave = j.sans.slice(0, k).join(" ");
        if ((cuenta.get(clave) || 0) >= MIN_PARTIDAS) mejor = clave; else break;
      }
      if (!mejor) continue;
      const l = lineas.get(color + mejor) || { color, secuencia: mejor.split(" "), n: cuenta.get(mejor), v: 0, nombres: {} };
      lineas.set(color + mejor, l);
    }
    // victorias y nombre más habitual de cada línea
    for (const l of [...lineas.values()].filter((x) => x.color === color)) {
      const clave = l.secuencia.join(" ");
      const suyas = juegos.filter((j) => j.sans.slice(0, l.secuencia.length).join(" ") === clave);
      l.v = suyas.filter((j) => j.r.resultado === "victoria").length;
      // Nombre general de la apertura (la variante exacta de cada partida suele ir más allá de la línea).
      suyas.forEach((j) => (l.nombres[j.r.familia] = (l.nombres[j.r.familia] || 0) + 1));
    }
  }
  return [...lineas.values()]
    .map((l) => ({ ...l, nombre: aperturaEs(Object.entries(l.nombres).sort((a, b) => b[1] - a[1])[0]?.[0]) || "Tu línea" }))
    .sort((a, b) => b.n - a.n || b.secuencia.length - a.secuencia.length)
    .filter((l, i, todas) => todas.findIndex((o) => o.color === l.color && o.secuencia.join(" ") === l.secuencia.join(" ")) === i)
    .slice(0, 12);
}

// Tus finales: la posición de cada partida analizada cuando empezó el final (y te tocaba mover).
async function calcularFinales(partidas, usuario) {
  const analisis = new Map((await todosDeUsuario("analisis", usuario)).map((a) => [a.url, a]));
  const lista = [];
  for (const p of partidas) {
    const a = analisis.get(p.url);
    if (!a) continue;
    const r = resumen(p);
    const rev = revisar(p, a);
    const i = rev.jugadas.findIndex((m) => m.fase === "final" && m.color === r.color);
    if (i < 0) continue;
    const m = rev.jugadas[i];
    const g = new Chess(m.fenAntes);
    if (g.moves().length === 0) continue;
    const cp = a.evals[i].cp;
    lista.push({
      id: `${p.id}-${i}`, fen: m.fenAntes, color: r.color, rival: r.rival.username, fecha: fecha(p.end_time),
      wpInicial: probGanar((r.color === "w" ? 1 : -1) * cp), tipoFinal: tipoDeFinal(g),
      resultadoTxt: `en la partida: ${r.resultado}`,
    });
  }
  return lista.sort((x, y) => y.id.localeCompare(x.id));
}

// Tipo de final según las piezas que quedan (sin contar reyes ni peones).
function tipoDeFinal(g) {
  const piezas = { q: 0, r: 0, b: 0, n: 0 };
  for (const fila of g.board()) for (const c of fila) if (c && c.type in piezas) piezas[c.type] += 1;
  const { q, r, b, n } = piezas;
  if (!q && !r && !b && !n) return "Peones";
  if (q) return "Con damas";
  if (r && !b && !n) return "Torres";
  if (!r) return "Piezas menores";
  return "Torres y piezas menores";
}

function soloRey(g, color) {
  for (const fila of g.board()) for (const c of fila) if (c && c.color === color && c.type !== "k") return false;
  return true;
}

function tienePiezaMayor(g, color) {
  for (const fila of g.board()) for (const c of fila) if (c && c.color === color && (c.type === "q" || c.type === "r")) return true;
  return false;
}
