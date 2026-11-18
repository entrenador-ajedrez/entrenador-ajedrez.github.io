// Pantalla "Mis partidas": lista de partidas guardadas en la memoria.

import { todosDeUsuario } from "../almacen.js";
import { analizandoVarias, analizarVarias, revisar } from "../analizador.js";
import { $, MOTIVOS, RITMOS, esc, fecha, resumen } from "../util.js";

let progresoTodas = ""; // texto del análisis en segundo plano (sobrevive al cambiar de pantalla)

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
      <button id="btn-actualizar">↻ Buscar partidas nuevas</button>
      <button id="btn-analizar" class="principal">Analizar todas</button>
      <span id="estado-analisis" class="suave" style="align-self:center"></span>
    </div>
    <div class="tabla-scroll">
      <table class="partidas">
        <thead><tr><th>Fecha</th><th>Rival</th><th>Color</th><th>Resultado</th><th>Apertura</th><th>Ritmo</th><th>Tu precisión</th></tr></thead>
        <tbody id="filas"><tr><td colspan="7" class="cargando">Cargando…</td></tr></tbody>
      </table>
    </div>`;

  let partidas = [];
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
    pintar();
  }

  function pintarAnalisis() {
    const faltan = partidas.filter((p) => !p.analizada).length;
    $("#btn-analizar").disabled = analizandoVarias() || faltan === 0;
    $("#btn-analizar").textContent = faltan ? `Analizar todas (${faltan})` : "Todas analizadas ✓";
    $("#estado-analisis").textContent = analizandoVarias() ? progresoTodas : "";
  }

  async function analizarTodas() {
    const pendientes = partidas.filter((p) => !p.analizada);
    await analizarVarias(pendientes, (hechas, total) => {
      progresoTodas = `Analizando ${hechas + 1 > total ? total : hechas + 1}/${total}… (puedes seguir usando la web)`;
      if (activa) { pintarAnalisis(); if (hechas > 0) cargar(); }
    });
    if (activa) cargar();
  }

  function pintar() {
    const fr = $("#f-resultado").value, fc = $("#f-color").value, ft = $("#f-ritmo").value;
    const visibles = partidas.filter((p) =>
      (!fr || p.r.resultado === fr) && (!fc || p.r.color === fc) && (!ft || p.time_class === ft));
    $("#filas").innerHTML = visibles.length ? visibles.map((p) => `
      <tr data-id="${esc(p.id)}">
        <td>${fecha(p.end_time)}</td>
        <td>${esc(p.r.rival.username)} <span class="suave">(${p.r.rival.rating ?? "?"})</span></td>
        <td><span class="pieza-color ${p.r.color}"></span>${p.r.color === "w" ? "Blancas" : "Negras"}</td>
        <td><span class="res-${p.r.resultado}">${p.r.resultado[0].toUpperCase() + p.r.resultado.slice(1)}</span>
            <span class="suave">${MOTIVOS[p.r.motivo] || ""}</span></td>
        <td>${esc(p.r.apertura)}</td>
        <td>${RITMOS[p.time_class] || esc(p.time_class)}</td>
        <td>${p.precision != null ? `<b class="prec-mini">${p.precision.toFixed(1)}%</b>` : `<span class="suave">—</span>`}</td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="suave">No hay partidas con estos filtros.</td></tr>`;
    pintarSync();
    pintarAnalisis();
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

  $("#filas").onclick = (ev) => {
    const fila = ev.target.closest("tr[data-id]");
    if (fila) location.hash = `#/partida/${fila.dataset.id}`;
  };
  for (const id of ["#f-resultado", "#f-color", "#f-ritmo"]) $(id).onchange = pintar;
  $("#btn-actualizar").onclick = () => sincronizarAhora();
  $("#btn-analizar").onclick = () => analizarTodas();

  // Cuando termina una sincronización, recargamos la lista.
  const alCambiar = () => (estado.sync.activa ? pintarSync() : cargar());
  estado.oyentes.add(alCambiar);
  await cargar();
  if (analizandoVarias()) analizarTodas(); // si ya estaba en marcha, nos enganchamos para ver el progreso
  return () => { activa = false; estado.oyentes.delete(alCambiar); };
}
