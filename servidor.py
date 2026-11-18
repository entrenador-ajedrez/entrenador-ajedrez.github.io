"""Entrenador de ajedrez: un pequeño servidor web que funciona en tu ordenador.

Uso:  python servidor.py            (abre el navegador automáticamente)
      python servidor.py --sin-navegador

El navegador muestra el tablero; este programa lee tus errores de
analisis.json y le pregunta a Stockfish si tus jugadas son buenas.
"""
import atexit
import datetime as dt
import hashlib
import io
import json
import random
import sys
import threading
import webbrowser
from pathlib import Path

import chess
import chess.engine
import chess.pgn
from flask import Flask, abort, jsonify, request, send_from_directory

# Reutilizamos funciones que ya escribimos para el análisis.
from analizar import MATE, UMBRAL_BLUNDER, UMBRAL_ERROR, encontrar_stockfish, evaluar, prob_ganar
from entrenamiento import APERTURAS, FINALES, JUGADAS_APERTURA, estadisticas_apertura

AQUI = Path(__file__).parent
PUERTO = 8765
PROFUNDIDAD = 14        # algo más que en el análisis: aquí es una sola posición
PROFUNDIDAD_REVISION = 10   # para revisar partidas enteras (igual que analizar.py)
UMBRAL_ACIERTO = 5      # si tu jugada pierde menos de 5 puntos de prob. de ganar, vale
UMBRAL_IMPRECISION = 5
RUTA_PROGRESO = AQUI / "progreso.json"
RUTA_REVISIONES = AQUI / "revisiones.json"  # partidas ya revisadas (para no repetir)

app = Flask(__name__, static_folder=str(AQUI / "static"))
motor = None
cerrojo = threading.Lock()  # Stockfish solo puede pensar en una cosa a la vez
# Un segundo Stockfish solo para jugar contra ti: así podemos debilitarlo
# sin que afecte al que corrige tus jugadas.
motor_juego = None
cerrojo_juego = threading.Lock()

# Niveles del rival. Los ELO son aproximados (Stockfish no imita a un humano exacto).
#   skill: "Skill Level" de Stockfish (0-20), elige a propósito jugadas peores.
#   elo:   "UCI_Elo", limita su fuerza a un ELO (solo funciona por encima de ~1300).
NIVELES = {
    1: {"nombre": "Muy fácil (~600)", "skill": 0, "profundidad": 1, "tiempo": 0.05},
    2: {"nombre": "Fácil (~850)", "skill": 2, "profundidad": 3, "tiempo": 0.1},
    3: {"nombre": "Tu nivel (~1050)", "skill": 4, "profundidad": 5, "tiempo": 0.2},
    4: {"nombre": "Un poco más fuerte (~1350)", "elo": 1350, "tiempo": 0.4},
    5: {"nombre": "Jugador de club (~1600)", "elo": 1600, "tiempo": 0.5},
    6: {"nombre": "Fuerte (~2000)", "elo": 2000, "tiempo": 0.5},
    7: {"nombre": "Máximo (Stockfish a tope)", "skill": 20, "tiempo": 1.0},
    # Nivel interno para los finales: fuerza máxima pero rápido (no sale en la lista).
    0: {"nombre": "Finales", "skill": 20, "tiempo": 0.2, "oculto": True},
}


# ------------------------------------------------------------------ datos
def leer_json(ruta, por_defecto=None):
    if ruta.exists():
        return json.loads(ruta.read_text(encoding="utf-8"))
    return {} if por_defecto is None else por_defecto


def id_partida(url):
    """Un identificador corto para cada partida, sacado de su URL."""
    return hashlib.md5(url.encode()).hexdigest()[:10]


