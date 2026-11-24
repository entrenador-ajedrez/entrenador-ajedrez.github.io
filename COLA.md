# Cola de peticiones — Entrenador de ajedrez

Todo lo que pide Elías se apunta aquí (fecha y estado) antes de hacerse.

## 24-11-2026
1. ✅ Que la web funcione bien en el móvil: pestañas abajo, cabecera fina, partidas en tarjetas,
   controles ◀ ▶ siempre visibles bajo el tablero, lista de jugadas deslizable, informe sin desbordes,
   campos de 16 px (sin zoom en iPhone), tablero limitado en tabletas.
2. ✅ Iconos de clasificación con diseño propio (insignias cuadradas, ◆ + ○ L ↯, otros colores),
   para no parecerse a los glifos protegidos de chess.com.
3. ✅ Icono para la pantalla de inicio del iPhone/Android (icono-180/192/512.png + manifest).
4. ✅ Al conectar un usuario estando ya en «Mis partidas» la lista no se pintaba: arreglado.

5. ⏳ Notación para principiantes: mezcla en la que manden las indicaciones sobre el tablero (flechas, casillas,
   «♞ Caballo a f3»), con la notación como apoyo. Fase 1 (24-11): simulación con 5 jugadores de distinto nivel
   en móvil y PC → ✅ hecha, informe en revision/simulacion-1.md (media 6,9). Fase 2 (esperando su sí): construir «modo claro». Fase 3: repetir simulación y publicar.

## Pendiente / ideas
- Probarlo en el iPhone real (Safari → Compartir → «Añadir a pantalla de inicio»). Ver PARA_TI.md si aparece algo.
- Deslizar el dedo sobre el tablero para ir adelante/atrás en la revisión (cuidado: choca con mover piezas al reintentar).
- Actualizar las versiones de las GitHub Actions de pages.yml cuando GitHub avise.
