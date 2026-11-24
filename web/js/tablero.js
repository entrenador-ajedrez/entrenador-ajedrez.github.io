// Tablero interactivo basado en cm-chessboard (licencia MIT):
//  - clic en una pieza -> círculos en las casillas a las que puede ir (anillo si captura)
//  - clic en la casilla de destino, o arrastrar
//  - diálogo para elegir pieza al coronar
//  - resaltado de la última jugada y flechas

import { BORDER_TYPE, COLOR, Chessboard, FEN, INPUT_EVENT_TYPE } from "../vendor/cm-chessboard/src/Chessboard.js";
import { Markers } from "../vendor/cm-chessboard/src/extensions/markers/Markers.js";
import { Arrows } from "../vendor/cm-chessboard/src/extensions/arrows/Arrows.js";
import { PromotionDialog } from "../vendor/cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js";

// Tipos de marca propios (el color lo pone nuestro CSS).
const MARCA_ULTIMA = { class: "marca-ultima", slice: "markerSquare" };
const MARCA_SELECCION = { class: "marca-seleccion", slice: "markerSquare" };
const MARCA_CHIP = { class: "marca-chip", slice: "markerSquare" };
const FLECHAS_CHIP = {
  jugada: { class: "flecha-chip-jugada" },
  error: { class: "flecha-chip-error" },
  mejor: { class: "flecha-chip-mejor" },
};
export const FLECHA = {
  mejor: { class: "flecha-mejor" },
  jugada: { class: "flecha-jugada" },
  error: { class: "flecha-error" },
};

// Estructura común de las pantallas con tablero: barra de evaluación + tablero + panel derecho.
export function disposicion(titulo, { controles = "" } = {}) {
  return `
    <div class="con-tablero">
      <div class="col-tablero">
        <div class="jugador" id="j-arriba"></div>
        <div class="tablero-y-barra">
          <div class="barra-eval" id="barra"><div class="blanca"></div><div class="numero"></div></div>
          <div class="tablero" id="tablero"></div>
        </div>
        <div class="jugador" id="j-abajo"></div>
      </div>
      <aside class="panel-derecho">
        <div class="titulo-panel">${titulo}</div>
        <div class="cuerpo" id="cuerpo"></div>
        ${controles ? `<div class="controles">${controles}</div>` : ""}
      </aside>
    </div>`;
}

// Actualiza la barra de evaluación (cp desde el punto de vista de las blancas).
export function ponerBarra(cp, mate, probGanar) {
  const barra = document.getElementById("barra");
  if (!barra) return;
  barra.querySelector(".blanca").style.height = probGanar(cp).toFixed(1) + "%";
  barra.querySelector(".numero").textContent = mate === 0 ? "#" : mate ? `M${Math.abs(mate)}` : Math.abs(cp / 100).toFixed(1);
  barra.classList.toggle("negras-ganan", cp < 0);
}

export function fichaJugador(nombre, detalle = "") {
  return `<div class="avatar">${nombre[0]?.toUpperCase() || "?"}</div><span class="nombre">${nombre}</span>
    <span class="elo">${detalle}</span>`;
}

export class Tablero {
  /**
   * @param elemento  contenedor HTML
   * @param opciones  {
   *    juego: () => instancia de Chess (chess.js) con la posición actual,
   *    puedeMover: () => true/false (si ahora puedes mover),
   *    alMover: ({from, to, promotion}) => se llama cuando haces una jugada legal,
   *    orientacion: "w" | "b"
   * }
   */
  constructor(elemento, opciones) {
    this.op = opciones;
    this.ultima = null;
    this.tablero = new Chessboard(elemento, {
      position: FEN.start,
      orientation: opciones.orientacion === "b" ? COLOR.black : COLOR.white,
      assetsUrl: "vendor/cm-chessboard/assets/",
      style: {
        cssClass: "tema-propio",
        borderType: BORDER_TYPE.none,
        pieces: { file: "pieces/standard.svg" },
        animationDuration: 180,
      },
      extensions: [
        { class: Markers, props: { autoMarkers: MARCA_SELECCION } },
        { class: Arrows },
        { class: PromotionDialog },
      ],
    });
    this.tablero.enableMoveInput((e) => this._entrada(e));
  }