def cargar_ejercicios():
    """Convierte cada error de analisis.json en un ejercicio."""
    datos = leer_json(AQUI / "analisis.json")
    ejercicios = []
    for p in datos["partidas"].values():
        for e in p["errores"]:
            clave = f'{p["url"]}|{e["jugada"]}|{e["san"]}|{e["fen"]}'
            tablero = chess.Board(e["fen"])
            ejercicios.append({
                "id": hashlib.md5(clave.encode()).hexdigest()[:12],
                "fen": e["fen"],
                "color": p["color"],
                "jugada": e["jugada"],
                "tu_jugada": e["san"],
                "tu_jugada_uci": tablero.parse_san(e["san"]).uci(),
                "fase": e["fase"],
                "tipo": e["tipo"],
                "gravedad": e["gravedad"],
                "perdida": e["perdida"],
                "url": p["url"],
                "partida_id": id_partida(p["url"]),
                "rival": p["rival"],
                "fecha": dt.datetime.fromtimestamp(p["fecha"]).strftime("%d/%m/%Y"),
            })
    return ejercicios


def leer_progreso():
    return leer_json(RUTA_PROGRESO)


# ------------------------------------------------------------------ Stockfish
def puntuacion(tablero, color):
    """Evaluación (en centipeones) desde el punto de vista de 'color', y la mejor línea."""
    if tablero.is_checkmate():
        return (-MATE if tablero.turn == color else MATE), []
    if tablero.is_game_over():
        return 0, []
    info = motor.analyse(tablero, chess.engine.Limit(depth=PROFUNDIDAD))
    return info["score"].pov(color).score(mate_score=MATE), info.get("pv", [])


def texto_eval(cp):
    if abs(cp) >= MATE - 100:
        return "mate a tu favor" if cp > 0 else "mate en contra"
    return f"{cp / 100:+.1f}"


def texto_eval_blancas(cp):
    """Evaluación para la barra: '+1.3' (ventaja blanca), '-0.8', '#3' / '#-3' (mate)."""
    if abs(cp) >= MATE - 100:
        return f"#{'' if cp > 0 else '-'}{MATE - abs(cp)}" if abs(cp) < MATE else "#"
    return f"{cp / 100:+.1f}"


def revisar_partida(pgn):
    """Evalúa TODAS las jugadas de una partida (las tuyas y las del rival)."""
    juego = chess.pgn.read_game(io.StringIO(pgn))
    tablero = juego.board()
    limite = chess.engine.Limit(depth=PROFUNDIDAD_REVISION)
    resultado = {"fen_inicial": tablero.fen(), "jugadas": []}
    with cerrojo:
        cp, pv = evaluar(motor, tablero, limite)
        resultado["eval_inicial"] = cp
        for nodo in juego.mainline():
            mueve = tablero.turn
            mejor = pv[0] if pv else None
            mejor_san = tablero.san(mejor) if mejor else None
            san = tablero.san(nodo.move)
            tablero.push(nodo.move)
            cp_desp, pv_desp = evaluar(motor, tablero, limite)
            signo = 1 if mueve == chess.WHITE else -1
            perdida = max(0.0, prob_ganar(signo * cp) - prob_ganar(signo * cp_desp))
            clase = ("blunder" if perdida >= UMBRAL_BLUNDER else "error" if perdida >= UMBRAL_ERROR
                     else "imprecision" if perdida >= UMBRAL_IMPRECISION else None)
            resultado["jugadas"].append({
                "san": san,
                "uci": nodo.move.uci(),
                "fen": tablero.fen(),
                "eval": cp_desp,  # siempre desde el punto de vista de las blancas
                "eval_texto": texto_eval_blancas(cp_desp),
                "perdida": round(perdida, 1),
                "clase": clase,
                "mejor_san": mejor_san if clase and mejor != nodo.move else None,
                "mejor_uci": mejor.uci() if clase and mejor and mejor != nodo.move else None,
                "reloj": nodo.clock(),
            })
            cp, pv = cp_desp, pv_desp
    return resultado


def describir_linea(tablero, pv):
    """Pasa la línea de Stockfish a notación normal (SAN) y a 'e2e4' para el tablero."""
    b, san, uci = tablero.copy(), [], []
    for mv in pv[:8]:
        san.append(b.san(mv))
        uci.append(mv.uci())
        b.push(mv)
    return san, uci


# ------------------------------------------------------------------ rutas web
@app.get("/")
def inicio():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/partidas")
def pagina_partidas():
    return send_from_directory(app.static_folder, "partidas.html")


