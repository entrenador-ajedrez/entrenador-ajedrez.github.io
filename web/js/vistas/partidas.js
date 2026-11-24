// Pantalla "Mis partidas": lista de partidas guardadas en la memoria.
// Puedes elegir qué partidas analizar (una a una o todas) y parar el análisis cuando quieras.

import { aperturaEs } from "../lenguaje.js";
import { todosDeUsuario } from "../almacen.js";
import { alCambiarLote, analizarVarias, detenerAnalisis, estadoLote, revisar } from "../analizador.js";
import { $, MOTIVOS, RITMOS, esc, fecha, resumen } from "../util.js";

export async function montar(vista, { estado, sincronizarAhora }) {
  vista.innerHTML = `
    <div class="cabecera-vista">
      <h1>Mis partidas</h1>
      <span id="estado-sync" class="suave"></span>
    </div>
    <div class="filtros">
      <select id="f-resultado">
        <option value="">Todos los resultados</option>
        <option value="victoria">Victorias</option><option value="derrota">Derrotas</option><option value="tablas">Tablas</option>
      </select>
      <select id="f-color"><option value="">Los dos colores</option><option value="w">Blancas</option><option value="b">Negras</option></select>
      <select id="f-ritmo"><option value="">Todos los ritmos</option>
        <option value="bullet">Bullet</option><option value="blitz">Blitz</option><option value="rapid">Rápida</option><option value="daily">Diaria</option>
      </select>
      <select id="f-analisis"><option value="">Analizadas y sin analizar</option>
        <option value="no">Sin analizar</option><option value="si">Analizadas</option></select>
      <button id="btn-actualizar">↻ Buscar partidas nuevas</button>
    </div>
    <div class="barra-analisis" id="barra-analisis"></div>
    <div class="tabla-scroll">
      <table class="partidas">
        <thead><tr>
          <th class="col-check"><input type="checkbox" id="check-todas" title="Seleccionar todas las visibles sin analizar"></th>
          <th>Fecha</th><th>Rival</th><th>Color</th><th>Resultado</th><th>Apertura</th><th>Ritmo</th><th>Tu precisión</th>
        </tr></thead>
        <tbody id="filas"><tr><td colspan="8" class="cargando">Cargando…</td></tr></tbody>
      </table>
    </div>
    <p class="solo-movil pie-movil"><a href="#/creditos">Créditos y licencias</a></p>`;

  let partidas = [];
  const seleccion = new Set(); // urls elegidas para analizar
  let activa = true;

  async function cargar() {
    const analisis = new Map((await todosDeUsuario("analisis", estado.usuario)).map((a) => [a.url, a]));
    partidas = (await todosDeUsuario("partidas", estado.usuario))
      .map((p) => {
        const r = resumen(p);
        const a = analisis.get(p.url);
        let precision = null;
        if (a) { const rev = revisar(p, a); precision = (r.color === "w" ? rev.blancas : rev.negras).precision; }
        return { ...p, r, analizada: !!a, precision };
      })
      .sort((a, b) => b.end_time - a.end_time);
    for (const url of [...seleccion]) if (partidas.find((p) => p.url === url)?.analizada) seleccion.delete(url);
    pintar();
  }

  const visibles = () => {
    const fr = $("#f-resultado").value, fc = $("#f-color").value, ft = $("#f-ritmo").value, fa = $("#f-analisis").value;
    return partidas.filter((p) => (!fr || p.r.resultado === fr) && (!fc || p.r.color === fc) && (!ft || p.time_class === ft) &&
      (!fa || (fa === "si") === p.analizada));
  };

  function pintar() {
    const lista = visibles();
    const enCurso = estadoLote().partidaActual?.url;
    $("#filas").innerHTML = lista.length ? lista.map((p) => `
      <tr data-id="${esc(p.id)}" class="${p.url === enCurso ? "analizando-ahora" : ""}">
        <td class="col-check">${p.analizada ? `<span class="suave" title="Ya analizada">✓</span>`
          : `<input type="checkbox" data-url="${esc(p.url)}" ${seleccion.has(p.url) ? "checked" : ""} title="Elegir para analizar">`}</td>
        <td class="c-fecha">${fecha(p.end_time)}</td>
        <td class="c-rival">${esc(p.r.rival.username)} <span class="suave">(${p.r.rival.rating ?? "?"})</span></td>
        <td class="c-color"><span class="pieza-color ${p.r.color}"></span>${p.r.color === "w" ? "Blancas" : "Negras"}</td>
        <td class="c-res"><span class="res-${p.r.resultado}">${p.r.resultado[0].toUpperCase() + p.r.resultado.slice(1)}</span>
            <span class="suave">${MOTIVOS[p.r.motivo] || ""}</span></td>
        <td class="c-ap">${esc(aperturaEs(p.r.apertura))}</td>
        <td class="c-ritmo">${RITMOS[p.time_class] || esc(p.time_class)}</td>
        <td class="c-prec">${p.precision != null ? `<b class="prec-mini">${p.precision.toFixed(1)}%</b>`
          : p.url === enCurso ? `<span class="suave">analizando…</span>` : `<span class="suave">—</span>`}</td>
      </tr>`).join("")
      : `<tr><td colspan="8" class="suave">No hay partidas con estos filtros.</td></tr>`;
    const elegibles = lista.filter((p) => !p.analizada);
    $("#check-todas").checked = elegibles.length > 0 && elegibles.every((p) => seleccion.has(p.url));
    $("#check-todas").disabled = elegibles.length === 0;
    pintarSync();
    pintarBarraAnalisis();
  }

  function pintarSync() {
    const s = estado.sync;
    let texto = `${partidas.length} partidas guardadas`;
    if (s.activa) texto = s.texto;
    else if (s.resultado) texto += s.resultado.nuevas ? ` · ${s.resultado.nuevas} nuevas` : " · al día";
    else if (s.texto) texto = s.texto;
    $("#estado-sync").textContent = texto;
    $("#btn-actualizar").disabled = s.activa;
  }

  // Barra con los botones de análisis (o el progreso y "Parar" si hay uno en marcha).
  function pintarBarraAnalisis() {
    const e = estadoLote();
    const pendientes = partidas.filter((p) => !p.analizada);
    const barra = $("#barra-analisis");
    if (e.activo) {
      const total = e.total || 1;
      const avance = (e.hechas + e.progresoPartida) / total;
      barra.innerHTML = `
        <div class="progreso-lote">
          <span>Analizando ${Math.min(e.hechas + 1, e.total)} de ${e.total}…
            <span class="suave">(puedes seguir usando la web)</span></span>
          <div class="barra-progreso"><span style="width:${(avance * 100).toFixed(1)}%"></span></div>
        </div>
        <button class="peligro" id="btn-parar">⏹ Parar</button>`;
      $("#btn-parar").onclick = () => { detenerAnalisis(); $("#btn-parar").disabled = true; $("#btn-parar").textContent = "Parando…"; };
      return;
    }
    const n = seleccion.size;
    barra.innerHTML = `
      <span class="suave">${pendientes.length ? `${pendientes.length} sin analizar.` : "Todas tus partidas están analizadas ✓"}
        ${e.parado ? " Análisis parado: lo analizado hasta ese momento está guardado." : ""}</span>
      <button class="principal" id="btn-seleccionadas" ${n ? "" : "disabled"}>Analizar <span class="solo-pc">seleccionadas</span><span class="solo-movil-inline">elegidas</span> (${n})</button>
      <button id="btn-todas" ${pendientes.length ? "" : "disabled"}>Analizar todas (${pendientes.length})</button>
      ${n ? `<button id="btn-limpiar" class="enlace">Quitar selección</button>` : ""}`;
    $("#btn-seleccionadas").onclick = () => analizar(partidas.filter((p) => seleccion.has(p.url)));
    $("#btn-todas").onclick = () => analizar(pendientes);
    if (n) $("#btn-limpiar").onclick = () => { seleccion.clear(); pintar(); };
  }

  function analizar(lista) {
    if (!lista.length) return;
    seleccion.clear();
    analizarVarias(lista).finally(() => activa && cargar());
    pintar();
  }

  // ---- eventos
  $("#filas").onclick = (ev) => {
    const check = ev.target.closest("input[type=checkbox]");
    if (check) {
      if (check.checked) seleccion.add(check.dataset.url); else seleccion.delete(check.dataset.url);
      pintarBarraAnalisis();
      const elegibles = visibles().filter((p) => !p.analizada);
      $("#check-todas").checked = elegibles.length > 0 && elegibles.every((p) => seleccion.has(p.url));
      return;
    }
    if (ev.target.closest(".col-check")) return; // clic en la columna de casillas: no abrir la partida
    const fila = ev.target.closest("tr[data-id]");
    if (fila) location.hash = `#/partida/${fila.dataset.id}`;
  };
  $("#check-todas").onchange = (ev) => {
    for (const p of visibles()) if (!p.analizada) { if (ev.target.checked) seleccion.add(p.url); else seleccion.delete(p.url); }
    pintar();
  };
  for (const id of ["#f-resultado", "#f-color", "#f-ritmo", "#f-analisis"]) $(id).onchange = pintar;
  $("#btn-actualizar").onclick = () => sincronizarAhora();

  // Cuando termina una sincronización, recargamos la lista.
  const alCambiarSync = () => (estado.sync.activa ? pintarSync() : cargar());
  estado.oyentes.add(alCambiarSync);
  // Progreso del análisis: al terminar cada partida recargamos (para ver su precisión).
  let hechasAntes = estadoLote().hechas;
  const bajaLote = alCambiarLote((e) => {
    if (!activa) return;
    if (e.hechas !== hechasAntes || !e.activo) { hechasAntes = e.hechas; cargar(); }
    else pintarBarraAnalisis();
  });
  await cargar();
  return () => { activa = false; estado.oyentes.delete(alCambiarSync); bajaLote(); };
}
