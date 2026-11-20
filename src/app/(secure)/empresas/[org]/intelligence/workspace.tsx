import Link from "next/link";
import { Empty } from "@/components/ui";
import { paymentMethods } from "@/modules/payments/methods";
import { catalog } from "@/modules/catalog/data";
import {
  cancelSaleDraft,
  confirmSaleDraft,
  reviewSaleDraft,
  sendConversation,
} from "@/modules/conversation/actions";
import { readDraft } from "@/modules/conversation/data";
import { draftView } from "@/modules/conversation/draft";
import { intelligenceConfig } from "@/modules/intelligence/config";
import { todayIn } from "@/modules/operations/model";
import type { organizationAccess } from "@/modules/organizations/access";
import { Chat } from "./chat";

export async function ConversationWorkspace({
  access,
  managerial,
}: {
  access: Awaited<ReturnType<typeof organizationAccess>>;
  managerial: boolean;
}) {
  const { organization, user, client } = access;
  const org = organization.id;
  const base = `/empresas/${org}`;
  const { mode } = intelligenceConfig();
  if (mode === "disabled") {
    return (
      <Empty
        icon="grid"
        title="Asistente deshabilitado"
        action={
          <Link className="button secondary" href={`${base}/ventas/nueva`}>
            Venta manual
          </Link>
        }
      >
        Este entorno todavía no tiene un proveedor habilitado. Podés seguir
        usando las operaciones habituales.
      </Empty>
    );
  }
  const [products, record] = await Promise.all([
    catalog(client, org, true),
    readDraft(client, org, user.id),
  ]);
  return (
    <>
      {mode === "demo" && (
        <p className="feedback intelligence-mode">
          <strong>Modo demo.</strong> Interpretación determinista con datos de
          PostgreSQL.
        </p>
      )}
      <Chat
        key={org}
        organization={organization.name}
        today={todayIn(organization.timezone)}
        managerial={managerial}
        action={sendConversation.bind(null, org)}
        controls={{
          base,
          currency: organization.currency,
          scale: organization.scale,
          products,
          methods:
            organization.conversational_payment_methods ?? paymentMethods,
          initial: record ? draftView(record, products, organization) : null,
          review: reviewSaleDraft.bind(null, org),
          confirm: confirmSaleDraft.bind(null, org),
          cancel: cancelSaleDraft.bind(null, org),
        }}
      />
    </>
  );
}
