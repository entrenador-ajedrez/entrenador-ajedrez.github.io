"""Datos del entrenamiento: aperturas de tu repertorio y finales básicos.

Para añadir una apertura o un final, basta con añadir un elemento a estas listas.
"""

# ------------------------------------------------------------------ aperturas
# secuencia: jugadas que definen la apertura (en notación SAN). Tú debes jugar las
#            tuyas; las del rival se juegan solas. Después, juego libre.
# familia:   nombre con el que aparece en tus partidas (para tus estadísticas).
APERTURAS = [
    {
        "id": "caro-kann",
        "nombre": "Caro-Kann",
        "color": "b",
        "secuencia": ["e4", "c6", "d4", "d5"],
        "familia": "Caro Kann Defense",
        "ideas": [
            "Con …c6 y …d5 atacas el peón de e4 sin bloquear tu alfil de casillas blancas.",
            "Saca ese alfil a f5 o g4 ANTES de jugar …e6 (si no, se queda encerrado).",
            "Pero ojo al orden: tras 3.Nc3 o 3.Nd2 juega primero …dxe4 y luego …Bf5. "
            "Si juegas 3…Bf5 directamente, 4.exd5 cxd5 5.Qf3 te gana un peón.",
            "Después: …e6, …Nd7, …Ngf6 y enroque corto. Es una apertura sólida: no tengas prisa.",
        ],
    },
    {
        "id": "ruy-lopez",
        "nombre": "Ruy López (Española)",
        "color": "w",
        "secuencia": ["e4", "e5", "Nf3", "Nc6", "Bb5"],
        "familia": "Ruy Lopez Opening",
        "ideas": [
            "El alfil en b5 ataca al caballo que defiende e5: presión sobre el centro.",
            "Enroca pronto (O-O), luego Re1, c3 y d4 para dominar el centro.",
            "Cuidado: Bxc6 seguido de Nxe5 casi nunca gana un peón al principio (…Qd4 lo recupera).",
        ],
    },
    {
        "id": "italiana",
        "nombre": "Italiana",
        "color": "w",
        "secuencia": ["e4", "e5", "Nf3", "Nc6", "Bc4"],
        "familia": "Italian Game",
        "ideas": [
            "El alfil en c4 apunta a f7, el punto débil de las negras.",
            "Plan sencillo: c3, d3 (o d4), O-O, Re1. Desarrolla antes de atacar.",
            "No juegues Ng5 sin pensar: si las negras se defienden bien, pierdes tiempo.",
        ],
    },
    {
        "id": "contra-siciliana",
        "nombre": "Contra la Siciliana",
        "color": "w",
        "secuencia": ["e4", "c5"],
        "familia": "Sicilian Defense",
        "ideas": [
            "Es donde más pierdes con blancas. Opción sencilla: 2.c3 (Alapin) y luego d4.",
            "Opción principal: 2.Nf3 y 3.d4 (Siciliana abierta): desarrollo rápido y espacio.",
            "Evita sacar la dama pronto (Qh5, Qf3): las negras la atacan ganando tiempos.",
        ],
    },
    {
        "id": "contra-d4",
        "nombre": "Contra 1.d4",
        "color": "b",
        "secuencia": ["d4", "d5"],
        "familia": "Queens Pawn Opening",
        "ideas": [
            "Responde con …d5 y …Nf6: ocupa el centro y desarrolla.",
            "Plan sencillo: …e6, …Be7 (o …Bd6), …O-O y …c5 para atacar el centro.",
            "Si las blancas juegan c4 (Gambito de Dama), puedes defender con …e6 sin miedo.",
        ],
    },
]
JUGADAS_APERTURA = 10  # cuántas jugadas (de cada bando) dura un entrenamiento

