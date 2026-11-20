"use client";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main id="contenido" tabIndex={-1} className="standalone">
      <div className="surface empty">
        <h1>No pudimos cargar esta página</h1>
        <p>Revisá la conexión e intentá de nuevo.</p>
        <button className="button primary" onClick={reset}>
          Volver a intentar
        </button>
      </div>
    </main>
  );
}
