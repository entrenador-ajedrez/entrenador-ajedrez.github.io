"""Paso 2: analiza cada partida con Stockfish y guarda tus errores en analisis.json.

Uso:  python analizar.py [--profundidad 10]

Se puede interrumpir con Ctrl+C: el progreso se guarda y al volver a
ejecutarlo continúa donde lo dejó.
"""
import argparse
import io
import json
import math
import os
import shutil
import sys
import time
from pathlib import Path

import chess
import chess.engine
import chess.pgn

AQUI = Path(__file__).parent
VALOR = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
MATE = 10000  # un mate cuenta como +100 peones de ventaja
TABLAS = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
# Palabras con las que suele terminar el nombre "familia" de una apertura.
FINALES_APERTURA = {"Defense", "Opening", "Game", "Gambit", "Attack", "System"}

# Umbrales de gravedad, en puntos de "probabilidad de ganar" perdidos con una jugada
# (son los mismos criterios que usa lichess).
UMBRAL_BLUNDER = 15
UMBRAL_ERROR = 10


def encontrar_stockfish():
    """Busca el programa Stockfish en los sitios habituales."""
    if os.environ.get("STOCKFISH_PATH"):
        return Path(os.environ["STOCKFISH_PATH"])
    ruta = shutil.which("stockfish")
    if ruta:
        return Path(ruta)
    # winget lo instala dentro de esta carpeta:
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    for exe in base.glob("Stockfish*/**/stockfish*.exe"):
        return exe
    sys.exit("No encuentro Stockfish. Instálalo con:  winget install Stockfish.Stockfish\n"
             "o indica dónde está con la variable STOCKFISH_PATH.")


def prob_ganar(cp):
    """Convierte una ventaja en centipeones (100 = un peón) en % de probabilidad de ganar."""
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def material(tablero, color):
    """Material de 'color' menos el del rival (peón=1, caballo/alfil=3, torre=5, dama=9)."""
    total = 0
    for pieza, valor in VALOR.items():
        total += valor * (len(tablero.pieces(pieza, color)) - len(tablero.pieces(pieza, not color)))
    return total


def fase(tablero):
    """Decide la fase de la partida según el número de jugada y las piezas que quedan."""
    piezas = sum(VALOR[p] * len(tablero.pieces(p, c))
                 for p in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
                 for c in (chess.WHITE, chess.BLACK))
    if piezas <= 26:  # al empezar hay 62; con <=26 quedan pocas piezas grandes
        return "final"
    if tablero.fullmove_number <= 12:
        return "apertura"
    return "medio juego"


def tiempo_base(control):
    """'600+5' -> 600 segundos. Las partidas diarias ('1/86400') no tienen reloj útil."""
    if not control or "/" in control:
        return None
    try:
        return int(control.split("+")[0])
    except ValueError:
        return None


def nombre_apertura(eco_url):
    """Saca el nombre de la apertura de la URL que da chess.com.

    Ej: .../openings/Sicilian-Defense-Bowdlers-Attack-2...Nc6
        -> ("Sicilian Defense Bowdlers Attack", "Sicilian Defense")
    """
    if "/openings/" not in eco_url:
        return "Desconocida", "Desconocida"
    palabras = []
    for w in eco_url.split("/openings/")[-1].split("-"):
        if not w or w[0].isdigit():  # a partir de aquí vienen las jugadas
            break
        if "." in w:  # p. ej. "Open...4.Nxd4": la palabra va pegada a las jugadas
            if w.split(".")[0]:
                palabras.append(w.split(".")[0])
            break
        palabras.append(w)
    if not palabras:
        return "Desconocida", "Desconocida"
    familia = palabras[:3]
    for i, w in enumerate(palabras):
        if w in FINALES_APERTURA:
            familia = palabras[:i + 1]
            break
    return " ".join(palabras), " ".join(familia)


def evaluar(motor, tablero, limite):
    """Pide a Stockfish la evaluación (desde el punto de vista de las blancas) y su línea."""
    if tablero.is_checkmate():
        return (-MATE if tablero.turn == chess.WHITE else MATE), []
    if tablero.is_game_over():
        return 0, []
    info = motor.analyse(tablero, limite)
    return info["score"].white().score(mate_score=MATE), info.get("pv", [])


def clasificar(antes, despues, yo, cp_yo_antes, cp_yo_despues, linea):
    """Intenta explicar POR QUÉ una jugada fue mala."""
    if cp_yo_despues <= -MATE + 100:
        return "mate_contra"   # dejaste un mate al rival
    if cp_yo_antes >= MATE - 100:
        return "mate_perdido"  # tenías mate y no lo diste
    # Jugamos 4 medias jugadas de la mejor línea y miramos si perdiste material.
    tab = despues.copy()
    for mv in linea[:4]:
        if not tab.is_legal(mv):
            break
        tab.push(mv)
    if material(antes, yo) - material(tab, yo) >= 3:
        return "material"      # pieza colgada, ataque doble...
    return "tactica"


