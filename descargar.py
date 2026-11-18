"""Paso 1: descarga tus partidas de chess.com y las guarda en partidas.json.

Uso:  python descargar.py TU_USUARIO [DIAS]
      (DIAS es opcional; por defecto 90, es decir, unos 3 meses)
"""
import datetime as dt
import json
import sys
import time
from collections import Counter
from pathlib import Path

import requests

AQUI = Path(__file__).parent
# chess.com pide que los programas se identifiquen con un "User-Agent".
# Ojo: si contiene "python-requests", su filtro antibots devuelve un error 403.
CABECERAS = {"User-Agent": "analizador-partidas-personal/1.0"}


def pedir(url):
    """Hace una petición GET y reintenta si chess.com nos pide ir más despacio (error 429)."""
    for _ in range(3):
        r = requests.get(url, headers=CABECERAS, timeout=30)
        if r.status_code != 429:
            return r
        time.sleep(5)
    return r


def main():
    if len(sys.argv) < 2:
        print("Uso: python descargar.py TU_USUARIO [DIAS]")
        sys.exit(1)
    usuario = sys.argv[1].strip().lower()
    dias = int(sys.argv[2]) if len(sys.argv) > 2 else 90

    # 1) La API tiene una lista de "archivos": una URL por cada mes en el que jugaste.
    r = pedir(f"https://api.chess.com/pub/player/{usuario}/games/archives")
    if r.status_code == 404:
        print(f"chess.com dice que el usuario '{usuario}' no existe. Revisa cómo se escribe.")
        sys.exit(1)
    r.raise_for_status()
    archivos = r.json().get("archives", [])

    desde = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=dias)
    primer_mes = (desde.year, desde.month)

    # 2) Descargamos solo los meses que caen dentro del periodo.
    partidas = []
    for url in archivos:
        anio, mes = map(int, url.rstrip("/").split("/")[-2:])
        if (anio, mes) < primer_mes:
            continue
        print(f"Descargando {anio}-{mes:02d}...")
        resp = pedir(url)
        resp.raise_for_status()
        for p in resp.json().get("games", []):
            # Solo ajedrez normal (no Chess960, etc.) y dentro del periodo.
            if p.get("rules") != "chess" or "pgn" not in p:
                continue
            if p.get("end_time", 0) < desde.timestamp():
                continue
            partidas.append(p)

    # 3) Lo guardamos en un archivo para no tener que volver a descargarlo.
    salida = AQUI / "partidas.json"
    salida.write_text(
        json.dumps(
            {"usuario": usuario, "dias": dias,
             "descargado": dt.datetime.now().isoformat(timespec="seconds"),
             "partidas": partidas},
            ensure_ascii=False),
        encoding="utf-8")

    ritmos = Counter(p.get("time_class", "?") for p in partidas)
    print(f"\n{len(partidas)} partidas guardadas en {salida.name}")
    for ritmo, n in ritmos.most_common():
        print(f"  {ritmo}: {n}")


if __name__ == "__main__":
    main()
