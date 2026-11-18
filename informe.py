"""Paso 3: genera informe.html a partir de analisis.json.

Uso:  python informe.py
"""
import datetime as dt
import html
import json
import sys
import webbrowser
from collections import Counter, defaultdict
from pathlib import Path

AQUI = Path(__file__).parent
RITMOS = {"bullet": "Bullet", "blitz": "Blitz", "rapid": "Rápidas", "daily": "Diarias"}
MOTIVOS = {
    "timeout": "Por tiempo", "checkmated": "Jaque mate", "resigned": "Abandono",
    "abandoned": "Desconexión / abandono de la partida", "timevsinsufficient": "Tiempo (sin material)",
}
TIPOS = {
    "material": "Pierdes material (pieza colgada, ataque doble…)",
    "mate_contra": "Permites un mate",
    "mate_perdido": "No ves un mate a tu favor",
    "tactica": "Otra jugada táctica/posicional mala",
}
FASES = ["apertura", "medio juego", "final"]
e = html.escape


def pct(a, b):
    return 100 * a / b if b else 0.0


def barra(valor, maximo=100, clase=""):
    ancho = max(0, min(100, pct(valor, maximo)))
    return f'<div class="barra {clase}"><span style="width:{ancho:.0f}%"></span></div>'


def fecha(ts):
    return dt.datetime.fromtimestamp(ts).strftime("%d/%m/%Y")


def describir_error(j, err):
    punto = "." if j["color"] == "blancas" else "..."
    mejor = f"; lo mejor era <b>{e(err['mejor'])}</b>" if err.get("mejor") else ""
    reloj = f" (te quedaban {err['reloj']:.0f} s)" if err.get("apuros") and err.get("reloj") is not None else ""
    return (f'<a href="{e(j["url"])}" target="_blank" rel="noopener">vs {e(j["rival"])}, '
            f'{fecha(j["fecha"])}</a> — jugaste <b>{err["jugada"]}{punto} {e(err["san"])}</b>'
            f'{mejor}{reloj}.')


