// Informe: estadísticas de tus partidas y tus 3 errores más repetidos, con un consejo para cada uno.

import { todosDeUsuario } from "../almacen.js";
import { revisar } from "../analizador.js";
import { $, MOTIVOS, RITMOS, esc, fecha, resumen } from "../util.js";

const pct = (a, b) => (b ? (100 * a) / b : 0);
const FASES = ["apertura", "medio juego", "final"];
const NOMBRE_FASE = { apertura: "Apertura", "medio juego": "Medio juego", final: "Final" };
const TIPOS = {
  material: "Pierdes material (pieza colgada, ataque doble…)", mate_contra: "Permites un mate",
  mate_perdido: "No ves un mate a tu favor", tactica: "Otro error táctico o posicional",
};

function barra(valor, maximo, clase = "") {
  return `<div class="barrita ${clase}"><span style="width:${Math.min(100, pct(valor, maximo)).toFixed(0)}%"></span></div>`;
}

export async function montar(vista, { estado }) {
  vista.innerHTML = `<div class="cabecera-vista"><h1>Informe</h1><span class="suave" id="estado-inf"></span></div>
    <div id="informe" class="informe"><p class="cargando">Calculando…</p></div>`;
  let activa = true;

  async function calcular() {
    const [partidas, analisis] = await Promise.all([
      todosDeUsuario("partidas", estado.usuario), todosDeUsuario("analisis", estado.usuario)]);
    const porUrl = new Map(analisis.map((a) => [a.url, a]));
    const juegos = partidas.map((p) => {
      const r = resumen(p);
      const a = porUrl.get(p.url);
      const rev = a ? revisar(p, a) : null;
      const mias = rev ? rev.jugadas.filter((m) => m.color === r.color) : [];
      return {
        p, r, rev, mias,
        precision: rev ? (r.color === "w" ? rev.blancas : rev.negras).precision : null,
        maxVentaja: rev ? rev.maxVentaja[r.color] : 0,
      };
    }).sort((a, b) => a.p.end_time - b.p.end_time);
    pintar(juegos, analisis.length, partidas.length);
  }

  function pintar(juegos, nAnalizadas, nTotal) {
    if (!juegos.length) { $("#informe").innerHTML = `<p>Aún no hay partidas.</p>`; return; }
    const analizados = juegos.filter((j) => j.rev);
    const res = { victoria: 0, tablas: 0, derrota: 0 };
    juegos.forEach((j) => (res[j.r.resultado] += 1));
    const blunders = analizados.flatMap((j) => j.mias.filter((m) => m.clase === "blunder").map((m) => ({ ...m, j })));
    const precisionMedia = analizados.length ? analizados.reduce((a, j) => a + (j.precision ?? 0), 0) / analizados.length : null;

    // Fases
    const jugFase = Object.fromEntries(FASES.map((f) => [f, 0]));
    const blFase = Object.fromEntries(FASES.map((f) => [f, 0]));
    analizados.forEach((j) => j.mias.forEach((m) => { jugFase[m.fase] += 1; if (m.clase === "blunder") blFase[m.fase] += 1; }));
    const tasa = Object.fromEntries(FASES.map((f) => [f, pct(blFase[f], jugFase[f])]));
    const peorFase = FASES.reduce((a, b) => (tasa[b] > tasa[a] ? b : a));

    // ---- Tus 3 errores más repetidos
    const conError = (pred) => {
      const afect = [], ejemplos = [];
      for (const j of analizados) {
        const ms = j.mias.filter(pred);
        if (ms.length) { afect.push(j); ms.forEach((m) => ejemplos.push({ j, m })); }
      }
      ejemplos.sort((a, b) => b.m.perdida - a.m.perdida);
      return { n: afect.length, ejemplos: ejemplos.slice(0, 3) };
    };
    const graves = new Set(["blunder", "error", "oportunidad"]);
    const tA = analizados.length;
    const cands = [];
    let c = conError((m) => m.clase === "blunder" && m.tipo === "material");
    cands.push({ ...c, titulo: "Dejas piezas sin defender (piezas colgadas y ataques dobles)",
      detalle: `En ${c.n} de ${tA} partidas analizadas perdiste material con una sola jugada.`,
      consejo: "Antes de soltar la pieza, haz el <b>chequeo de seguridad</b> (3 segundos): «después de mi jugada, ¿qué piezas mías están atacadas y cuántos defensores tienen?». Si hay más atacantes que defensores, o te ataca una pieza que vale menos, no la juegues. Haz 10 problemas al día de piezas colgadas y ataques dobles." });
    c = conError((m) => m.tipo === "mate_contra");
    cands.push({ ...c, titulo: "No ves las amenazas de mate del rival",
      detalle: `En ${c.n} partidas hiciste una jugada que permitía al rival darte mate.`,
      consejo: "Antes de tu jugada, mira primero <b>las jugadas forzantes del rival</b>: jaques, capturas y amenazas, en ese orden. Abre a tiempo una casilla de escape para tu rey (h3/h6 o g3/g6) para evitar el mate en la última fila." });
    c = conError((m) => m.clase === "blunder" && (m.tipo === "tactica" || m.tipo === "mate_perdido"));
    cands.push({ ...c, titulo: "Fallos tácticos (no calculas la respuesta del rival)",
      detalle: `En ${c.n} partidas hubo un blunder que no fue perder material de golpe, sino entrar en una posición mucho peor o desaprovechar un golpe ganador.`,
      consejo: "Usa siempre la misma rutina antes de mover: <b>1)</b> ¿qué amenaza la última jugada del rival? <b>2)</b> ¿tengo algún jaque, captura o amenaza fuerte? <b>3)</b> después de mi jugada, ¿cuál es la mejor respuesta del rival? Practica con tus propios errores en <a href='#/ejercicios'>Ejercicios</a>." });
    const porTiempo = juegos.filter((j) => j.r.resultado === "derrota" && j.r.motivo === "timeout");
    c = conError((m) => m.apuros && graves.has(m.clase));
    cands.push({ ...c, n: new Set([...porTiempo.map((j) => j.p.url), ...analizados.filter((j) => j.mias.some((m) => m.apuros && graves.has(m.clase))).map((j) => j.p.url)]).size,
      titulo: "Gestión del reloj",
      detalle: `Perdiste ${porTiempo.length} partidas por tiempo y en ${c.n} cometiste errores graves con menos del 10% del tiempo.`,
      consejo: "Juega con incremento (por ejemplo, 10+5 o 15+10). Ponte un límite: no pases más de 1–2 minutos en una jugada salvo en momentos críticos, y juega rápido las jugadas de apertura que ya conoces." });
    const tiradas = analizados.filter((j) => j.maxVentaja >= 80 && j.r.resultado !== "victoria");
    cands.push({ n: tiradas.length,
      ejemplos: tiradas.flatMap((j) => j.mias.filter((m) => graves.has(m.clase)).map((m) => ({ j, m }))).sort((a, b) => b.m.perdida - a.m.perdida).slice(0, 3),
      titulo: "Pierdes partidas que ibas ganando",
      detalle: `En ${tiradas.length} partidas llegaste a tener más de un 80% de probabilidad de ganar y no ganaste.`,
      consejo: "Cuando vas ganando, <b>simplifica</b>: cambia piezas (no peones), defiende las amenazas antes de seguir atacando y busca el mate más seguro, no el más bonito. En cada jugada, pregúntate «¿qué quiere hacer el rival?»." });
    c = conError((m) => m.fase === "apertura" && graves.has(m.clase));
    cands.push({ ...c, titulo: "Errores en la apertura",
      detalle: `En ${c.n} partidas cometiste un error grave antes de la jugada 12.`,
      consejo: "No hace falta memorizar mucho. Elige <b>una</b> apertura con blancas y una defensa contra 1.e4 y otra contra 1.d4, y entrénalas en <a href='#/entrenar'>Entrenar</a>. Principios: saca caballos y alfiles, enroca pronto, no saques la dama al principio ni muevas la misma pieza dos veces." });
    c = conError((m) => m.fase === "final" && m.clase === "blunder");
    cands.push({ ...c, titulo: "Errores en el final",
      detalle: `En ${c.n} partidas cometiste un blunder con pocas piezas sobre el tablero.`,
      consejo: "Aprende los finales básicos (rey y peón, la oposición, mate con torre y con dama) en <a href='#/entrenar'>Entrenar → Finales</a>. Y en cuanto se cambien las damas, <b>activa tu rey</b> y llévalo al centro." });
    const abandonos = juegos.filter((j) => j.r.resultado === "derrota" && j.r.motivo === "abandoned");
    cands.push({ n: abandonos.length, ejemplos: [], titulo: "Abandonas partidas (desconexión)",
      detalle: `${abandonos.length} de tus ${res.derrota} derrotas fueron por salir de la partida o desconectarte.`,
      consejo: "Son derrotas regaladas: <b>no salgas de una partida aunque vaya mal</b> (a tu nivel, el rival también falla mucho). Juega solo cuando tengas tiempo para terminar y una conexión estable." });
    const top = cands.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3);

    const tarjetas = top.map((t, i) => `
      <article class="tarjeta error-top">
        <div class="num-top">${i + 1}</div>
        <div><h3>${t.titulo}</h3><p class="suave">${t.detalle}</p><p><b>Consejo:</b> ${t.consejo}</p>
        ${t.ejemplos.length ? `<details><summary>Ejemplos de tus partidas</summary><ul>${t.ejemplos.map(({ j, m }) =>
          `<li><a href="#/partida/${j.p.id}">vs ${esc(j.r.rival.username)}, ${fecha(j.p.end_time)}</a> — jugada ${Math.ceil(m.indice / 2)}${m.color === "w" ? "." : "…"}
           <b>${esc(m.san)}</b>${m.mejorSan ? `; lo mejor era <b>${esc(m.mejorSan)}</b>` : ""}</li>`).join("")}</ul></details>` : ""}
        </div></article>`).join("");

    // ---- Evolución de la precisión
    let evolucion = "";
    if (analizados.length >= 3) {
      const ps = analizados.map((j) => j.precision ?? 0);
      const x = (i) => (ps.length === 1 ? 300 : (i / (ps.length - 1)) * 600);
      const y = (v) => 110 - v * 1.0;
      const media = ps.map((_, i) => { const v = ps.slice(Math.max(0, i - 4), i + 1); return v.reduce((a, b) => a + b, 0) / v.length; });
      evolucion = `<h2>Evolución de tu precisión</h2>
        <div class="tarjeta"><svg class="grafica-evol" viewBox="0 0 600 115" preserveAspectRatio="none">
          ${[50, 70, 90].map((v) => `<line x1="0" x2="600" y1="${y(v)}" y2="${y(v)}" class="guia"/><text x="2" y="${y(v) - 2}" class="eje">${v}%</text>`).join("")}
          ${ps.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" class="punto-evol"/>`).join("")}
          <polyline points="${media.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" class="media-evol"/>
        </svg><p class="suave pequeno">Cada punto es una partida (de la más antigua a la más reciente); la línea es la media de las últimas 5.</p></div>`;
    }

    // ---- Ritmos, derrotas, tipos, aperturas
    const porRitmo = {};
    juegos.forEach((j) => (porRitmo[j.p.time_class] ||= []).push(j));
    const filasRitmo = Object.entries(porRitmo).sort((a, b) => b[1].length - a[1].length).map(([rt, js]) => {
      const an = js.filter((j) => j.rev);
      const bl = an.reduce((a, j) => a + j.mias.filter((m) => m.clase === "blunder").length, 0);
      return `<tr><td>${RITMOS[rt] || esc(rt)}</td><td>${js.length}</td><td>${pct(js.filter((j) => j.r.resultado === "victoria").length, js.length).toFixed(0)}%</td>
        <td>${an.length ? (bl / an.length).toFixed(1) : "—"}</td><td>${pct(js.filter((j) => j.r.motivo === "timeout" && j.r.resultado === "derrota").length, js.length).toFixed(0)}%</td></tr>`;
    }).join("");
    const derrotas = juegos.filter((j) => j.r.resultado === "derrota");
    const motivos = {};
    derrotas.forEach((j) => (motivos[j.r.motivo] = (motivos[j.r.motivo] || 0) + 1));
    const filasMotivo = Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) =>
      `<tr><td>${(MOTIVOS[m] || m).replace(/^por /, "Por ")}</td><td>${n}</td><td>${barra(n, derrotas.length, "mal")}</td></tr>`).join("");
    const tipos = {};
    blunders.forEach((b) => (tipos[b.tipo] = (tipos[b.tipo] || 0) + 1));
    const filasTipo = Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([t, n]) =>
      `<tr><td>${TIPOS[t] || t}</td><td>${n}</td><td>${barra(n, blunders.length, "mal")}</td></tr>`).join("");
    const aperturas = (color) => {
      const g = {};
      juegos.filter((j) => j.r.color === color).forEach((j) => { (g[j.r.familia] ||= { v: 0, t: 0, d: 0 })[j.r.resultado[0]] += 1; });
      const filas = Object.entries(g).map(([f, x]) => ({ f, ...x, n: x.v + x.t + x.d })).sort((a, b) => b.n - a.n).slice(0, 8);
      const conDatos = filas.filter((x) => x.n >= 3);
      const mejor = conDatos.length >= 2 ? conDatos.reduce((a, b) => (pct(b.v, b.n) > pct(a.v, a.n) ? b : a)) : null;
      const peor = conDatos.length >= 2 ? conDatos.reduce((a, b) => (pct(b.v, b.n) < pct(a.v, a.n) ? b : a)) : null;
      return (mejor ? `<p class="suave">Mejor: <b>${esc(mejor.f)}</b> (${pct(mejor.v, mejor.n).toFixed(0)}% en ${mejor.n}). Peor: <b>${esc(peor.f)}</b> (${pct(peor.v, peor.n).toFixed(0)}% en ${peor.n}).</p>` : "") +
        `<table class="tabla-informe"><thead><tr><th>Apertura</th><th>Partidas</th><th>G</th><th>T</th><th>P</th><th>% victorias</th><th></th></tr></thead><tbody>
        ${filas.map((x) => `<tr><td>${esc(x.f)}</td><td>${x.n}</td><td>${x.v}</td><td>${x.t}</td><td>${x.d}</td><td>${pct(x.v, x.n).toFixed(0)}%</td><td>${barra(x.v, x.n, "bien")}</td></tr>`).join("")}</tbody></table>`;
    };

    const aviso = nAnalizadas < nTotal
      ? `<div class="tarjeta aviso-analisis">Hay ${nAnalizadas} de ${nTotal} partidas analizadas: los datos de errores solo cuentan esas.
         <a class="boton" href="#/partidas">Elegir partidas para analizar</a></div>` : "";

    $("#informe").innerHTML = `${aviso}
      <div class="kpis">
        <div class="kpi"><b>${juegos.length}</b><span>partidas (${fecha(juegos[0].p.end_time)} – ${fecha(juegos[juegos.length - 1].p.end_time)})</span></div>
        <div class="kpi"><b>${pct(res.victoria, juegos.length).toFixed(0)}%</b><span>${res.victoria} G · ${res.tablas} T · ${res.derrota} P</span></div>
        <div class="kpi"><b>${precisionMedia != null ? precisionMedia.toFixed(1) + "%" : "—"}</b><span>precisión media</span></div>
        <div class="kpi"><b>${tA ? (blunders.length / tA).toFixed(1) : "—"}</b><span>blunders por partida</span></div>
        <div class="kpi"><b>${tA ? NOMBRE_FASE[peorFase] : "—"}</b><span>fase con más blunders por jugada</span></div>
      </div>
      <h2>Tus 3 errores más repetidos</h2>
      ${tarjetas || `<p class="suave">${tA ? "No se detectan errores repetidos. ¡Bien jugado!" : "Analiza tus partidas para verlos."}</p>`}
      ${evolucion}
      <div class="dos-columnas">
        <section><h2>¿En qué fase fallas?</h2><table class="tabla-informe"><thead><tr><th>Fase</th><th>Blunders</th><th>Tus jugadas</th><th>Cada 100</th><th></th></tr></thead><tbody>
          ${FASES.map((f) => `<tr><td>${NOMBRE_FASE[f]}</td><td>${blFase[f]}</td><td>${jugFase[f]}</td><td>${tasa[f].toFixed(1)}</td><td>${barra(tasa[f], Math.max(...Object.values(tasa), 0.01), "mal")}</td></tr>`).join("")}
        </tbody></table></section>
        <section><h2>¿Fallas más en partidas rápidas?</h2><table class="tabla-informe"><thead><tr><th>Ritmo</th><th>Partidas</th><th>% victorias</th><th>Blunders/partida</th><th>Derrotas por tiempo</th></tr></thead><tbody>${filasRitmo}</tbody></table></section>
        <section><h2>¿Cómo pierdes?</h2><table class="tabla-informe"><tbody>${filasMotivo || "<tr><td>Sin derrotas</td></tr>"}</tbody></table></section>
        <section><h2>¿Qué tipo de blunders cometes?</h2><table class="tabla-informe"><tbody>${filasTipo || "<tr><td class='suave'>Sin datos</td></tr>"}</tbody></table>
          <p class="suave pequeno">${blunders.filter((b) => b.apuros).length} de tus ${blunders.length} blunders fueron con menos del 10% del tiempo.</p></section>
        <section><h2>Aperturas con blancas</h2>${aperturas("w")}</section>
        <section><h2>Aperturas con negras</h2>${aperturas("b")}</section>
      </div>
      <p class="suave pequeno">Blunder: jugada que quita 15 puntos o más de probabilidad de ganar; error: 10 o más. Precisión: método público de lichess. Apertura = hasta la jugada 12; final = pocas piezas sin contar peones.</p>`;

  }

  await calcular();
  return () => { activa = false; };
}
