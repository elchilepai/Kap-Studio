"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card stack">
      <h2>No se pudo completar la acción</h2>
      <p className="muted">{error.message}</p>
      <div className="row"><button className="btn primary" onClick={reset}>Reintentar</button><button className="btn" onClick={() => history.back()}>Volver</button></div>
    </div>
  );
}