def resumen_partida(p):
    return {
        "id": id_partida(p["url"]),
        "url": p["url"],
        "ts": p["fecha"],
        "fecha": dt.datetime.fromtimestamp(p["fecha"]).strftime("%d/%m/%Y"),
        "rival": p["rival"], "elo_rival": p.get("elo_rival"), "mi_elo": p.get("mi_elo"),
        "color": p["color"], "resultado": p["resultado"], "motivo": p["motivo"],
        # (los nombres no llevan puntos: si hay uno, lo que sigue son jugadas)
        "apertura": p["apertura"].split(".")[0].strip(), "ritmo": p["ritmo"],
        "blunders": sum(e["gravedad"] == "blunder" for e in p["errores"]),
    }


@app.get("/api/partidas")
def api_partidas():
    partidas = [resumen_partida(p) for p in leer_json(AQUI / "analisis.json")["partidas"].values()]
    partidas.sort(key=lambda p: -p["ts"])
    return jsonify(partidas=partidas)


@app.get("/api/partida/<pid>")
def api_partida(pid):
    """Revisión completa de una partida. La primera vez la calcula (unos segundos) y la guarda."""
    analisis = leer_json(AQUI / "analisis.json")["partidas"]
    info = next((p for p in analisis.values() if id_partida(p["url"]) == pid), None)
    if info is None:
        abort(404)
    revisiones = leer_json(RUTA_REVISIONES)
    if pid not in revisiones:
        partidas = leer_json(AQUI / "partidas.json")["partidas"]
        pgn = next((p["pgn"] for p in partidas if p["url"] == info["url"]), None)
        if pgn is None:
            abort(404)
        revisiones[pid] = revisar_partida(pgn)
        RUTA_REVISIONES.write_text(json.dumps(revisiones), encoding="utf-8")
    return jsonify(partida=resumen_partida(info), **revisiones[pid])


@app.get("/api/ejercicios")
def api_ejercicios():
    progreso = leer_progreso()
    ejercicios = cargar_ejercicios()
    for e in ejercicios:
        e["progreso"] = progreso.get(e["id"])
    return jsonify(ejercicios=ejercicios)


@app.post("/api/comprobar")
def api_comprobar():
    """Recibe una posición y la jugada que has hecho; dice si es buena."""
    datos = request.get_json()
    tablero = chess.Board(datos["fen"])
    jugada = chess.Move.from_uci(datos["uci"])
    if jugada not in tablero.legal_moves:
        return jsonify(error="Jugada ilegal"), 400
    yo = tablero.turn
    with cerrojo:
        mejor_cp, pv = puntuacion(tablero, yo)
        tras = tablero.copy()
        tras.push(jugada)
        tu_cp, _ = puntuacion(tras, yo)
    perdida = max(0.0, prob_ganar(mejor_cp) - prob_ganar(tu_cp))
    es_la_mejor = bool(pv) and jugada == pv[0]
    san, uci = describir_linea(tablero, pv)
    return jsonify(
        correcta=es_la_mejor or perdida < UMBRAL_ACIERTO,
        es_la_mejor=es_la_mejor,
        perdida=round(perdida, 1),
        tu_eval=texto_eval(tu_cp),
        mejor_eval=texto_eval(mejor_cp),
        linea_san=san,
        linea_uci=uci,
    )


@app.post("/api/solucion")
def api_solucion():
    """Devuelve la mejor línea sin necesidad de haber jugado."""
    tablero = chess.Board(request.get_json()["fen"])
    with cerrojo:
        cp, pv = puntuacion(tablero, tablero.turn)
    san, uci = describir_linea(tablero, pv)
    return jsonify(mejor_eval=texto_eval(cp), linea_san=san, linea_uci=uci)


@app.get("/jugar")
def pagina_jugar():
    return send_from_directory(app.static_folder, "jugar.html")


@app.get("/api/niveles")
def api_niveles():
    return jsonify(niveles=[{"id": k, "nombre": v["nombre"]} for k, v in NIVELES.items()
                            if not v.get("oculto")])


