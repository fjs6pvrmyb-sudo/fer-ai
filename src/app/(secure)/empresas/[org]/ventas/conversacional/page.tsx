import Link from "next/link";
import { PageHeading } from "@/components/ui";
import { canManageOperations } from "@/modules/operations/model";
import { organizationAccess } from "@/modules/organizations/access";
import { ConversationWorkspace } from "../../intelligence/workspace";

export const metadata = { title: "Venta conversacional" };

export default async function ConversationalSales({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const access = await organizationAccess(org);
  return (
    <>
      <PageHeading
        title="Venta conversacional"
        description={`Contale a FER qué vendiste · ${access.organization.name}`}
        action={
          <Link
            className="button secondary"
            href={`/empresas/${org}/ventas/nueva`}
          >
            Venta manual
          </Link>
        }
      />
      <ConversationWorkspace
        access={access}
        managerial={canManageOperations(access.role)}
      />
    </>
  );
}
