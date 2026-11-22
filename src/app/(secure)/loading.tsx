export default function Loading() {
  return (
    <main id="contenido" tabIndex={-1} className="loading">
      <h1 className="sr-only">Espacio de trabajo</h1>
      <p role="status">Cargando tu espacio de trabajo…</p>
    </main>
  );
}
