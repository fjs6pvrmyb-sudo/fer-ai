"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { organizationAccess } from "@/modules/organizations/access";
import type { FormState } from "@/modules/shared/actions";
import { parseAmount } from "@/modules/shared/money";
import {
  canManageOperations,
  daySchema,
  evidenceKinds,
  evidenceStatus,
} from "./model";

const errors: Record<string, string> = {
  forbidden: "Tu rol no permite realizar esta operación.",
  invalid_operating_day: "Elegí una jornada válida que ya haya comenzado.",
  day_not_reviewable:
    "La jornada debe estar en revisión para confirmar el cierre.",
  review_changed:
    "Los movimientos cambiaron. Revisá las cifras actualizadas antes de confirmar.",
  invalid_cash_count: "El conteo de efectivo está fuera del rango permitido.",
  invalid_evidence:
    "Revisá la referencia y el importe. Una discrepancia requiere una observación.",
  evidence_amount_mismatch:
    "El importe documental difiere del cobro. Guardá la revisión como discrepancia.",
  payment_unavailable: "El movimiento no está disponible para esta empresa.",
};

function message(code: string) {
  return {
    error: Object.hasOwn(errors, code)
      ? errors[code]
      : "No se pudo completar la operación. Intentá de nuevo.",
  };
}

export async function updateClosing(
  org: string,
  day: string,
  review: string | null,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!daySchema.safeParse(day).success)
    return message("invalid_operating_day");
  const { client, organization, role } = await organizationAccess(org);
  if (!canManageOperations(role)) return message("forbidden");

  const raw = String(form.get("cash") ?? "").trim();
  let cash: string | null = null;
  if (review && raw) {
    try {
      cash = parseAmount(raw, organization.scale).toString();
    } catch {
      return message("invalid_cash_count");
    }
  }
  const result = review
    ? await client.rpc("complete_day_close", {
        p_org: org,
        p_day: day,
        p_review: review,
        p_cash_counted: cash,
      })
    : await client.rpc("start_day_close", { p_org: org, p_day: day });
  const base = `/empresas/${org}`;
  revalidatePath(`${base}/jornadas/${day}`);
  if (result.error) return message(result.error.message);
  revalidatePath(`${base}/jornadas`);
  revalidatePath(base);
  return {
    success: review ? "Cierre operativo guardado." : "Jornada en revisión.",
  };
}

export async function saveEvidence(
  org: string,
  payment: string,
  day: string,
  _: FormState,
  form: FormData,
): Promise<FormState> {
  if (!z.uuid().safeParse(payment).success || !daySchema.safeParse(day).success)
    return message("payment_unavailable");
  const { client, organization, role } = await organizationAccess(org);
  if (!canManageOperations(role)) return message("forbidden");
  const fields = z
    .object({
      kind: z.enum(evidenceKinds),
      reference: z.string().trim().min(1).max(120),
      status: z.enum(evidenceStatus),
      notes: z.string().trim().max(500),
      amount: z.string().trim().min(1).max(30),
    })
    .safeParse({
      kind: form.get("kind"),
      reference: form.get("reference"),
      status: form.get("status"),
      notes: form.get("notes"),
      amount: form.get("amount"),
    });
  if (!fields.success) return message("invalid_evidence");

  let amount: bigint;
  try {
    amount = parseAmount(fields.data.amount, organization.scale);
  } catch {
    return message("invalid_evidence");
  }
  if (amount <= 0n) return message("invalid_evidence");
  const { kind, reference, status, notes } = fields.data;
  const { error } = await client.rpc("save_payment_evidence", {
    p_org: org,
    p_payment: payment,
    p_kind: kind,
    p_reference: reference,
    p_amount: amount.toString(),
    p_status: status,
    p_notes: notes,
  });
  if (error) return message(error.message);
  const base = `/empresas/${org}`;
  revalidatePath(`${base}/conciliacion`);
  revalidatePath(`${base}/jornadas/${day}`);
  revalidatePath(base);
  return { success: "Revisión documental guardada." };
}
