// Notación y "chips" de jugada.
//  - Convierte una jugada (SAN + posición anterior) a tres formatos: Sencilla (palabras + dibujo de la pieza,
//    con la notación española pequeña al lado), Española (A/C/T/D/R) e Inglesa (la de siempre).
//  - Los tres textos van dentro del HTML y el CSS enseña solo el elegido (html[data-notacion]):
//    cambiar el ajuste no obliga a repintar nada.
//  - Un "chip" es una jugada pulsable: al pasar el ratón o tocarla dibuja la flecha y resalta las casillas
//    en el tablero de la pantalla (o, si no hay tablero, enlaza a la posición con data-href).

import { Chess, esc } from "./util.js";

export const MODOS = { sencilla: "Sencilla", espanola: "Española", inglesa: "Inglesa" };
const CLAVE = "notacion";

export function modo() {
  try { const m = localStorage.getItem(CLAVE); if (m && MODOS[m]) return m; } catch { /* sin memoria */ }
  return "sencilla";
}
export function fijarModo(m) {
  if (!MODOS[m]) return;
  try { localStorage.setItem(CLAVE, m); } catch { /* sin memoria */ }
  document.documentElement.dataset.notacion = m;
}
document.documentElement.dataset.notacion = modo();

// ------------------------------------------------------------------ nombres
const PIEZA = { p: "Peón", n: "Caballo", b: "Alfil", r: "Torre", q: "Dama", k: "Rey" };
const PIEZA_LC = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
// Piezas macizas (se leen mejor en pequeño); ︎ evita que el móvil las pinte como emoji.
const DIBUJO = { p: "♟︎", n: "♞︎", b: "♝︎", r: "♜︎", q: "♛︎", k: "♚︎" };
const LETRA_ES = { K: "R", Q: "D", R: "T", B: "A", N: "C" };
export const nombrePieza = (t) => PIEZA[t] || "";
export const dibujoPieza = (t) => DIBUJO[t] || "";

export function espanola(san) {
  return san.replace(/^[KQRBN]/, (c) => LETRA_ES[c]).replace(/=([QRBN])/, (_, c) => "=" + LETRA_ES[c]);
}

// Jugada de chess.js a partir de la posición anterior y su SAN (o null si no encaja).
function jugadaDe(fenAntes, san) {
  try { return new Chess(fenAntes).move(san); } catch { return null; }
}

