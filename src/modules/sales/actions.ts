"use server";

import { redirect } from "next/navigation";
import { organizationAccess } from "@/modules/organizations/access";
import { operationError, type FormState } from "@/modules/shared/actions";
import { normalizePayments, saleDraft } from "./contract";

export async function confirmSale(
  org: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  const { client, organization } = await organizationAccess(org);
  let raw: unknown;
  const payload = form.get("draft");
  if (typeof payload !== "string" || payload.length > 20_000)
    return operationError("invalid_sale");
  try {
    raw = JSON.parse(payload);
  } catch {
    return operationError("invalid_sale");
  }
  const draft = saleDraft.safeParse(raw);
  if (!draft.success) return operationError("invalid_sale");
  let payments;
  try {
    payments = normalizePayments(draft.data.payments, organization.scale);
  } catch (error) {
    return {
      error:
        error instanceof RangeError ? error.message : "Revisá los importes.",
    };
  }
  const { data, error } = await client.rpc("confirm_sale", {
    p_org: org,
    p_request: draft.data.request,
    p_lines: draft.data.lines,
    p_payments: payments,
  });
  if (error || typeof data !== "string") return operationError(error?.message);
  redirect(`/empresas/${org}/ventas/${data}`);
}