def analizar_partida(motor, p, usuario, limite):
    juego = chess.pgn.read_game(io.StringIO(p["pgn"]))
    if juego is None:
        return None
    yo = chess.WHITE if p["white"]["username"].lower() == usuario else chess.BLACK
    mio, rival = (p["white"], p["black"]) if yo == chess.WHITE else (p["black"], p["white"])
    codigo = mio["result"]
    resultado = "victoria" if codigo == "win" else "tablas" if codigo in TABLAS else "derrota"
    motivo = rival["result"] if resultado == "victoria" else codigo
    base = tiempo_base(p.get("time_control", ""))
    signo = 1 if yo == chess.WHITE else -1
    completo, familia = nombre_apertura(juego.headers.get("ECOUrl", ""))

    tablero = juego.board()
    cp, linea = evaluar(motor, tablero, limite)
    errores, max_ventaja, mis_jugadas = [], 50.0, 0
    jugadas_por_fase = {"apertura": 0, "medio juego": 0, "final": 0}

    for nodo in juego.mainline():
        antes = tablero.copy()
        es_mia = tablero.turn == yo
        san = tablero.san(nodo.move)
        fase_actual = fase(tablero)
        mejor = antes.san(linea[0]) if linea and antes.is_legal(linea[0]) else None
        tablero.push(nodo.move)
        cp_desp, linea_desp = evaluar(motor, tablero, limite)

        if es_mia:
            mis_jugadas += 1
            jugadas_por_fase[fase_actual] += 1
            wp_antes, wp_desp = prob_ganar(signo * cp), prob_ganar(signo * cp_desp)
            max_ventaja = max(max_ventaja, wp_desp)
            perdida = wp_antes - wp_desp
            gravedad = ("blunder" if perdida >= UMBRAL_BLUNDER
                        else "error" if perdida >= UMBRAL_ERROR else None)
            if gravedad:
                reloj = nodo.clock()
                errores.append({
                    "jugada": antes.fullmove_number,
                    "san": san,
                    "mejor": mejor,
                    "fase": fase_actual,
                    "gravedad": gravedad,
                    "perdida": round(perdida, 1),
                    "tipo": clasificar(antes, tablero, yo, signo * cp, signo * cp_desp, linea_desp),
                    "reloj": reloj,
                    "apuros": bool(reloj is not None and base and reloj < max(10, 0.1 * base)),
                    "fen": antes.fen(),
                })
        cp, linea = cp_desp, linea_desp

    return {
        "url": p["url"],
        "fecha": p["end_time"],
        "ritmo": p.get("time_class", "?"),
        "control": p.get("time_control", ""),
        "color": "blancas" if yo == chess.WHITE else "negras",
        "rival": rival["username"],
        "mi_elo": mio.get("rating"),
        "elo_rival": rival.get("rating"),
        "resultado": resultado,
        "motivo": motivo,
        "apertura": completo,
        "familia": familia,
        "mis_jugadas": mis_jugadas,
        "jugadas_por_fase": jugadas_por_fase,
        "max_ventaja": round(max_ventaja, 1),
        "errores": errores,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profundidad", type=int, default=10,
                    help="más alto = más preciso pero más lento (10 va bien para tu nivel)")
    args = ap.parse_args()

    entrada = AQUI / "partidas.json"
    if not entrada.exists():
        sys.exit("Primero ejecuta:  python descargar.py TU_USUARIO")
    datos = json.loads(entrada.read_text(encoding="utf-8"))
    usuario = datos["usuario"]

    # Cargamos lo ya analizado (si existe) para no repetir trabajo.
    salida = AQUI / "analisis.json"
    previo = json.loads(salida.read_text(encoding="utf-8")) if salida.exists() else {}
    hechos = previo.get("partidas", {}) if previo.get("usuario") == usuario else {}
    pendientes = [p for p in datos["partidas"] if p["url"] not in hechos]
    print(f"{len(hechos)} partidas ya analizadas, {len(pendientes)} pendientes.")

    def guardar():
        salida.write_text(json.dumps(
            {"usuario": usuario, "dias": datos.get("dias"), "profundidad": args.profundidad,
             "partidas": hechos}, ensure_ascii=False), encoding="utf-8")

    ruta = encontrar_stockfish()
    print(f"Usando Stockfish: {ruta}")
    motor = chess.engine.SimpleEngine.popen_uci(str(ruta))
    limite = chess.engine.Limit(depth=args.profundidad)
    inicio = time.time()
    try:
        for i, p in enumerate(pendientes, 1):
            r = analizar_partida(motor, p, usuario, limite)
            if r:
                hechos[p["url"]] = r
            guardar()
            seg = (time.time() - inicio) / i
            resta = seg * (len(pendientes) - i) / 60
            print(f"[{i}/{len(pendientes)}] {p['url']}  (~{resta:.0f} min restantes)")
    except KeyboardInterrupt:
        print("\nInterrumpido. El progreso está guardado; vuelve a ejecutarlo para continuar.")
    finally:
        motor.quit()
        guardar()
    print(f"\nListo: {len(hechos)} partidas en {salida.name}. Ahora:  python informe.py")


if __name__ == "__main__":
    main()
