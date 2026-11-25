// Utilidades comunes: leer partidas (PGN), nombres de aperturas, formatos.

import { Chess } from "../vendor/chess.js/dist/esm/chess.js";
export { Chess };

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Escapa texto para meterlo en HTML sin riesgos (nombres de usuario, etc.).
export function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const TABLAS = new Set(["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"]);
export const MOTIVOS = {
  timeout: "por tiempo", checkmated: "por jaque mate", resigned: "por abandono",
  abandoned: "por desconexión", agreed: "de mutuo acuerdo", repetition: "por repetición",
  stalemate: "por ahogado", insufficient: "por material insuficiente", "50move": "por la regla de 50 jugadas",
  timevsinsufficient: "por tiempo (sin material)",
};
export const RITMOS = { bullet: "Bullet", blitz: "Blitz", rapid: "Rápida", daily: "Diaria" };

// Nombre de la apertura a partir de la URL que da chess.com ("…/openings/Caro-Kann-Defense-2.d4").
export function nombreApertura(ecoUrl) {
  if (!ecoUrl || !ecoUrl.includes("/openings/")) return "Desconocida";
  const palabras = [];
  for (const w of ecoUrl.split("/openings/").pop().split("-")) {
    if (!w || /^\d/.test(w)) break;           // a partir de aquí vienen jugadas
    if (w.includes(".")) { if (w.split(".")[0]) palabras.push(w.split(".")[0]); break; }
    palabras.push(w);
  }
  return palabras.join(" ") || "Desconocida";
}

export function familiaApertura(nombre) {
  const p = nombre.split(" ");
  const i = p.findIndex((w) => ["Defense", "Opening", "Game", "Gambit", "Attack", "System"].includes(w));
  return (i >= 0 ? p.slice(0, i + 1) : p.slice(0, 3)).join(" ");
}

// Resumen de una partida desde el punto de vista del usuario.
export function resumen(p) {
  const color = p.white.username.toLowerCase() === p.usuario ? "w" : "b";
  const yo = color === "w" ? p.white : p.black;
  const rival = color === "w" ? p.black : p.white;
  const resultado = yo.result === "win" ? "victoria" : TABLAS.has(yo.result) ? "tablas" : "derrota";
  const motivo = resultado === "victoria" ? rival.result : yo.result;
  const apertura = nombreApertura(p.eco);
  return { color, yo, rival, resultado, motivo, apertura, familia: familiaApertura(apertura) };
}

/**
 * Convierte el PGN en una lista de jugadas con todo lo necesario para dibujarlas:
 * { inicio (fen), jugadas: [{ san, uci, fen, color, reloj }] }
 */
export function leerPartida(p) {
  const juego = new Chess();
  juego.loadPgn(p.pgn);
  const cabeceras = juego.getHeaders();
  const historial = juego.history({ verbose: true });
  const relojes = [...p.pgn.matchAll(/\[%clk ([\d:.]+)\]/g)].map((m) => aSegundos(m[1]));
  return {
    inicio: cabeceras.FEN || historial[0]?.before || new Chess().fen(),
    jugadas: historial.map((m, i) => ({
      san: m.san, uci: m.lan, fen: m.after, color: m.color, reloj: relojes[i] ?? null,
    })),
  };
}

function aSegundos(t) {
  return t.split(":").reduce((acc, n) => acc * 60 + Number(n), 0);
}

export function formatoReloj(seg) {
  if (seg == null) return "";
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = Math.floor(seg % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// Fase de la partida según las piezas que quedan y el número de jugada (como en el Python).
const VALOR_PIEZA = { n: 3, b: 3, r: 5, q: 9 };
export function fase(fen) {
  const [tablero, , , , , jugada] = fen.split(" ");
  let piezas = 0;
  for (const c of tablero) piezas += VALOR_PIEZA[c.toLowerCase()] || 0;
  if (piezas <= 26) return "final";       // al empezar hay 62
  if (Number(jugada) <= 12) return "apertura";
  return "medio juego";
}

// Tiempo inicial en segundos ("600+5" -> 600). Las partidas diarias no tienen reloj.
export function tiempoBase(control) {
  if (!control || control.includes("/")) return null;
  return parseInt(control, 10) || null;
}

export function fecha(ts) {
  return new Date(ts * 1000).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Iconos de los botones de avanzar/retroceder: dibujados, para que se vean igual en móvil y PC
 *  (los símbolos ▶ ⏮ ⏭ salen como emoji en el iPhone y distintos entre sí). */
const SVG = (d, extra = "") => `<svg viewBox="0 0 24 24" aria-hidden="true"><path ${extra} d="${d}"/></svg>`;
export const ICONO_CTRL = {
  inicio: SVG("M6 5h2.4v14H6zM19 5v14L9.5 12z"),
  atras: SVG("M16.5 5v14L7 12z"),
  adelante: SVG("M7.5 5v14L17 12z"),
  fin: SVG("M15.6 5H18v14h-2.4zM5 5v14l9.5-7z"),
  girar: SVG("M4.5 12a7.5 7.5 0 1 0 2.6-5.7M4 4v4.2h4.2", 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
};
