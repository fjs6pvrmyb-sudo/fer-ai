import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeading } from "@/components/ui";
import { askIntelligence } from "@/modules/intelligence/actions";
import { intelligenceConfig } from "@/modules/intelligence/config";
import { canManageOperations, todayIn } from "@/modules/operations/model";
import { organizationAccess } from "@/modules/organizations/access";
import { Chat } from "./chat";

export const metadata = { title: "FER AI Intelligence" };

export default async function Intelligence({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { organization, role } = await organizationAccess(org);
  if (!canManageOperations(role)) notFound();
  const { mode } = intelligenceConfig();
  const dashboard = (
    <Link href={`/empresas/${org}`} className="button secondary">
      Ir al dashboard
    </Link>
  );
  return (
    <>
      <PageHeading
        title="FER AI Intelligence"
        description={`Consultas de solo lectura · ${organization.name}`}
        action={dashboard}
      />
      {mode === "demo" && (
        <p className="feedback intelligence-mode">
          <strong>Modo demo.</strong> La interpretación es simulada. Las cifras
          se consultan en PostgreSQL.
        </p>
      )}
      {mode === "disabled" ? (
        <Empty icon="grid" title="Asistente deshabilitado">
          Este entorno todavía no tiene un proveedor de IA habilitado. Podés
          consultar tus operaciones en el dashboard.
        </Empty>
      ) : (
        <Chat
          key={org}
          organization={organization.name}
          today={todayIn(organization.timezone)}
          action={askIntelligence.bind(null, org)}
        />
      )}
    </>
  );
}
