// Análisis de partidas con Stockfish y "revisión" al estilo de las webs de ajedrez:
// clasificación de cada jugada, precisión de cada jugador y comentarios.
//
// Se guarda en la memoria SOLO la evaluación de cada posición (lo lento).
// La clasificación y la precisión se calculan al momento a partir de ella (es rápido),
// así que si cambiamos los criterios no hace falta volver a analizar.

import { guardar, obtener } from "./almacen.js";
import { MATE, motor, probGanar } from "./motor.js";
import { Chess, fase, leerPartida, resumen, tiempoBase } from "./util.js";

export const PROFUNDIDAD = 14;
const VERSION = 1; // súbelo si cambia lo que se guarda: obliga a re-analizar

// ------------------------------------------------------------------ clasificaciones
// Umbrales en puntos de "probabilidad de ganar" perdidos (los mismos que en el Python).
export const CLASES = {
  brillante:   { nombre: "Brillante",          simbolo: "!!", orden: 0 },
  genial:      { nombre: "Genial",             simbolo: "!",  orden: 1 },
  mejor:       { nombre: "Mejor",              simbolo: "★",  orden: 2 },
  excelente:   { nombre: "Excelente",          simbolo: "✓",  orden: 3 },
  buena:       { nombre: "Buena",              simbolo: "✓",  orden: 4 },
  libro:       { nombre: "Libro",              simbolo: "≡",  orden: 5 },
  imprecision: { nombre: "Imprecisión",        simbolo: "?!", orden: 6 },
  error:       { nombre: "Error",              simbolo: "?",  orden: 7 },
  oportunidad: { nombre: "Oportunidad perdida", simbolo: "✗", orden: 8 },
  blunder:     { nombre: "Blunder",            simbolo: "??", orden: 9 },
};
export const MALAS = new Set(["imprecision", "error", "oportunidad", "blunder"]);

// ------------------------------------------------------------------ analizar
const enCurso = new Map(); // url -> { promesa, oyentes }

export async function analisisGuardado(url) {
  const a = await obtener("analisis", url);
  return a && a.version === VERSION ? a : null;
}

/**
 * Analiza una partida (si no lo estaba ya). alProgreso(0..1) informa del avance.
 * Si ya se está analizando, se une a ese análisis en vez de empezar otro.
 */
export function analizarPartida(partida, alProgreso = () => {}) {
  const enMarcha = enCurso.get(partida.url);
  if (enMarcha) { enMarcha.oyentes.add(alProgreso); return enMarcha.promesa; }

  const oyentes = new Set([alProgreso]);
  const avisar = (x) => oyentes.forEach((f) => f(x));
  const promesa = (async () => {
    const previo = await analisisGuardado(partida.url);
    if (previo) return previo;
    const { inicio, jugadas } = leerPartida(partida);
    const fens = [inicio, ...jugadas.map((j) => j.fen)];
    const evals = [];
    for (const [i, fen] of fens.entries()) {
      const g = new Chess(fen);
      if (g.isCheckmate()) {
        evals.push({ cp: g.turn() === "w" ? -MATE : MATE, mate: 0, pv: [], segunda: null });
      } else if (g.isGameOver()) {
        evals.push({ cp: 0, mate: null, pv: [], segunda: null });
      } else {
        const [l1, l2] = await motor().analizar(fen, { profundidad: PROFUNDIDAD, multipv: 2 });
        evals.push({ cp: l1.cp, mate: l1.mate, pv: l1.pv.slice(0, 8), segunda: l2 ? l2.cp : null });
      }
      avisar((i + 1) / fens.length);
    }
    const analisis = { url: partida.url, usuario: partida.usuario, version: VERSION, profundidad: PROFUNDIDAD, evals };
    await guardar("analisis", analisis);
    return analisis;
  })();
  enCurso.set(partida.url, { promesa, oyentes });
  promesa.finally(() => enCurso.delete(partida.url));
  return promesa;
}

// ------------------------------------------------------------------ revisión
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NOMBRE_PIEZA = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };

function material(g, color) {
  let total = 0;
  for (const fila of g.board()) for (const c of fila) if (c) total += (c.color === color ? 1 : -1) * VALOR[c.type];
  return total;
}

