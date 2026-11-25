// Cuenta una "persona nueva" la primera vez que un navegador abre la web (una sola vez por navegador).
// No guarda nada personal: solo una marca local para no repetir el aviso. Si no hay memoria o el
// contador no carga (bloqueador de anuncios), no pasa nada.
const MARCA = "visita-contada";
function avisar() {
  try {
    if (localStorage.getItem(MARCA)) return;
    if (!window.goatcounter?.count) return;
    window.goatcounter.count({ path: "persona-nueva", title: "Persona nueva", event: true });
    localStorage.setItem(MARCA, "1");
  } catch { /* sin memoria: no se cuenta */ }
}
window.addEventListener("load", () => setTimeout(avisar, 1500));
