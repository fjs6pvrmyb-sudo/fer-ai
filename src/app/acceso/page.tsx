import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand, Icon } from "@/components/icon";
import { supabaseConfig } from "@/modules/auth/config";
import { currentSession } from "@/modules/auth/session";
import { companySelectionPath } from "@/modules/auth/destination";
import { LoginForm } from "./login-form";

export const metadata = { title: "Acceso" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string | string[] }>;
}) {
  const forSale = (await searchParams).destino === "venta";
  if (forSale && (await currentSession())) redirect(companySelectionPath(true));
  return (
    <main id="contenido" tabIndex={-1} className="login-layout">
      <section className="login-main">
        <Link href="/" aria-label="FER AI, inicio">
          <Brand />
        </Link>
        <div className="login-content">
          <h1>Iniciá sesión</h1>
          <p>
            {forSale
              ? "Ingresá con tu cuenta para registrar una venta."
              : "Ingresá con tu cuenta para acceder a tus empresas."}
          </p>
          <LoginForm configured={Boolean(supabaseConfig())} forSale={forSale} />
        </div>
        <span className="login-footer">FER AI · Gestión empresarial</span>
      </section>
      <aside className="login-aside">
        <div className="login-visual" aria-hidden="true">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />
          <span className="orbit-mark mark-grid">
            <Icon name="grid" size={24} />
          </span>
          <span className="orbit-mark mark-wallet">
            <Icon name="wallet" size={27} />
          </span>
          <span className="orbit-mark mark-receipt">
            <Icon name="receipt" size={24} />
          </span>
          <span className="orbit-core">
            <Brand />
          </span>
        </div>
        <div className="login-caption">
          <p>Tu negocio tiene datos.</p>
          <p>Convertí esos datos en decisiones.</p>
        </div>
      </aside>
    </main>
  );
}