  _entrada(e) {
    const juego = this.op.juego();
    switch (e.type) {
      case INPUT_EVENT_TYPE.moveInputStarted: {
        if (!this.op.puedeMover()) return false;
        const jugadas = juego.moves({ square: e.squareFrom, verbose: true });
        this.tablero.removeLegalMovesMarkers();
        if (jugadas.length === 0) return false;
        this.tablero.addLegalMovesMarkers(jugadas);
        return true;
      }
      case INPUT_EVENT_TYPE.validateMoveInput: {
        const posibles = juego.moves({ square: e.squareFrom, verbose: true }).filter((m) => m.to === e.squareTo);
        if (posibles.length === 0) return false;
        if (posibles.some((m) => m.promotion)) {
          // Coronación: preguntamos qué pieza quieres.
          const color = juego.turn() === "w" ? COLOR.white : COLOR.black;
          this.tablero.showPromotionDialog(e.squareTo, color, (r) => {
            if (r && r.piece) {
              this.op.alMover({ from: e.squareFrom, to: e.squareTo, promotion: r.piece.charAt(1) });
            } else {
              this.tablero.setPosition(juego.fen(), true); // cancelado: deshacer visualmente
            }
          });
        } else {
          this.pendiente = { from: e.squareFrom, to: e.squareTo };
        }
        return true;
      }
      case INPUT_EVENT_TYPE.moveInputCanceled:
        this.tablero.removeLegalMovesMarkers();
        return;
      case INPUT_EVENT_TYPE.moveInputFinished:
        this.tablero.removeLegalMovesMarkers();
        if (e.legalMove && this.pendiente) {
          const jugada = this.pendiente;
          this.pendiente = null;
          setTimeout(() => this.op.alMover(jugada)); // fuera del evento del tablero
        }
        return;
    }
  }

  // ------------------------------------------------------------ API para las vistas
  async posicion(fen, animar = true) {
    await this.tablero.setPosition(fen, animar);
  }

  orientar(color) {
    return this.tablero.setOrientation(color === "b" ? COLOR.black : COLOR.white);
  }

  girar() {
    const actual = this.tablero.getOrientation();
    return this.tablero.setOrientation(actual === COLOR.white ? COLOR.black : COLOR.white);
  }

  orientacion() {
    return this.tablero.getOrientation() === COLOR.white ? "w" : "b";
  }

  // Resalta la última jugada ("e2e4" o null para quitarla).
  ultimaJugada(uci) {
    this.tablero.removeMarkers(MARCA_ULTIMA);
    if (uci) {
      this.tablero.addMarker(MARCA_ULTIMA, uci.slice(0, 2));
      if (uci.slice(2, 4) !== uci.slice(0, 2)) this.tablero.addMarker(MARCA_ULTIMA, uci.slice(2, 4));
    }
  }

  flecha(uci, tipo = FLECHA.mejor) {
    if (uci) this.tablero.addArrow(tipo, uci.slice(0, 2), uci.slice(2, 4));
  }

  // Resalte temporal de un chip de jugada: flecha + casillas de salida y llegada.
  resaltarChip(desde, hasta, tipo = "jugada") {
    this.quitarResalteChip();
    this.tablero.addMarker(MARCA_CHIP, desde);
    this.tablero.addMarker(MARCA_CHIP, hasta);
    this.tablero.addArrow(FLECHAS_CHIP[tipo] || FLECHAS_CHIP.jugada, desde, hasta);
  }

  quitarResalteChip() {
    this.tablero.removeMarkers(MARCA_CHIP);
    for (const t of Object.values(FLECHAS_CHIP)) this.tablero.removeArrows(t);
  }

  quitarFlechas() {
    this.quitarResalteChip();
    this.tablero.removeArrows();
  }

  // Coordenadas en pantalla de una casilla (para poner iconos encima).
  rectanguloCasilla(casilla) {
    const el = this.tablero.context.querySelector(`[data-square="${casilla}"]`);
    return el ? el.getBoundingClientRect() : null;
  }
}
