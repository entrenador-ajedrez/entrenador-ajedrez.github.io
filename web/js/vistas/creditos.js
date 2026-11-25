// Créditos y licencias de lo que usa la web (obligatorio por sus licencias).
export function montar(vista) {
  vista.innerHTML = `
    <section class="creditos">
      <div class="cabecera-vista"><h1>Créditos y licencias</h1></div>
      <p>Esta web es software libre (GPLv3) y funciona entera en tu navegador. Usa:</p>
      <ul>
        <li><b>Stockfish 18</b> (motor de ajedrez), compilado para navegador por
          <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">stockfish.js</a> — licencia GPLv3.</li>
        <li><b>cm-chessboard</b> de Stefan Haack (tablero) —
          <a href="https://github.com/shaack/cm-chessboard" target="_blank" rel="noopener">licencia MIT</a>.</li>
        <li><b>chess.js</b> (reglas del ajedrez) —
          <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noopener">licencia BSD-2</a>.</li>
        <li><b>Piezas e icono de la web</b>: diseño de Cburnett (Wikimedia Commons), adaptadas por cm-chessboard —
          <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a>.</li>
        <li>Datos de las partidas: <a href="https://www.chess.com/news/view/published-data-api" target="_blank" rel="noopener">API pública de chess.com</a>.
          Esta web no está afiliada a chess.com.</li>
      </ul>
      <p class="suave">Visitas: la web cuenta de forma anónima cuántas personas la abren, con
        <a href="https://www.goatcounter.com" target="_blank" rel="noopener">GoatCounter</a> (sin cookies, sin datos personales).
        Tus partidas y análisis no salen de tu navegador.</p>
    </section>`;
}
