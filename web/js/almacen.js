// "Memoria interna" de la web: una base de datos dentro del navegador (IndexedDB).
// Cada navegador tiene la suya: tus datos no salen de tu ordenador.
//
// Almacenes:
//   partidas  -> partidas descargadas de chess.com (clave: url de la partida)
//   analisis  -> análisis de Stockfish de cada partida (clave: url), para no repetirlo
//   meta      -> datos de cada usuario: desde cuándo guardamos, meses ya completos...
//   progreso  -> ejercicios y entrenamientos superados

const NOMBRE_BD = "entrenador-ajedrez";
const VERSION_BD = 1;
let promesaBD = null;

function abrirBD() {
  if (!promesaBD) {
    promesaBD = new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
      peticion.onupgradeneeded = () => {
        const bd = peticion.result;
        const partidas = bd.createObjectStore("partidas", { keyPath: "url" });
        partidas.createIndex("usuario", "usuario");
        const analisis = bd.createObjectStore("analisis", { keyPath: "url" });
        analisis.createIndex("usuario", "usuario");
        bd.createObjectStore("meta", { keyPath: "clave" });
        bd.createObjectStore("progreso", { keyPath: "id" });
      };
      peticion.onsuccess = () => resolver(peticion.result);
      peticion.onerror = () => rechazar(peticion.error);
    });
  }
  return promesaBD;
}

// Convierte una petición de IndexedDB (que usa eventos) en una promesa.
function comoPromesa(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

async function almacen(nombre, modo = "readonly") {
  const bd = await abrirBD();
  return bd.transaction(nombre, modo).objectStore(nombre);
}

export async function obtener(nombre, clave) {
  return comoPromesa((await almacen(nombre)).get(clave));
}

export async function guardar(nombre, valor) {
  return comoPromesa((await almacen(nombre, "readwrite")).put(valor));
}

export async function borrar(nombre, clave) {
  return comoPromesa((await almacen(nombre, "readwrite")).delete(clave));
}

export async function todosDeUsuario(nombre, usuario) {
  return comoPromesa((await almacen(nombre)).index("usuario").getAll(usuario));
}

export async function todos(nombre) {
  return comoPromesa((await almacen(nombre)).getAll());
}

// Progreso de ejercicios y entrenamientos (separado por usuario).
export async function progresoDe(usuario, id) {
  return obtener("progreso", `${usuario}|${id}`);
}

export async function apuntarProgreso(usuario, id, acierto) {
  const clave = `${usuario}|${id}`;
  const p = (await obtener("progreso", clave)) || { id: clave, intentos: 0, aciertos: 0 };
  p.intentos += 1;
  if (acierto) p.aciertos += 1;
  p.ultimo = acierto ? "acierto" : "fallo";
  p.fecha = Date.now();
  await guardar("progreso", p);
  return p;
}

export async function todoElProgreso(usuario) {
  const lista = await todos("progreso");
  return new Map(lista.filter((p) => p.id.startsWith(usuario + "|")).map((p) => [p.id.slice(usuario.length + 1), p]));
}

// Usuario con el que se abrió la web la última vez.
export async function usuarioActual() {
  return (await obtener("meta", "actual"))?.usuario || null;
}

export async function fijarUsuarioActual(usuario) {
  return guardar("meta", { clave: "actual", usuario });
}