@app.post("/api/motor")
def api_motor():
    """Stockfish elige su jugada con el nivel que hayas escogido."""
    datos = request.get_json()
    tablero = chess.Board(datos["fen"])
    if tablero.is_game_over():
        return jsonify(error="La partida ha terminado"), 400
    nivel = NIVELES.get(int(datos.get("nivel", 3)), NIVELES[3])
    opciones = {"Skill Level": nivel.get("skill", 20), "UCI_LimitStrength": "elo" in nivel}
    if "elo" in nivel:
        rango = motor_juego.options["UCI_Elo"]
        opciones["UCI_Elo"] = max(rango.min, min(rango.max, nivel["elo"]))
    limite = chess.engine.Limit(time=nivel["tiempo"], depth=nivel.get("profundidad"))
    with cerrojo_juego:
        motor_juego.configure(opciones)
        jugada = motor_juego.play(tablero, limite).move
    return jsonify(uci=jugada.uci(), san=tablero.san(jugada))


@app.post("/api/evaluar")
def api_evaluar():
    """Evaluación de una posición (para la barra), desde el punto de vista de las blancas."""
    tablero = chess.Board(request.get_json()["fen"])
    with cerrojo:
        cp, _ = evaluar(motor, tablero, chess.engine.Limit(depth=12))
    return jsonify(eval=cp, texto=texto_eval_blancas(cp))


@app.get("/entrenar")
def pagina_entrenar():
    return send_from_directory(app.static_folder, "entrenar.html")


@app.get("/api/entrenamiento")
def api_entrenamiento():
    """Aperturas (con tus estadísticas) y finales, con lo que ya has superado."""
    analisis = leer_json(AQUI / "analisis.json")["partidas"]
    progreso = leer_progreso()
    aperturas = []
    for a in APERTURAS:
        aperturas.append({**a, "tus_partidas": estadisticas_apertura(analisis, a["familia"], a["color"]),
                          "progreso": progreso.get("apertura-" + a["id"])})
    finales = [{**f, "progreso": progreso.get("final-" + f["id"])} for f in FINALES]
    return jsonify(aperturas=aperturas, finales=finales, jugadas_apertura=JUGADAS_APERTURA)


@app.post("/api/rival_apertura")
def api_rival_apertura():
    """El rival en las aperturas: elige al azar entre las mejores jugadas (casi igual de buenas),
    para que cada entrenamiento sea distinto, como pasa con rivales reales."""
    tablero = chess.Board(request.get_json()["fen"])
    with cerrojo:
        infos = motor.analyse(tablero, chess.engine.Limit(depth=12), multipv=3)
    puntos = [(i["pv"][0], i["score"].relative.score(mate_score=MATE)) for i in infos if i.get("pv")]
    mejor = puntos[0][1]
    candidatas = [mv for mv, cp in puntos if mejor - cp <= 30]  # como mucho 0.3 peones peor
    jugada = random.choice(candidatas)
    return jsonify(uci=jugada.uci(), san=tablero.san(jugada))


@app.post("/api/progreso")
def api_progreso():
    """Guarda si has resuelto un ejercicio, para repetir los que fallas."""
    datos = request.get_json()
    progreso = leer_progreso()
    p = progreso.setdefault(datos["id"], {"intentos": 0, "aciertos": 0})
    p["intentos"] += 1
    p["aciertos"] += 1 if datos["acierto"] else 0
    p["ultimo"] = "acierto" if datos["acierto"] else "fallo"
    p["fecha"] = dt.datetime.now().isoformat(timespec="seconds")
    RUTA_PROGRESO.write_text(json.dumps(progreso, indent=1), encoding="utf-8")
    return jsonify(ok=True, progreso=p)


# ------------------------------------------------------------------ arranque
def main():
    global motor, motor_juego
    if not (AQUI / "analisis.json").exists():
        sys.exit("No hay analisis.json. Ejecuta antes analizar.bat.")
    ruta = str(encontrar_stockfish())
    motor = chess.engine.SimpleEngine.popen_uci(ruta)
    motor_juego = chess.engine.SimpleEngine.popen_uci(ruta)
    atexit.register(motor.quit)
    atexit.register(motor_juego.quit)
    url = f"http://127.0.0.1:{PUERTO}"
    print(f"Entrenador listo en {url}  (cierra esta ventana para apagarlo)")
    if "--sin-navegador" not in sys.argv:
        threading.Timer(1.0, webbrowser.open, args=[url]).start()
    app.run(host="127.0.0.1", port=PUERTO, threaded=True)


if __name__ == "__main__":
    main()