# ---------------------------------------------------------------- los 3 errores
def candidatos(partidas):
    """Cada candidato es un tipo de error; se cuentan las partidas en las que aparece."""
    total = len(partidas)

    def con_error(pred):
        afectadas, ejemplos = [], []
        for j in partidas:
            errs = [x for x in j["errores"] if pred(x)]
            if errs:
                afectadas.append(j)
                ejemplos += [(j, x) for x in errs]
        ejemplos.sort(key=lambda t: -t[1]["perdida"])
        return afectadas, ejemplos[:3]

    lista = []

    afect, ej = con_error(lambda x: x["tipo"] == "material" and x["gravedad"] == "blunder")
    lista.append(dict(
        n=len(afect), ejemplos=ej,
        titulo="Dejas piezas sin defender (piezas colgadas y ataques dobles)",
        detalle=f"En {len(afect)} de {total} partidas ({pct(len(afect), total):.0f}%) perdiste "
                "al menos 3 puntos de material con una sola jugada.",
        consejo="Antes de soltar la pieza, haz el <b>chequeo de seguridad</b> (3 segundos): "
                "«después de mi jugada, ¿qué piezas mías están atacadas y cuántos defensores tienen?». "
                "Si hay más atacantes que defensores, o te ataca una pieza que vale menos, no la juegues. "
                "Practica 10 puzzles al día en chess.com con los temas <i>Hanging Piece</i> y <i>Fork</i>."))

    afect, ej = con_error(lambda x: x["tipo"] == "mate_contra")
    lista.append(dict(
        n=len(afect), ejemplos=ej,
        titulo="No ves las amenazas de mate del rival",
        detalle=f"En {len(afect)} partidas hiciste una jugada que permitía al rival darte mate.",
        consejo="Antes de tu jugada, mira primero <b>las jugadas forzantes del rival</b>: jaques, capturas "
                "y amenazas, en ese orden. Abre a tiempo una casilla de escape para tu rey "
                "(h3/h6 o g3/g6) para evitar el mate en la última fila. Puzzles de <i>Mate in 1</i> y "
                "<i>Mate in 2</i> te entrenan a verlo rápido."))

    afect, ej = con_error(lambda x: x["tipo"] in ("tactica", "mate_perdido") and x["gravedad"] == "blunder")
    lista.append(dict(
        n=len(afect), ejemplos=ej,
        titulo="Fallos tácticos (no calculas la respuesta del rival)",
        detalle=f"En {len(afect)} partidas hubo un blunder que no fue perder material de golpe, "
                "sino entrar en una posición mucho peor o desaprovechar un golpe ganador.",
        consejo="Usa siempre la misma rutina antes de mover: <b>1)</b> ¿qué amenaza la última jugada del "
                "rival? <b>2)</b> ¿tengo algún jaque, captura o amenaza fuerte? <b>3)</b> después de mi jugada, "
                "¿cuál es la mejor respuesta del rival? Mira los ejemplos: compara tu jugada con la "
                "que recomendaba Stockfish e intenta entender por qué era mejor."))

    tiempo_derrotas = [j for j in partidas if j["resultado"] == "derrota" and j["motivo"] == "timeout"]
    afect, ej = con_error(lambda x: x.get("apuros"))
    union = {j["url"] for j in tiempo_derrotas} | {j["url"] for j in afect}
    lista.append(dict(
        n=len(union), ejemplos=ej,
        titulo="Gestión del reloj",
        detalle=f"Perdiste {len(tiempo_derrotas)} partidas por tiempo y en {len(afect)} partidas cometiste "
                "errores con menos del 10% del tiempo en el reloj.",
        consejo="Juega con incremento (por ejemplo, 10+5 o 15+10): cada jugada te da segundos extra. "
                "Ponte un límite: no pases más de 1–2 minutos en una jugada salvo en momentos críticos, y "
                "juega rápido las jugadas de apertura que ya conoces."))

    tiradas = [j for j in partidas if j["max_ventaja"] >= 80 and j["resultado"] != "victoria"]
    ej = sorted(((j, x) for j in tiradas for x in j["errores"]), key=lambda t: -t[1]["perdida"])[:3]
    lista.append(dict(
        n=len(tiradas), ejemplos=ej,
        titulo="Pierdes partidas que ibas ganando",
        detalle=f"En {len(tiradas)} partidas llegaste a tener más de un 80% de probabilidad de ganar y "
                "no ganaste.",
        consejo="Cuando vas ganando, <b>simplifica</b>: cambia piezas (no peones), defiende las amenazas "
                "antes de seguir atacando y busca el mate más seguro, no el más bonito. En cada jugada, "
                "pregúntate «¿qué quiere hacer el rival?»."))

    afect, ej = con_error(lambda x: x["fase"] == "apertura")
    lista.append(dict(
        n=len(afect), ejemplos=ej,
        titulo="Errores en la apertura",
        detalle=f"En {len(afect)} partidas cometiste un error o blunder antes de la jugada 12.",
        consejo="No hace falta memorizar mucho. Elige <b>una</b> apertura con blancas y una defensa "
                "contra 1.e4 y otra contra 1.d4, y aprende sus 5–6 primeras jugadas. Sigue los principios: "
                "saca caballos y alfiles, enroca pronto, no saques la dama al principio ni muevas la misma "
                "pieza dos veces."))

    afect, ej = con_error(lambda x: x["fase"] == "final" and x["gravedad"] == "blunder")
    lista.append(dict(
        n=len(afect), ejemplos=ej,
        titulo="Errores en el final",
        detalle=f"En {len(afect)} partidas cometiste un blunder con pocas piezas sobre el tablero.",
        consejo="Aprende los finales básicos: rey y peón contra rey (la oposición), el mate con torre y "
                "el mate con dama. Además, en cuanto se cambien las damas, <b>activa tu rey</b> y llévalo "
                "al centro. Las lecciones de finales de chess.com cubren todo esto."))

    return sorted([c for c in lista if c["n"] > 0], key=lambda c: -c["n"])[:3]