function jugarUci(g, uci) {
  try { return g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { return null; }
}

function sanDe(fen, uci) {
  if (!uci) return null;
  return jugarUci(new Chess(fen), uci)?.san ?? null;
}

// Cuántas medias jugadas son "de libro", según el nombre de apertura de chess.com.
// Ej: ".../Caro-Kann-Defense-2.d4" -> la línea llega hasta 2.d4 -> 3 medias jugadas.
function pliesDeLibro(eco) {
  const m = (eco || "").match(/(\d+)\.(\.\.)?([A-Za-z][^-]*)$/);
  if (!m) return 4; // sin jugadas en el nombre: solo las primeras
  const n = Number(m[1]);
  return (n - 1) * 2 + (m[2] ? 2 : 1);
}

// ---- Precisión: método público de lichess ----
// 1) Cada jugada recibe una precisión según cuánta probabilidad de ganar pierde.
// 2) La media de cada jugador da MÁS PESO a las jugadas de los momentos tensos
//    (cuando la evaluación cambia mucho) y se combina con una media armónica,
//    que castiga más los errores grandes.
const wpLichess = (cp) => probGanar(Math.max(-1000, Math.min(1000, cp)));

function precisionJugada(perdida) {
  if (perdida <= 0) return 100;
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * perdida) - 3.1669 + 1));
}

