import Link from "next/link";

export default function NotFound() {
  return (
    <main id="contenido" tabIndex={-1} className="standalone">
      <div className="surface empty">
        <h1>Página no disponible</h1>
        <p>
          El registro puede haber cambiado o no estar disponible para tu cuenta.
        </p>
        <Link className="button primary" href="/empresas">
          Ir a mis empresas
        </Link>
      </div>
    </main>
  );
}
