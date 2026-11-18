// Descarga de partidas desde la API pública de chess.com (no hace falta contraseña).
//
// Cómo funciona la memoria:
//  - La primera vez descargamos los últimos 3 meses.
//  - Las siguientes, solo los meses que aún no estaban "completos" (normalmente el mes
//    actual): un mes que ya terminó no cambia, así que no se vuelve a pedir.
//  - Guardamos como máximo 6 meses: lo más antiguo se borra.

import { borrar, guardar, obtener, todosDeUsuario } from "./almacen.js";

const API = "https://api.chess.com/pub/player/";
const DIA = 86400;
const PRIMERA_VEZ = 90 * DIA;   // ~3 meses
const MAXIMO = 183 * DIA;       // ~6 meses

async function pedirJSON(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`chess.com respondió ${r.status}`);
  return r.json();
}

// "2026/09" a partir de una fecha (en UTC, como chess.com)
function mes(fecha) {
  return `${fecha.getUTCFullYear()}/${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function perfil(usuario) {
  return pedirJSON(API + encodeURIComponent(usuario.trim().toLowerCase()));
}

// Lo que guardamos de cada partida (solo lo necesario).
function resumir(p, usuario) {
  const jugador = (j) => ({ username: j.username, rating: j.rating, result: j.result });
  return {
    url: p.url,
    id: p.url.split("/").pop(),
    usuario,
    end_time: p.end_time,
    time_class: p.time_class,
    time_control: p.time_control,
    rated: p.rated,
    white: jugador(p.white),
    black: jugador(p.black),
    eco: p.eco || "",
    pgn: p.pgn,
  };
}

/**
 * Trae las partidas nuevas de 'usuario' y las guarda en la memoria.
 * alProgreso(texto) sirve para enseñar en pantalla lo que va haciendo.
 * Devuelve { nuevas, borradas, total }.
 */
export async function sincronizar(usuario, alProgreso = () => {}) {
  usuario = usuario.toLowerCase();
  const ahora = Date.now() / 1000;
  const clave = "usuario:" + usuario;
  let meta = await obtener("meta", clave);
  if (!meta) meta = { clave, usuario, desde: ahora - PRIMERA_VEZ, completos: [] };
  const desde = Math.max(meta.desde, ahora - MAXIMO);
  const mesActual = mes(new Date());
  const mesDesde = mes(new Date(desde * 1000));

  alProgreso("Consultando chess.com…");
  const lista = await pedirJSON(API + encodeURIComponent(usuario) + "/games/archives");
  if (!lista) throw new Error(`El usuario "${usuario}" no existe en chess.com`);
  const pendientes = lista.archives.filter((url) => {
    const m = url.slice(-7); // "2026/09"
    return m >= mesDesde && !meta.completos.includes(m);
  });

  let nuevas = 0;
  for (const [i, url] of pendientes.entries()) {
    const m = url.slice(-7);
    alProgreso(`Descargando ${m.replace("/", "-")} (${i + 1}/${pendientes.length})…`);
    const datos = await pedirJSON(url);
    for (const p of datos?.games || []) {
      if (p.rules !== "chess" || !p.pgn || p.end_time < desde) continue;
      if (!(await obtener("partidas", p.url))) nuevas += 1;
      await guardar("partidas", resumir(p, usuario));
    }
    if (m < mesActual) meta.completos.push(m); // ese mes ya no cambiará
  }

  // Límite de 6 meses: borramos lo más antiguo (y su análisis).
  let borradas = 0;
  const limite = ahora - MAXIMO;
  const guardadas = await todosDeUsuario("partidas", usuario);
  for (const p of guardadas) {
    if (p.end_time < limite) {
      await borrar("partidas", p.url);
      await borrar("analisis", p.url);
      borradas += 1;
    }
  }
  meta.completos = meta.completos.filter((m) => m >= mes(new Date(limite * 1000)));
  meta.ultimaSync = ahora;
  await guardar("meta", meta);
  return { nuevas, borradas, total: guardadas.length - borradas };
}
