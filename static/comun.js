// Funciones que usan todas las páginas del entrenador.

const PIEZAS = "https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png";
const $id = (id) => document.getElementById(id);

// Pide datos al servidor (GET) o le envía datos (POST si pasas 'datos').
async function api(ruta, datos) {
  const opciones = datos
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) }
    : {};
  const r = await fetch(ruta, opciones);
  if (!r.ok) throw new Error(`Error del servidor (${r.status})`);
  return r.json();
}

// Probabilidad de ganar (0-100) a partir de centipeones. Misma fórmula que en Python.
function probGanar(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Resalta las casillas de origen y destino de una jugada como "e2e4".
function marcar(uci, clase) {
  if (!uci) return;
  for (const casilla of [uci.slice(0, 2), uci.slice(2, 4)]) {
    document.querySelectorAll(`#tablero .square-${casilla}`).forEach((el) => el.classList.add(clase));
  }
}

function limpiarMarcas() {
  document.querySelectorAll("#tablero .marca-buena, #tablero .marca-mala, #tablero .marca-jugada")
    .forEach((el) => el.classList.remove("marca-buena", "marca-mala", "marca-jugada"));
}
