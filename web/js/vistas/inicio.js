// Pantalla de inicio: conectar tu usuario de chess.com.

import { perfil, sincronizar } from "../chesscom.js";
import { $, esc } from "../util.js";

export function montar(vista, { entrar }) {
  vista.innerHTML = `
    <section class="inicio">
      <h1>Aprende de tus propias partidas</h1>
      <p class="suave">Escribe tu nombre de usuario de chess.com. Descargaremos tus partidas de los últimos
        3 meses y Stockfish te enseñará dónde fallas y cómo mejorar.</p>
      <form id="form-usuario">
        <input id="usuario" placeholder="Tu usuario de chess.com" autocomplete="username" autofocus required>
        <button class="principal" type="submit">Conectar</button>
      </form>
      <p id="estado-inicio" class="progreso-texto"></p>
      <div class="tarjeta">
        <b>🔒 Sin contraseña.</b>
        <p class="suave" style="margin:6px 0 0">Tus partidas de chess.com son públicas: solo necesitamos tu
        nombre de usuario. Todo se guarda en <b>este navegador</b>; no se envía a ningún servidor nuestro.
        La próxima vez que entres solo se descargarán las partidas nuevas (guardamos hasta 6 meses).</p>
      </div>
    </section>`;

  $("#form-usuario").onsubmit = async (ev) => {
    ev.preventDefault();
    const boton = vista.querySelector("button[type=submit]");
    const estadoTxt = $("#estado-inicio");
    const usuario = $("#usuario").value.trim();
    if (!usuario) return;
    boton.disabled = true;
    estadoTxt.className = "progreso-texto";
    try {
      estadoTxt.textContent = "Buscando el usuario…";
      const p = await perfil(usuario);
      if (!p) throw new Error(`No existe ningún usuario "${usuario}" en chess.com.`);
      const r = await sincronizar(p.username.toLowerCase(), (t) => (estadoTxt.textContent = t));
      estadoTxt.textContent = `¡Listo! ${r.total} partidas guardadas.`;
      await entrar(p.username);
    } catch (err) {
      estadoTxt.className = "progreso-texto error";
      estadoTxt.innerHTML = esc(err.message);
      boton.disabled = false;
    }
  };
}