function sencilla(m) {
  const sufijo = m.san.endsWith("#") ? ", ¡jaque mate!" : m.san.endsWith("+") ? ", con jaque" : "";
  if (m.flags.includes("k")) return `Enroque corto${sufijo}`;
  if (m.flags.includes("q")) return `Enroque largo${sufijo}`;
  const desambigua = m.piece !== "p" && m.san.replace(/[x+#]|=.*/g, "").length > 3;
  const origen = desambigua ? ` de ${m.from}` : "";
  const verbo = m.captured ? "captura en" : "a";
  let t = `${PIEZA[m.piece]}${origen} ${verbo} ${m.to}`;
  if (m.flags.includes("e")) t += " (al paso)";
  if (m.promotion) t += ` y corona a ${PIEZA[m.promotion]}`;
  return t + sufijo;
}

/** Los tres formatos de una jugada: { sen, esp, ing, corto, from, to }. */
export function variantes(fenAntes, san) {
  const m = jugadaDe(fenAntes, san);
  const esp = espanola(san);
  if (!m) return { sen: esc(san), senChip: esc(san), esp: esc(esp), ing: esc(san), corto: esc(san), from: null, to: null };
  const enroque = m.flags.includes("k") || m.flags.includes("q");
  const dib = enroque ? DIBUJO.k : DIBUJO[m.piece];
  return {
    sen: `<span class="pz">${dib}</span>&nbsp;${esc(sencilla(m))} <small>· ${esc(esp)}</small>`,
    senChip: `<span class="pz">${dib}</span>&nbsp;${esc(sencilla(m))}`,   // dentro de frases: sin repetir la notación
    esp: esc(esp),
    ing: esc(san),
    corto: `<span class="pz">${dib}</span>${esc(esp)}`,   // para la tira de jugadas
    from: m.from, to: m.to,
  };
}

/** Texto plano de la jugada en el formato elegido (para title="…" o textos sin HTML). */
export function texto(fenAntes, san) {
  const m = jugadaDe(fenAntes, san);
  if (modo() === "inglesa" || !m) return san;
  return modo() === "espanola" ? espanola(san) : `${sencilla(m)} · ${espanola(san)}`;
}

const tresSpans = (v, claveSen = "sen") =>
  `<span class="n-sen">${v[claveSen]}</span><span class="n-esp">${v.esp}</span><span class="n-ing">${v.ing}</span>`;

/**
 * Jugada pulsable. tipo: "jugada" (azul) | "error" (rojo) | "mejor" (verde).
 * opciones.href: a dónde ir si la pantalla no tiene tablero (Informe).
 */
export function chip(fenAntes, san, tipo = "jugada", { href = "" } = {}) {
  const v = variantes(fenAntes, san);
  if (!v.from) return `<b>${esc(san)}</b>`;
  return `<span class="chip chip-${tipo}" role="button" tabindex="0" data-from="${v.from}" data-to="${v.to}" data-tipo="${tipo}"` +
    `${href ? ` data-href="${esc(href)}"` : ""} title="Ver en el tablero: ${esc(espanola(san))}">${tresSpans(v, "senChip")}</span>`;
}

/** Jugada compacta sin pulsar (tira de jugadas): dibujo + notación española en Sencilla. */
export function corta(fenAntes, san) {
  const v = variantes(fenAntes, san);
  return `<span class="n-sen">${v.corto}</span><span class="n-esp">${v.esp}</span><span class="n-ing">${v.ing}</span>`;
}

/** Jugada sin chip (negrita) con los tres formatos, para listas largas donde un chip estorba. */
export function negrita(fenAntes, san) {
  return `<b>${tresSpans(variantes(fenAntes, san))}</b>`;
}

/** Lista de SAN seguidas desde una posición: chips (para líneas "de la partida"). */
export function lineaChips(fenInicial, sans, tipo = "jugada") {
  const g = new Chess(fenInicial);
  const trozos = [];
  for (const san of sans) {
    const fen = g.fen();
    let ok = true;
    try { g.move(san); } catch { ok = false; }
    if (!ok) break;
    trozos.push(chip(fen, san, tipo));
  }
  return trozos.join(" ");
}

/** "Mueve el peón de e2 a e4" (guía de Entrenar). */
export function instruccion(fenAntes, san) {
  const m = jugadaDe(fenAntes, san);
  if (!m) return `Juega ${esc(san)}`;
  if (m.flags.includes("k")) return "Haz el enroque corto: mueve el rey dos casillas hacia la torre de la derecha";
  if (m.flags.includes("q")) return "Haz el enroque largo: mueve el rey dos casillas hacia la torre de la izquierda";
  const cap = m.captured ? ` y captura el ${PIEZA_LC[m.captured]}` : "";
  const cor = m.promotion ? ` y corónalo a ${PIEZA_LC[m.promotion]}` : "";
  return `Mueve el ${PIEZA_LC[m.piece]} de ${m.from} a ${m.to}${cap}${cor}`;
}

// ------------------------------------------------------------------ ajuste en la pantalla
const AYUDA = {
  sencilla: "Palabras y dibujo de la pieza, con la notación pequeña al lado: «♘ Caballo a f3 · Cf3»",
  espanola: "Solo letras en español: Cf3, Axd4, Dh5 (C caballo, A alfil, T torre, D dama, R rey)",
  inglesa: "La notación de siempre en inglés: Nf3, Bxd4, Qh5 (N caballo, B alfil, R torre, Q dama, K rey)",
};
/** Botón «Aa Notación» con un menú de tres opciones. Se pinta una vez en el menú lateral. */
export function montarAjuste(caja) {
  const pinta = () => {
    const actual = modo();
    caja.innerHTML = `<button type="button" class="btn-notacion" aria-haspopup="true" aria-expanded="false"
        title="Cómo se escriben las jugadas" aria-label="Notación: ${MODOS[actual]}. Cambiar cómo se escriben las jugadas"><b>Aa</b><span class="solo-pc"> Notación: ${MODOS[actual]}</span><span class="caret" aria-hidden="true">▾</span></button>
      <div class="menu-notacion" hidden role="menu">
        <div class="menu-titulo">Cómo escribir las jugadas</div>
        ${Object.entries(MODOS).map(([k, n]) => `<button type="button" role="menuitemradio" data-modo="${k}"
          aria-checked="${k === actual}" class="${k === actual ? "activo" : ""}"><b>${n}</b><span>${AYUDA[k]}</span></button>`).join("")}
      </div>`;
    const boton = caja.querySelector(".btn-notacion"), menu = caja.querySelector(".menu-notacion");
    const cerrar = () => { menu.hidden = true; boton.setAttribute("aria-expanded", "false"); };
    boton.onclick = (ev) => {
      ev.stopPropagation();
      menu.hidden = !menu.hidden; boton.setAttribute("aria-expanded", String(!menu.hidden));
    };
    menu.onclick = (ev) => ev.stopPropagation();
    menu.querySelectorAll("[data-modo]").forEach((b) => { b.onclick = () => { fijarModo(b.dataset.modo); pinta(); }; });
  };
  pinta();
  document.addEventListener("click", () => {
    const m = caja.querySelector(".menu-notacion");
    if (m && !m.hidden) { m.hidden = true; caja.querySelector(".btn-notacion").setAttribute("aria-expanded", "false"); }
  });
}

// ------------------------------------------------------------------ chips -> tablero
let tableroActivo = null;     // el Tablero de la pantalla actual (o null si no tiene)
let fijado = null;            // chip pulsado (se queda dibujado hasta pulsar otro sitio)

/** Cada pantalla con tablero lo registra al montarse; main.js lo suelta al cambiar de pantalla. */
export function usarTablero(t) { tableroActivo = t; fijado = null; }

function mostrar(el) {
  if (!tableroActivo) return;
  try { tableroActivo.resaltarChip(el.dataset.from, el.dataset.to, el.dataset.tipo); } catch (e) { console.warn("chip:", e); }
}
function quitar() {
  if (!tableroActivo) return;
  try { tableroActivo.quitarResalteChip(); } catch (e) { console.warn("chip:", e); }
}

const hayFijado = () => !!fijado && fijado.isConnected;
function alChip(ev, f) {
  const el = ev.target.closest?.(".chip");
  if (el) f(el);
}
document.addEventListener("pointerover", (ev) => {
  if (ev.pointerType === "mouse") alChip(ev, (el) => { if (!hayFijado()) mostrar(el); });
});
document.addEventListener("pointerout", (ev) => {
  if (ev.pointerType === "mouse") alChip(ev, () => { if (!hayFijado()) quitar(); });
});
document.addEventListener("click", (ev) => {
  const el = ev.target.closest?.(".chip");
  if (!el) { if (fijado) { fijado = null; quitar(); } return; }
  if (!tableroActivo) { if (el.dataset.href) location.hash = el.dataset.href; return; }
  if (fijado === el) { fijado = null; quitar(); return; }
  fijado = el; mostrar(el);
});
document.addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList?.contains("chip")) { ev.preventDefault(); ev.target.click(); }
});
