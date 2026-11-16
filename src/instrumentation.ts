/** Se ejecuta una vez al arrancar el servidor: pone en marcha el worker de renderizado y recupera trabajos interrumpidos. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getRenderQueue } = await import("@/server/render");
    getRenderQueue();
  }
}
