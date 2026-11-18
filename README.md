# ♞ Entrenador de ajedrez

Analiza tus partidas de **chess.com** con **Stockfish** y entrena con tus propios errores.
Funciona entero en el navegador: no hace falta instalar nada ni dar ninguna contraseña.

## Qué hace

- **Mis partidas** — descarga tus partidas de los últimos 3 meses (y las nuevas cada vez que entras;
  guarda hasta 6 meses) y las revisa jugada a jugada: precisión, clasificación de cada jugada
  (mejor, imprecisión, error, blunder…), gráfica de la partida, mejor jugada y "reintentar".
- **Ejercicios** — las posiciones en las que te equivocaste, para encontrar la mejor jugada.
- **Jugar** — contra Stockfish en 7 niveles, con un modo entrenador que te avisa de los blunders.
- **Entrenar** — aperturas habituales y finales básicos.
- **Informe** — tus estadísticas y tus 3 errores más repetidos, con un consejo para cada uno.

## Privacidad

Solo se pide el **nombre de usuario** de chess.com (las partidas son públicas). Todo se guarda en
**tu navegador** (IndexedDB) y el análisis lo hace Stockfish en tu propio dispositivo: no hay
ningún servidor que reciba tus datos.

## Cómo está hecho

- `web/` — la web (HTML, CSS y JavaScript sin compilar).
  - `js/chesscom.js` descarga de la API pública de chess.com · `js/motor.js` Stockfish (WebAssembly)
  - `js/analizador.js` clasificación, precisión y comentarios · `js/tablero.js` tablero interactivo
  - `js/vistas/` cada pantalla
- Los scripts de Python de la raíz (`descargar.py`, `analizar.py`, `informe.py`, `servidor.py`)
  son la primera versión del proyecto, para usar en local.

Para probar la web en tu ordenador: `python -m http.server 8080 --directory web` y abrir
http://127.0.0.1:8080 (o doble clic en `abrir_web.bat` en Windows).

## Licencias y créditos

Este proyecto es software libre bajo la licencia **GPLv3** (ver `LICENSE`), porque incluye Stockfish.

- [Stockfish](https://stockfishchess.org/) vía [stockfish.js](https://github.com/nmrugg/stockfish.js) — GPLv3
- [cm-chessboard](https://github.com/shaack/cm-chessboard) — MIT
- [chess.js](https://github.com/jhlywa/chess.js) — BSD-2
- Piezas de Cburnett (Wikimedia Commons) — CC BY-SA 3.0
- Precisión calculada con el método público de [lichess](https://lichess.org/)

No está afiliado a chess.com.
