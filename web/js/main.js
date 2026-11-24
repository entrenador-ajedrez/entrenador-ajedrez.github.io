// Punto de entrada: decide qué pantalla mostrar según la dirección (#/partidas, #/partida/123…)
// y mantiene las partidas al día cada vez que se abre la web.

import { fijarUsuarioActual, usuarioActual } from "./almacen.js";
import { sincronizar } from "./chesscom.js";
import { alCambiarLote, detenerAnalisis } from "./analizador.js";
import { $, $$, esc } from "./util.js";
import * as vistaInicio from "./vistas/inicio.js";
import * as vistaPartidas from "./vistas/partidas.js";
import * as vistaPartida from "./vistas/partida.js";
import * as vistaCreditos from "./vistas/creditos.js";
import * as vistaEjercicios from "./vistas/ejercicios.js";
import * as vistaJugar from "./vistas/jugar.js";
import * as vistaEntrenar from "./vistas/entrenar.js";
import * as vistaInforme from "./vistas/informe.js";

// Estado compartido por todas las pantallas.
export const estado = {
  usuario: null,
  sync: { activa: false, texto: "", resultado: null },
  oyentes: new Set(), // pantallas que quieren enterarse cuando termina la sincronización
};

const RUTAS = {
  "": vistaPartidas,
  partidas: vistaPartidas,
  partida: vistaPartida,
  inicio: vistaInicio,
  creditos: vistaCreditos,
  ejercicios: vistaEjercicios,
  jugar: vistaJugar,
  entrenar: vistaEntrenar,
  informe: vistaInforme,
};

let desmontar = null;

async function navegar() {
  if (desmontar) { desmontar(); desmontar = null; }
  // "#/jugar/<fen>/w" -> nombre "jugar", parametros ["<fen>", "w"] (los datos van codificados)
  const [, nombre = "", ...resto] = location.hash.split("/");
  const parametros = resto.map((x) => decodeURIComponent(x));
  const parametro = parametros[0];
  let modulo = RUTAS[nombre] || vistaPartidas;
  if (!estado.usuario && modulo !== vistaCreditos) modulo = vistaInicio;
  const activa = nombre === "partida" ? "partidas" : nombre || "partidas";
  $$(".lateral a.nav").forEach((a) => a.classList.toggle("activa", a.dataset.ruta === activa));
  const vista = $("#vista");
  vista.innerHTML = "";
  desmontar = (await modulo.montar(vista, { parametro, parametros, estado, entrar, sincronizarAhora })) || null;
}

function pintarUsuario() {
  const chip = $("#usuario-chip");
  if (!estado.usuario) { chip.innerHTML = ""; return; }
  chip.innerHTML = `<div class="usuario-chip"><span class="suave">Conectado como</span>
    <b>${esc(estado.usuario)}</b><button id="btn-cambiar">Cambiar<span class="solo-pc"> de usuario</span></button></div>`;
  $("#btn-cambiar").onclick = async () => {
    estado.usuario = null;
    await fijarUsuarioActual(null);
    pintarUsuario();
    location.hash = "#/inicio";
  };
}

// Descarga lo nuevo de chess.com y avisa a las pantallas interesadas.
export async function sincronizarAhora() {
  if (!estado.usuario || estado.sync.activa) return;
  estado.sync = { activa: true, texto: "Buscando partidas nuevas…", resultado: null };
  estado.oyentes.forEach((f) => f());
  try {
    const r = await sincronizar(estado.usuario, (texto) => {
      estado.sync.texto = texto;
      estado.oyentes.forEach((f) => f());
    });
    estado.sync = { activa: false, texto: "", resultado: r };
  } catch (err) {
    estado.sync = { activa: false, texto: "No se pudo actualizar: " + err.message, resultado: null };
  }
  estado.oyentes.forEach((f) => f());
}

// Se llama desde la pantalla de inicio cuando alguien conecta su usuario.
async function entrar(usuario) {
  estado.usuario = usuario.toLowerCase();
  await fijarUsuarioActual(estado.usuario);
  pintarUsuario();
  // Si ya estábamos en #/partidas no hay "hashchange": pintamos la lista a mano.
  if (location.hash === "#/partidas") navegar(); else location.hash = "#/partidas";
}

// Indicador del análisis en la barra lateral, con "Parar", visible en todas las pantallas.
function pintarLote(e) {
  const caja = $("#lote-global");
  if (!e.activo) { caja.innerHTML = ""; return; }
  const avance = ((e.hechas + e.progresoPartida) / (e.total || 1)) * 100;
  caja.innerHTML = `<div class="lote-global">
    <span>Analizando ${Math.min(e.hechas + 1, e.total)}/${e.total}</span>
    <div class="barra-progreso"><span style="width:${avance.toFixed(1)}%"></span></div>
    <button id="btn-parar-global" title="Parar el análisis (lo ya analizado se guarda)">⏹ Parar</button></div>`;
  $("#btn-parar-global").onclick = (ev) => { detenerAnalisis(); ev.target.disabled = true; ev.target.textContent = "Parando…"; };
}

async function arrancar() {
  alCambiarLote(pintarLote);
  try {
    estado.usuario = await usuarioActual();
  } catch {
    $("#vista").innerHTML = `<p class="error">Este navegador no permite guardar datos (¿modo incógnito?).
      La web necesita esa memoria para funcionar.</p>`;
    return;
  }
  pintarUsuario();
  window.addEventListener("hashchange", navegar);
  await navegar();
  if (estado.usuario) sincronizarAhora(); // cada vez que se abre: traer partidas nuevas
}

arrancar();
