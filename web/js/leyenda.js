// Leyenda de iconos de clasificación: al tocar un icono (.icono[data-clase]) se explica qué significa.

import { CLASES } from "./analizador.js";

export const SIGNIFICADO = {
  brillante: "Un sacrificio que merece la pena: parece que pierdes material, pero la posición lo compensa.",
  genial: "La única jugada buena de la posición: cualquier otra empeoraba mucho.",
  mejor: "La jugada que Stockfish recomienda.",
  excelente: "Casi tan buena como la mejor.",
  buena: "Una jugada correcta, aunque había algo mejor.",
  libro: "Jugada de apertura conocida (teoría): no hace falta pensarla.",
  imprecision: "Pierde un poco de ventaja (entre 5 y 10 puntos de probabilidad de ganar).",
  error: "Pierde bastante ventaja (entre 10 y 15 puntos de probabilidad de ganar).",
  oportunidad: "El rival se equivocó en su jugada anterior y no lo aprovechas.",
  blunder: "Error grave: tira la ventaja o la partida (15 puntos o más de probabilidad de ganar).",
};

let hoja = null;

function cerrar() { hoja?.remove(); hoja = null; }

function abrir(clase) {
  cerrar();
  hoja = document.createElement("div");
  hoja.className = "hoja-leyenda";
  const fila = (c) => `<div class="fila-ley ${c === clase ? "elegida" : ""}">
      <span class="icono c-${c}">${CLASES[c].simbolo}</span>
      <div><b>${CLASES[c].nombre}</b><span>${SIGNIFICADO[c]}</span></div></div>`;
  const orden = Object.keys(CLASES).sort((a, b) => CLASES[a].orden - CLASES[b].orden);
  hoja.innerHTML = `<div class="caja-ley" role="dialog" aria-label="Qué significa cada icono">
      <div class="cab-ley"><b>Qué significa cada icono</b><button type="button" class="cerrar-ley" aria-label="Cerrar">✕</button></div>
      <p class="suave pequeno">La «probabilidad de ganar» es lo que Stockfish calcula en cada posición. Un icono dice cuánto cambia con esa jugada.</p>
      ${orden.map(fila).join("")}</div>`;
  hoja.addEventListener("click", (ev) => { if (ev.target === hoja || ev.target.closest(".cerrar-ley")) cerrar(); });
  document.body.appendChild(hoja);
  hoja.querySelector(".elegida")?.scrollIntoView({ block: "center" });
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest?.(".icono[data-clase]");
  if (el) { ev.stopPropagation(); abrir(el.dataset.clase); }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrar(); });
window.addEventListener("hashchange", cerrar);
