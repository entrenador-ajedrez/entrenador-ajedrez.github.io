// Niveles del rival en "Jugar". Los ELO son aproximados.
//   skill: "Skill Level" de Stockfish (0-20) · elo: limita su fuerza (solo funciona desde ~1320)
// (Las aperturas y finales del entrenamiento están en catalogo.json.)
export const NIVELES = [
  { id: 1, nombre: "Muy fácil (~600)", skill: 0, profundidad: 1, ms: 50 },
  { id: 2, nombre: "Fácil (~850)", skill: 2, profundidad: 3, ms: 100 },
  { id: 3, nombre: "Nivel 1000 (~1050)", skill: 4, profundidad: 5, ms: 200 },
  { id: 4, nombre: "Algo más fuerte (~1350)", elo: 1350, ms: 400 },
  { id: 5, nombre: "Jugador de club (~1600)", elo: 1600, ms: 500 },
  { id: 6, nombre: "Fuerte (~2000)", elo: 2000, ms: 500 },
  { id: 7, nombre: "Máximo (Stockfish a tope)", skill: 20, ms: 1000 },
];
