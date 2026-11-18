// Stockfish dentro del navegador (WebAssembly), en un Web Worker para no congelar la página.
// Hablamos con él en UCI, el "idioma" estándar de los motores de ajedrez:
//   nosotros: "position fen ..." + "go depth 12"
//   él:       "info depth 12 score cp 35 pv e2e4 e7e5 ..." ... "bestmove e2e4"

export const MATE = 10000;
const RUTA = "vendor/stockfish/bin/stockfish-18-lite-single.js";

// Probabilidad de ganar (0-100) a partir de centipeones. Misma fórmula que usábamos en Python.
export function probGanar(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export class Motor {
  constructor() {
    this.worker = new Worker(RUTA);
    this.cola = Promise.resolve(); // las órdenes se ejecutan de una en una
    this.listo = this._enviarHasta("uci", "uciok").then(() => this._enviarHasta("isready", "readyok"));
  }

  // Envía una orden y espera hasta recibir una línea que empiece por 'fin'.
  _enviarHasta(orden, fin, alLinea) {
    return new Promise((resolver) => {
      const oyente = (e) => {
        const linea = String(e.data);
        if (alLinea) alLinea(linea);
        if (linea.startsWith(fin)) {
          this.worker.removeEventListener("message", oyente);
          resolver(linea);
        }
      };
      this.worker.addEventListener("message", oyente);
      this.worker.postMessage(orden);
    });
  }

  // Pone una tarea en la cola (Stockfish solo puede pensar en una cosa a la vez).
  _enCola(tarea) {
    const resultado = this.cola.then(() => this.listo).then(tarea);
    this.cola = resultado.catch(() => {});
    return resultado;
  }

  /**
   * Analiza una posición. Devuelve una lista (una por cada línea de multipv) de
   * { cp, mate, pv } con la evaluación DESDE EL PUNTO DE VISTA DE LAS BLANCAS.
   *  - cp: centipeones (100 = un peón). Un mate cuenta como ±10000.
   *  - mate: nº de jugadas hasta el mate (positivo = ganan blancas), o null.
   *  - pv: la línea recomendada, en formato "e2e4".
   */
  analizar(fen, { profundidad = 12, multipv = 1 } = {}) {
    return this._enCola(async () => {
      const turnoBlancas = fen.split(" ")[1] === "w";
      const lineas = [];
      this.worker.postMessage("setoption name UCI_LimitStrength value false");
      this.worker.postMessage("setoption name Skill Level value 20");
      this.worker.postMessage(`setoption name MultiPV value ${multipv}`);
      this.worker.postMessage(`position fen ${fen}`);
      await this._enviarHasta(`go depth ${profundidad}`, "bestmove", (l) => {
        if (!l.startsWith("info") || !l.includes(" pv ")) return;
        const n = Number((l.match(/ multipv (\d+)/) || [0, 1])[1]);
        const cpM = l.match(/ score cp (-?\d+)/);
        const mateM = l.match(/ score mate (-?\d+)/);
        let cp, mate = null;
        if (mateM) {
          mate = Number(mateM[1]);
          cp = mate > 0 ? MATE - mate : -MATE - mate;
        } else if (cpM) {
          cp = Number(cpM[1]);
        } else return;
        const signo = turnoBlancas ? 1 : -1; // Stockfish habla desde el bando que mueve
        lineas[n - 1] = {
          cp: signo * cp,
          mate: mate === null ? null : signo * mate,
          pv: l.split(" pv ")[1].trim().split(" "),
        };
      });
      return lineas.filter(Boolean);
    });
  }

  // Corta la búsqueda en curso: Stockfish responde enseguida con lo que tenga hasta ese momento.
  detener() {
    this.worker.postMessage("stop");
  }

  /**
   * Elige una jugada para jugar contra ti, con una fuerza limitada.
   *   skill: 0-20 (Skill Level) · elo: ELO aproximado (solo >= 1320) · ms: tiempo para pensar
   */
  jugar(fen, { skill = 20, elo = null, ms = 300, profundidad = null } = {}) {
    return this._enCola(async () => {
      this.worker.postMessage(`setoption name MultiPV value 1`);
      this.worker.postMessage(`setoption name Skill Level value ${skill}`);
      this.worker.postMessage(`setoption name UCI_LimitStrength value ${elo ? "true" : "false"}`);
      if (elo) this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
      this.worker.postMessage(`position fen ${fen}`);
      const orden = profundidad ? `go depth ${profundidad} movetime ${ms}` : `go movetime ${ms}`;
      const linea = await this._enviarHasta(orden, "bestmove");
      return linea.split(" ")[1];
    });
  }
}

// Una sola instancia para toda la web.
let motorUnico = null;
export function motor() {
  if (!motorUnico) motorUnico = new Motor();
  return motorUnico;
}