function desviacion(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

// Pesos de "tensión" para cada jugada, a partir de la prob. de ganar (de blancas) de cada posición.
function pesosTension(wps) {
  const nJugadas = wps.length - 1;
  const ventana = Math.max(2, Math.min(8, Math.floor(nJugadas / 10)));
  const ventanas = [];
  for (let i = 0; i < Math.min(ventana, wps.length) - 2; i++) ventanas.push(wps.slice(0, ventana));
  for (let i = 0; i + ventana <= wps.length; i++) ventanas.push(wps.slice(i, i + ventana));
  return ventanas.map((v) => Math.max(0.5, Math.min(12, desviacion(v))));
}

function precisionJugador(precisiones, pesos) {
  if (!precisiones.length) return null;
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const ponderada = precisiones.reduce((a, p, i) => a + p * pesos[i], 0) / sumaPesos;
  const armonica = precisiones.length / precisiones.reduce((a, p) => a + 1 / Math.max(p, 1), 0);
  return (ponderada + armonica) / 2;
}

/**
 * Revisión completa: para cada jugada { clase, perdida, mejorUci, mejorSan, evalTexto, comentario… }
 * más la precisión y el recuento de clases de cada jugador.
 */
export function revisar(partida, analisis) {
  const { inicio, jugadas } = leerPartida(partida);
  const r = resumen(partida);
  const fens = [inicio, ...jugadas.map((j) => j.fen)];
  const ev = analisis.evals;
  const libro = pliesDeLibro(partida.eco);
  const base = tiempoBase(partida.time_control);
  const perdidas = [];

  const revisadas = jugadas.map((j, i) => {
    const antes = ev[i], despues = ev[i + 1];
    const signo = j.color === "w" ? 1 : -1;
    const wpAntes = probGanar(signo * antes.cp);
    const wpDespues = probGanar(signo * despues.cp);
    const perdida = Math.max(0, wpAntes - wpDespues);
    perdidas.push(perdida);
    const mejorUci = antes.pv[0] || null;
    const esMejor = mejorUci === j.uci;
    const perdidaRivalAnterior = i > 0 ? perdidas[i - 1] : 0;

    let clase;
    if (i < libro && perdida < 5) clase = "libro";
    else if (perdida >= 10 && perdidaRivalAnterior >= 15) clase = "oportunidad";
    else if (perdida >= 15) clase = "blunder";
    else if (perdida >= 10) clase = "error";
    else if (perdida >= 5) clase = "imprecision";
    else if (esMejor || perdida < 1) {
      clase = esMejor ? "mejor" : "excelente";
      if (esMejor && esSacrificio(fens[i], j, despues) && wpDespues >= 40 && wpAntes <= 95) clase = "brillante";
      else if (esMejor && antes.segunda != null && wpAntes - probGanar(signo * antes.segunda) >= 15
               && wpDespues <= 97 && !esRecaptura(jugadas, i)) clase = "genial";
    } else clase = perdida < 2.5 ? "excelente" : "buena";

    const perdidaLichess = Math.max(0, signo * (wpLichess(antes.cp) - wpLichess(despues.cp)));
    return {
      ...j, indice: i + 1, clase, perdida,
      fase: fase(fens[i]),
      apuros: j.reloj != null && base != null && j.reloj < Math.max(10, 0.1 * base),
      precision: precisionJugada(perdidaLichess),
      cp: despues.cp, mate: despues.mate,
      mejorUci: esMejor ? null : mejorUci,
      mejorSan: esMejor ? null : sanDe(fens[i], mejorUci),
      lineaMejor: antes.pv,
      fenAntes: fens[i],
      comentario: "",
    };
  });

  revisadas.forEach((m, i) => {
    const { texto, tipo } = comentar(m, ev[i], ev[i + 1]);
    m.comentario = texto;
    m.tipo = tipo; // material | mate_contra | mate_perdido | tactica (solo en jugadas malas)
  });
  // Máxima ventaja que llegó a tener cada bando (para "pierdes partidas ganadas").
  const wpBlancas = ev.map((e) => probGanar(e.cp));
  const maxVentaja = { w: Math.max(...wpBlancas.slice(1)), b: Math.max(...wpBlancas.slice(1).map((x) => 100 - x)) };

  const pesos = pesosTension(ev.map((e) => wpLichess(e.cp)));
  const jugador = (color) => {
    const indices = revisadas.map((m, i) => i).filter((i) => revisadas[i].color === color);
    const cuenta = Object.fromEntries(Object.keys(CLASES).map((c) => [c, 0]));
    indices.forEach((i) => (cuenta[revisadas[i].clase] += 1));
    const precision = precisionJugador(indices.map((i) => revisadas[i].precision), indices.map((i) => pesos[i] ?? 1));
    return { precision, cuenta };
  };
  return {
    inicio, jugadas: revisadas, evalInicial: ev[0].cp, colorUsuario: r.color,
    blancas: jugador("w"), negras: jugador("b"), maxVentaja,
  };
}

// ¿Entrega material a propósito? (tras la respuesta del rival y la tuya, sigues con ≥2 puntos menos)
function esSacrificio(fenAntes, jugada, despues) {
  const g = new Chess(fenAntes);
  const antes = material(g, jugada.color);
  jugarUci(g, jugada.uci);
  for (const u of despues.pv.slice(0, 2)) if (!jugarUci(g, u)) return false;
  return antes - material(g, jugada.color) >= 2;
}

// Recapturar en la misma casilla suele ser la "única jugada", pero no tiene mérito.
function esRecaptura(jugadas, i) {
  return i > 0 && jugadas[i].san.includes("x") && jugadas[i - 1].uci.slice(2, 4) === jugadas[i].uci.slice(2, 4);
}

// ------------------------------------------------------------------ comentarios
export function textoEval(cp, mate) {
  if (mate === 0) return "Mate";
  if (mate) return (mate > 0 ? "+M" : "-M") + Math.abs(mate);
  return (cp >= 0 ? "+" : "") + (cp / 100).toFixed(2);
}

// Devuelve { texto, tipo }. tipo (solo en jugadas malas): material | mate_contra | mate_perdido | tactica
function comentar(m, antes, despues) {
  const yo = m.color;
  const rivalMate = despues.mate != null && (yo === "w" ? despues.mate < 0 : despues.mate > 0) && despues.mate !== 0;
  const teniaMate = antes.mate != null && (yo === "w" ? antes.mate > 0 : antes.mate < 0);
  const mejor = m.mejorSan ? `Lo mejor era <b>${m.mejorSan}</b>.` : "";
  const buena = (texto) => ({ texto, tipo: null });

  switch (m.clase) {
    case "brillante": return buena(`¡Sacrificio brillante! Entregas material pero la posición lo compensa.`);
    case "genial": return buena(`¡La única jugada buena! Cualquier otra empeoraba mucho la posición.`);
    case "mejor": return buena(teniaMate ? `Es la mejor: lleva al mate.` : `Es la mejor jugada.`);
    case "excelente": return buena(`Excelente jugada, casi tan buena como la mejor.`);
    case "buena": return buena(`Buena jugada. ${mejor}`);
    case "libro": return buena(`Jugada de apertura conocida (teoría).`);
  }
  // Jugadas malas: intentamos explicar por qué (en tercera persona, por colores,
  // porque la jugada puede ser tuya o de tu rival).
  const otro = yo === "w" ? "las negras" : "las blancas";
  const Otro = otro[0].toUpperCase() + otro.slice(1);
  if (teniaMate && !(despues.mate != null && Math.sign(despues.mate) === Math.sign(antes.mate)))
    return { texto: `Había mate en ${Math.abs(antes.mate)} y se deja escapar. ${mejor}`, tipo: "mate_perdido" };
  if (rivalMate) return { texto: `Permite a ${otro} dar mate en ${Math.abs(despues.mate)}. ${mejor}`, tipo: "mate_contra" };
  const g = new Chess(m.fen);
  const antesMat = material(new Chess(m.fenAntes), yo);
  const respuesta = despues.pv[0] ? jugarUci(g, despues.pv[0]) : null;
  for (const u of despues.pv.slice(1, 4)) jugarUci(g, u);
  const perdido = antesMat - material(g, yo);
  let porque = "";
  if (perdido >= 2 && respuesta) {
    porque = respuesta.captured
      ? `${Otro} responden <b>${respuesta.san}</b> y ganan ${perdido >= 3 ? "material" : "al menos un peón"} (${NOMBRE_PIEZA[respuesta.captured]}).`
      : `Tras <b>${respuesta.san}</b> se acaba perdiendo material.`;
  } else if (respuesta) {
    porque = `${Otro} pueden responder <b>${respuesta.san}</b> y su posición mejora mucho.`;
  }
  const tipo = perdido >= 3 ? "material" : "tactica";
  if (m.clase === "oportunidad")
    return { texto: `La jugada anterior era un error de ${otro} y no se aprovecha. ${mejor}`, tipo };
  const titulo = { imprecision: "Imprecisión", error: "Error", blunder: "Error grave (blunder)" }[m.clase];
  return { texto: `${titulo}. ${porque} ${mejor}`.trim(), tipo };
}

// ------------------------------------------------------------------ corregir una jugada
/**
 * ¿Cuánto empeora 'uci' la posición 'fen'? Lo usan Ejercicios, Jugar y Entrenar.
 * Devuelve { perdida, esLaMejor, mejorUci, mejorSan, cpDespues, mateDespues }
 * (perdida en puntos de probabilidad de ganar del bando que mueve).
 */
export async function corregirJugada(fen, uci, { profundidad = PROFUNDIDAD } = {}) {
  const g = new Chess(fen);
  const signo = g.turn() === "w" ? 1 : -1;
  const [antes] = await motor().analizar(fen, { profundidad });
  const m = jugarUci(g, uci);
  let despues;
  if (g.isCheckmate()) despues = { cp: signo * MATE, mate: 0 };
  else if (g.isGameOver()) despues = { cp: 0, mate: null };
  else [despues] = await motor().analizar(g.fen(), { profundidad });
  const perdida = Math.max(0, probGanar(signo * antes.cp) - probGanar(signo * despues.cp));
  return {
    perdida, san: m?.san,
    esLaMejor: antes.pv[0] === uci,
    mejorUci: antes.pv[0], mejorSan: sanDe(fen, antes.pv[0]), lineaMejor: antes.pv,
    cpDespues: despues.cp, mateDespues: despues.mate,
  };
}

// ------------------------------------------------------------------ analizar muchas
let colaTodas = null;
const oyentesTodas = new Set();
export function analizarVarias(partidas, alProgreso) {
  oyentesTodas.add(alProgreso);
  if (colaTodas) return colaTodas; // ya en marcha: solo nos apuntamos para ver el progreso
  const avisar = (...x) => oyentesTodas.forEach((f) => f(...x));
  colaTodas = (async () => {
    let hechas = 0;
    for (const p of partidas) {
      avisar(hechas, partidas.length, p);
      await analizarPartida(p);
      hechas += 1;
    }
    avisar(hechas, partidas.length, null);
  })().finally(() => { colaTodas = null; oyentesTodas.clear(); });
  return colaTodas;
}
export const analizandoVarias = () => !!colaTodas;
