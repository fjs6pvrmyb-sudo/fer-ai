import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/ui";
import { canManageOperations } from "@/modules/operations/model";
import { organizationAccess } from "@/modules/organizations/access";
import { ConversationWorkspace } from "./workspace";

export const metadata = { title: "FER AI Intelligence" };

export default async function Intelligence({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const access = await organizationAccess(org);
  if (!canManageOperations(access.role)) notFound();
  return (
    <>
      <PageHeading
        title="FER AI Intelligence"
        description={`Consultá cifras o prepará una venta · ${access.organization.name}`}
        action={
          <Link href={`/empresas/${org}`} className="button secondary">
            Ir al dashboard
          </Link>
        }
      />
      <ConversationWorkspace access={access} managerial />
    </>
  );
}