# ---------------------------------------------------------------- HTML
def generar(datos):
    partidas = sorted(datos["partidas"].values(), key=lambda j: j["fecha"])
    if not partidas:
        sys.exit("No hay partidas analizadas.")
    usuario = datos["usuario"]
    total = len(partidas)
    res = Counter(j["resultado"] for j in partidas)
    blunders = [x for j in partidas for x in j["errores"] if x["gravedad"] == "blunder"]

    # Elo actual por ritmo (el de la última partida jugada)
    elo = {}
    for j in partidas:
        elo[j["ritmo"]] = j["mi_elo"]
    elo_html = " · ".join(f"{RITMOS.get(r, r)}: <b>{v}</b>" for r, v in elo.items() if v)

    # Top 3
    top = candidatos(partidas)
    tarjetas = ""
    for i, c in enumerate(top, 1):
        ejemplos = "".join(f"<li>{describir_error(j, x)}</li>" for j, x in c["ejemplos"])
        tarjetas += f"""
        <article class="tarjeta">
          <div class="num">{i}</div>
          <div>
            <h3>{c['titulo']}</h3>
            <p class="dato">{c['detalle']}</p>
            <p class="consejo"><b>Consejo:</b> {c['consejo']}</p>
            {'<details><summary>Ejemplos de tus partidas</summary><ul>' + ejemplos + '</ul></details>' if ejemplos else ''}
          </div>
        </article>"""

    # Fases
    jug_fase = Counter()
    for j in partidas:
        jug_fase.update(j["jugadas_por_fase"])
    bl_fase = Counter(x["fase"] for x in blunders)
    tasas = {f: pct(bl_fase[f], jug_fase[f]) for f in FASES}
    max_tasa = max(tasas.values()) or 1
    filas_fase = "".join(
        f"<tr><td>{f.capitalize()}</td><td>{bl_fase[f]}</td><td>{jug_fase[f]}</td>"
        f"<td>{tasas[f]:.1f}</td><td>{barra(tasas[f], max_tasa, 'mal')}</td></tr>" for f in FASES)
    peor_fase = max(FASES, key=lambda f: tasas[f])

    # Ritmos
    por_ritmo = defaultdict(list)
    for j in partidas:
        por_ritmo[j["ritmo"]].append(j)
    filas_ritmo = ""
    for r, js in sorted(por_ritmo.items(), key=lambda t: -len(t[1])):
        n = len(js)
        v = sum(j["resultado"] == "victoria" for j in js)
        b = sum(x["gravedad"] == "blunder" for j in js for x in j["errores"])
        t = sum(j["resultado"] == "derrota" and j["motivo"] == "timeout" for j in js)
        filas_ritmo += (f"<tr><td>{RITMOS.get(r, r)}</td><td>{n}</td><td>{pct(v, n):.0f}%</td>"
                        f"<td>{b / n:.1f}</td><td>{pct(t, n):.0f}%</td></tr>")

    # Cómo pierdes
    derrotas = [j for j in partidas if j["resultado"] == "derrota"]
    motivos = Counter(j["motivo"] for j in derrotas)
    filas_motivo = "".join(
        f"<tr><td>{MOTIVOS.get(m, m)}</td><td>{n}</td><td>{barra(n, len(derrotas), 'mal')}</td></tr>"
        for m, n in motivos.most_common())

    # Tipos de blunder
    tipos = Counter(x["tipo"] for x in blunders)
    filas_tipo = "".join(
        f"<tr><td>{TIPOS.get(t, t)}</td><td>{n}</td><td>{barra(n, len(blunders), 'mal')}</td></tr>"
        for t, n in tipos.most_common())
    apuros = sum(1 for x in blunders if x.get("apuros"))

    # Aperturas
    def tabla_aperturas(color):
        grupos = defaultdict(Counter)
        for j in partidas:
            if j["color"] == color:
                grupos[j["familia"]][j["resultado"]] += 1
        filas, resumen = "", []
        for fam, c in sorted(grupos.items(), key=lambda t: -sum(t[1].values()))[:10]:
            n = sum(c.values())
            pv = pct(c["victoria"], n)
            filas += (f"<tr><td>{e(fam)}</td><td>{n}</td><td>{c['victoria']}</td><td>{c['tablas']}</td>"
                      f"<td>{c['derrota']}</td><td>{pv:.0f}%</td><td>{barra(pv, 100, 'bien')}</td></tr>")
            if n >= 3:
                resumen.append((pv, n, fam))
        nota = ""
        if len(resumen) >= 2:
            mejor, peor = max(resumen), min(resumen)
            nota = (f'<p class="nota">Tu mejor apertura: <b>{e(mejor[2])}</b> ({mejor[0]:.0f}% de victorias '
                    f'en {mejor[1]} partidas). La peor: <b>{e(peor[2])}</b> ({peor[0]:.0f}% en {peor[1]}).</p>')
        return nota + (f"<table><thead><tr><th>Apertura</th><th>Partidas</th><th>G</th><th>T</th><th>P</th>"
                       f"<th>% victorias</th><th></th></tr></thead><tbody>{filas}</tbody></table>")

    desde, hasta = fecha(partidas[0]["fecha"]), fecha(partidas[-1]["fecha"])
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mis partidas de ajedrez</title>
<style>
:root {{ --fondo:#f6f5f2; --panel:#fff; --texto:#1d1d1f; --suave:#6b6b70; --borde:#e3e1dc;
        --acento:#2f6f4f; --mal:#c2463b; --bien:#2f8f5b; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --fondo:#161617; --panel:#202022; --texto:#ececee; --suave:#9a9aa0; --borde:#333336;
          --acento:#7cc59b; --mal:#e57368; --bien:#5cc28a; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--fondo); color:var(--texto);
       font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }}