# ------------------------------------------------------------------ finales
# objetivo: "mate" (da mate), "coronar" (convierte el peón en dama) o "tablas".
# Todas las posiciones se han comprobado con Stockfish.
FINALES = [
    {
        "id": "mate-dama", "nombre": "Mate con dama", "nivel": "Imprescindible",
        "fen": "8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "color": "w", "objetivo": "mate", "referencia": 10,
        "ideas": [
            "Usa la dama para encerrar al rey en una caja cada vez más pequeña (a un salto de caballo).",
            "Cuando esté en el borde, acerca TU rey: la dama sola no puede dar mate.",
            "¡Cuidado con el ahogado! Comprueba siempre que el rey rival tenga alguna jugada.",
        ],
    },
    {
        "id": "mate-torre", "nombre": "Mate con torre", "nivel": "Imprescindible",
        "fen": "8/8/8/4k3/8/8/8/R3K3 w - - 0 1", "color": "w", "objetivo": "mate", "referencia": 20,
        "ideas": [
            "La torre corta al rey rival una fila o columna; tu rey se acerca.",
            "Pon tu rey enfrente del suyo (oposición) y da jaque con la torre: así lo empujas.",
            "Si el rey rival ataca tu torre, aléjala al otro lado del tablero.",
        ],
    },
    {
        "id": "escalera", "nombre": "Escalera con dos torres", "nivel": "Fácil",
        "fen": "8/8/8/3k4/8/8/8/R3K2R w - - 0 1", "color": "w", "objetivo": "mate", "referencia": 8,
        "ideas": [
            "Una torre corta una fila, la otra da jaque en la siguiente: el rey retrocede.",
            "Alternándolas como una escalera llegas al borde y das mate.",
            "Si el rey se acerca a una torre, llévala lejos por el mismo lado.",
        ],
    },
    {
        "id": "rey-delante", "nombre": "Rey delante del peón", "nivel": "Básico",
        "fen": "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1", "color": "w", "objetivo": "coronar", "referencia": 12,
        "ideas": [
            "Tu rey en la 6.ª fila delante de su peón gana SIEMPRE (si no es un peón de torre).",
            "Primero el rey abre camino; el peón avanza cuando la casilla de delante está controlada.",
            "No empujes el peón si deja al rival ahogado.",
        ],
    },
    {
        "id": "oposicion", "nombre": "La oposición", "nivel": "Importante",
        "fen": "8/8/4k3/8/4K3/4P3/8/8 b - - 0 1", "color": "w", "objetivo": "coronar", "referencia": 15,
        "ideas": [
            "Oposición: los reyes enfrentados con una casilla en medio; el que NO tiene que mover gana.",
            "Lleva tu rey por delante del peón; el peón va detrás.",
            "Si pierdes la oposición, un movimiento del peón puede devolverte el turno.",
        ],
    },
    {
        "id": "cuadrado", "nombre": "La regla del cuadrado", "nivel": "Básico",
        "fen": "8/8/8/8/8/k7/6P1/5K2 b - - 0 1", "color": "w", "objetivo": "coronar", "referencia": 6,
        "ideas": [
            "Imagina un cuadrado desde tu peón hasta la fila de coronación.",
            "Si el rey rival no puede entrar en ese cuadrado, el peón corona solo: ¡corre!",
            "No pierdas tiempo moviendo tu rey.",
        ],
    },
    {
        "id": "defensa", "nombre": "Defender rey contra rey y peón", "nivel": "Importante",
        "fen": "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "color": "b", "objetivo": "tablas", "referencia": None,
        "ideas": [
            "Ponte delante del peón y busca la oposición.",
            "Si el peón llega a la 7.ª con tu rey delante, la clave es no salir de la casilla de coronación.",
            "Las tablas llegan cuando capturas el peón o cuando el rival te ahoga.",
        ],
    },
]


def estadisticas_apertura(analisis, familia, color):
    """Cuántas partidas has jugado con esa apertura y ese color, y cuántas ganaste."""
    color_txt = "blancas" if color == "w" else "negras"
    js = [p for p in analisis.values() if p["familia"] == familia and p["color"] == color_txt]
    return {"partidas": len(js), "victorias": sum(p["resultado"] == "victoria" for p in js)}
