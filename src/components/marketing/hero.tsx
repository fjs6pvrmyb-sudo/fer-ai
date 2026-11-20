import Link from "next/link";
import { Icon } from "@/components/icon";
import { ExamplePreview } from "./product-demo";

export function Hero() {
  return (
    <section className="marketing-hero">
      <div className="marketing-shell marketing-hero-grid">
        <div className="marketing-hero-copy">
          <h1>
            Tu negocio, más inteligente. <span>Tu gestión, más sencilla.</span>
          </h1>
          <p>
            Registrá ventas, seguí lo que te deben y consultá cómo va tu negocio
            con un asistente que entiende tus operaciones.
          </p>
          <div className="marketing-actions">
            <a href="#demostracion" className="button marketing-mint">
              Ver demostración <Icon name="arrow" size={18} />
            </a>
            <Link href="/empresa" className="button marketing-outline">
              Entrar a mi empresa
            </Link>
          </div>
        </div>
        <ExamplePreview />
      </div>
    </section>
  );
}