main {{ max-width:900px; margin:0 auto; padding:32px 16px 64px; }}
h1 {{ font-size:1.9rem; margin:0 0 4px; }} h2 {{ margin:40px 0 12px; font-size:1.3rem; }}
h3 {{ margin:0 0 6px; font-size:1.1rem; }}
.sub {{ color:var(--suave); margin:0; }}
.kpis {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }}
.kpi, .tarjeta, table {{ background:var(--panel); border:1px solid var(--borde); border-radius:12px; }}
.kpi {{ padding:14px 16px; }} .kpi b {{ display:block; font-size:1.6rem; }}
.kpi span {{ color:var(--suave); font-size:.9rem; }}
.tarjeta {{ display:flex; gap:16px; padding:18px; margin-bottom:12px; }}
.num {{ flex:none; width:36px; height:36px; border-radius:50%; background:var(--acento); color:var(--panel);
        display:grid; place-items:center; font-weight:700; }}
.dato {{ color:var(--suave); margin:0 0 8px; }} .consejo {{ margin:0 0 8px; }}
details summary {{ cursor:pointer; color:var(--acento); }}
details li {{ margin:4px 0; font-size:.95rem; }}
a {{ color:var(--acento); }}
.tabla {{ overflow-x:auto; }}
table {{ width:100%; border-collapse:separate; border-spacing:0; overflow:hidden; font-size:.95rem; }}
th, td {{ text-align:left; padding:8px 12px; border-bottom:1px solid var(--borde); }}
th {{ color:var(--suave); font-weight:600; }} tr:last-child td {{ border-bottom:0; }}
.barra {{ width:120px; height:8px; background:var(--borde); border-radius:4px; overflow:hidden; }}
.barra span {{ display:block; height:100%; background:var(--acento); }}
.barra.mal span {{ background:var(--mal); }} .barra.bien span {{ background:var(--bien); }}
.nota {{ color:var(--suave); }}
footer {{ margin-top:48px; color:var(--suave); font-size:.85rem; }}
</style></head><body><main>
<h1>Análisis de mis partidas</h1>
<p class="sub">{e(usuario)} · {desde} – {hasta} · {elo_html}</p>

<div class="kpis">
  <div class="kpi"><b>{total}</b><span>partidas analizadas</span></div>
  <div class="kpi"><b>{pct(res['victoria'], total):.0f}%</b><span>{res['victoria']} G · {res['tablas']} T · {res['derrota']} P</span></div>
  <div class="kpi"><b>{len(blunders) / total:.1f}</b><span>blunders por partida</span></div>
  <div class="kpi"><b>{peor_fase.capitalize()}</b><span>fase con más blunders por jugada</span></div>
</div>

<h2>Tus 3 errores más repetidos</h2>
{tarjetas or '<p>No se detectaron errores repetidos. ¡Bien jugado!</p>'}

<h2>¿En qué fase fallas?</h2>
<div class="tabla"><table><thead><tr><th>Fase</th><th>Blunders</th><th>Tus jugadas</th>
<th>Blunders cada 100 jugadas</th><th></th></tr></thead><tbody>{filas_fase}</tbody></table></div>

<h2>¿Fallas más en partidas rápidas?</h2>
<div class="tabla"><table><thead><tr><th>Ritmo</th><th>Partidas</th><th>% victorias</th>
<th>Blunders por partida</th><th>Derrotas por tiempo</th></tr></thead><tbody>{filas_ritmo}</tbody></table></div>

<h2>¿Cómo pierdes?</h2>
<div class="tabla"><table><thead><tr><th>Motivo</th><th>Derrotas</th><th></th></tr></thead>
<tbody>{filas_motivo}</tbody></table></div>

<h2>¿Qué tipo de blunders cometes?</h2>
<p class="nota">{apuros} de tus {len(blunders)} blunders ({pct(apuros, len(blunders)):.0f}%) fueron con menos del 10% del tiempo en el reloj.</p>
<div class="tabla"><table><thead><tr><th>Tipo</th><th>Blunders</th><th></th></tr></thead>
<tbody>{filas_tipo}</tbody></table></div>

<h2>Aperturas con blancas</h2>
<div class="tabla">{tabla_aperturas('blancas')}</div>
<h2>Aperturas con negras</h2>
<div class="tabla">{tabla_aperturas('negras')}</div>

<footer>Analizado con Stockfish a profundidad {datos.get('profundidad', '?')}. Una jugada es <i>blunder</i>
si te quita 15 puntos o más de probabilidad de ganar, y <i>error</i> si te quita 10 o más (mismo criterio
que lichess). Apertura = hasta la jugada 12; final = cuando quedan pocas piezas (sin contar peones).</footer>
</main></body></html>"""


def main():
    entrada = AQUI / "analisis.json"
    if not entrada.exists():
        sys.exit("Primero ejecuta:  python analizar.py")
    datos = json.loads(entrada.read_text(encoding="utf-8"))
    salida = AQUI / "informe.html"
    salida.write_text(generar(datos), encoding="utf-8")
    print(f"Informe creado: {salida}")
    webbrowser.open(salida.resolve().as_uri())


if __name__ == "__main__":
    main()
