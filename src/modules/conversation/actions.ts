"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { catalog } from "@/modules/catalog/data";
import { askIntelligence } from "@/modules/intelligence/actions";
import type { Answer } from "@/modules/intelligence/answer";
import { intelligenceConfig } from "@/modules/intelligence/config";
import { ProviderFailure } from "@/modules/intelligence/provider-contract";
import { organizationAccess } from "@/modules/organizations/access";
import { operationError } from "@/modules/shared/actions";
import {
  documentSchema,
  draftKey,
  extraction,
  type DraftView,
} from "./contract";
import { readDraft, saveDraft } from "./data";
import {
  applyExtraction,
  draftView,
  extractedLiteralsValid,
  previewDraft,
} from "./draft";
import { interpretSale } from "./extract";
import {
  isCancellation,
  isReadQuestion,
  mentionsOtherCurrency,
  unsafeInstruction,
} from "./language";

type TurnResult = {
  message: string;
  draft?: DraftView | null;
  answer?: Answer;
  retryable?: boolean;
};
type DraftResult = { message: string; draft?: DraftView | null };

const request = z.strictObject({
  question: z.string().trim().min(3).max(500),
  from: z.string().max(10),
  to: z.string().max(10),
  draft: draftKey.nullable(),
});

const messages: Record<string, string> = {
  draft_unavailable:
    "El borrador no está disponible para esta empresa y usuario.",
  draft_revision:
    "El borrador cambió. Recargá la página y revisá la revisión más reciente.",
  draft_expired: "El borrador venció. Prepará y revisá uno nuevo.",
  draft_not_editable: "El borrador ya está confirmado o cancelado.",
  draft_needs_review: "Revisá la versión vigente antes de confirmar.",
  draft_day_changed:
    "Cambió la jornada. Revisá el borrador antes de confirmar de nuevo.",
  catalog_changed:
    "Cambió un producto o su precio. Revisá las cifras actualizadas.",
  draft_payment_method_changed:
    "Cambió la disponibilidad de un medio de pago. Editá los pagos antes de confirmar.",
  intelligence_rate_limited:
    "Alcanzaste el límite de consultas. Esperá antes de volver a intentar.",
};

function failure(code?: string): DraftResult {
  return {
    message:
      code && Object.hasOwn(messages, code)
        ? messages[code]
        : operationError(code).error!,
  };
}

export async function sendConversation(
  org: string,
  input: unknown,
): Promise<TurnResult> {
  const parsed = request.safeParse(input);
  if (!parsed.success)
    return { message: "Escribí un mensaje de 3 a 500 caracteres." };
  const { question, from, to, draft: key } = parsed.data;
  const { client, organization, user } = await organizationAccess(org);
  if (isReadQuestion(question)) {
    const answer = await askIntelligence(org, { question, from, to });
    return { message: answer.message, answer };
  }
  if (unsafeInstruction(question)) {
    return {
      message:
        "Puedo preparar ventas con revisión y confirmación. Revisá la instrucción o usá el formulario manual.",
    };
  }
  if (mentionsOtherCurrency(question, organization.currency)) {
    return {
      message: `La moneda declarada difiere de ${organization.currency}, la moneda de esta empresa.`,
    };
  }
  if (isCancellation(question)) return cancelSaleDraft(org, key);

  const config = intelligenceConfig();
  if (config.mode === "disabled")
    return {
      message:
        "La interpretación está deshabilitada. Podés registrar la venta manualmente.",
    };

  const record = key ? await readDraft(client, org, user.id, key.id) : null;
  if (key && !record) return failure("draft_expired");
  if (record && record.revision !== key?.revision)
    return failure("draft_revision");
  const previous =
    record && ["editing", "review"].includes(record.status)
      ? documentSchema.parse(record.document)
      : null;

  const reservation = await client.rpc("begin_sale_interpretation", {
    p_org: org,
    p_mode: config.mode,
    p_model: config.mode === "demo" ? "feria-sales-demo-v1" : config.model,
  });
  if (reservation.error || typeof reservation.data !== "string")
    return { ...failure(reservation.error?.message), retryable: true };

  let status = "query_error";
  let intent: string | null = null;
  let usage: { input: number; output: number } | undefined;
  try {
    const interpreted = await interpretSale(
      config,
      question,
      Boolean(previous),
    );
    usage = interpreted.usage;
    const plan = extraction.safeParse(interpreted.plan);
    if (!plan.success || !extractedLiteralsValid(question, plan.data)) {
      status = "invalid_plan";
      return {
        message:
          "La interpretación no coincide con el mensaje. Reformulalo o usá el formulario manual.",
      };
    }
    if (plan.data.intent === "read") {
      status = "answered";
      const answer = await askIntelligence(org, { question, from, to });
      return { message: answer.message, answer };
    }
    if (plan.data.intent === "unsupported" || plan.data.intent === "cancel") {
      status = "clarification";
      intent = "unsupported";
      return {
        message:
          "Para preparar una venta, indicá productos, cantidades y los pagos recibidos. También podés editar o cancelar desde el borrador.",
      };
    }
    intent = `draft_${plan.data.intent}`;
    if ((plan.data.intent !== "create" || plan.data.append) && !previous) {
      status = "clarification";
      return {
        message:
          "Primero indicá qué productos vendiste para abrir un borrador.",
      };
    }
    if (plan.data.intent === "create" && previous) {
      status = "clarification";
      return {
        message:
          "Hay un borrador abierto. Corregilo, confirmalo o cancelalo para preparar otra venta.",
      };
    }
    const products = await catalog(client, org, true);
    const document = applyExtraction(
      plan.data,
      previous,
      organization,
      products,
    );
    const saved = await saveDraft(client, org, previous ? key : null, document);
    if (!saved.record) return failure(saved.code ?? undefined);
    const draft = draftView(saved.record, products, organization);
    status = draft.problems.length ? "clarification" : "answered";
    return {
      message: draft.problems.length
        ? "Revisá los datos pendientes del borrador."
        : "Borrador actualizado. Revisá las cifras para continuar.",
      draft,
    };
  } catch (error) {
    status = error instanceof ProviderFailure ? error.reason : "query_error";
    return {
      retryable: true,
      message:
        status === "provider_timeout"
          ? "La interpretación tardó demasiado. Intentá de nuevo o usá el formulario manual."
          : status === "provider_unavailable"
            ? "El proveedor del asistente no está disponible. Podés registrar la venta manualmente."
            : "No se pudo preparar el borrador. Intentá de nuevo.",
    };
  } finally {
    await client.rpc("finish_sale_interpretation", {
      p_org: org,
      p_request: reservation.data,
      p_status: status,
      p_intent: intent,
      p_input: usage?.input ?? null,
      p_output: usage?.output ?? null,
    });
  }
}

export async function reviewSaleDraft(
  org: string,
  rawKey: unknown,
  rawDocument: unknown,
): Promise<DraftResult> {
  const key = draftKey.safeParse(rawKey);
  const document = documentSchema.safeParse(rawDocument);
  if (!key.success || !document.success) return failure("invalid_sale");
  const { client, organization } = await organizationAccess(org);
  const products = await catalog(client, org, true);
  const { review } = previewDraft(
    key.data.id,
    document.data,
    products,
    organization,
  );
  const saved = await saveDraft(client, org, key.data, document.data, review);
  if (!saved.record) return failure(saved.code ?? undefined);
  return {
    message: review
      ? "Revisión lista. Verificá el total, los pagos y el saldo antes de confirmar."
      : "Completá los datos pendientes antes de revisar.",
    draft: draftView(saved.record, products, organization),
  };
}

export async function cancelSaleDraft(
  org: string,
  rawKey: unknown,
): Promise<DraftResult> {
  const key = draftKey.safeParse(rawKey);
  if (!key.success)
    return { message: "No hay un borrador abierto para cancelar." };
  const { client } = await organizationAccess(org);
  const { error } = await client.rpc("cancel_conversational_sale", {
    p_org: org,
    p_id: key.data.id,
    p_revision: key.data.revision,
  });
  return error
    ? failure(error.message)
    : { message: "Borrador cancelado.", draft: null };
}

export async function confirmSaleDraft(
  org: string,
  rawKey: unknown,
): Promise<DraftResult> {
  const key = draftKey.safeParse(rawKey);
  if (!key.success) return failure("invalid_sale");
  const { client, organization, user } = await organizationAccess(org);
  const { data, error } = await client.rpc("confirm_conversational_sale", {
    p_org: org,
    p_id: key.data.id,
    p_revision: key.data.revision,
  });
  if (error || !z.uuid().safeParse(data).success) {
    if (
      error &&
      [
        "catalog_changed",
        "draft_day_changed",
        "day_closed",
        "draft_payment_method_changed",
      ].includes(error.message)
    ) {
      const record = await readDraft(client, org, user.id, key.data.id);
      if (
        record?.status === "review" &&
        record.revision === key.data.revision
      ) {
        const document = documentSchema.parse(record.document);
        const saved = await saveDraft(client, org, key.data, document);
        if (saved.record) {
          const products = await catalog(client, org, true);
          return {
            ...failure(error.message),
            draft: draftView(saved.record, products, organization),
          };
        }
      }
    }
    return failure(error?.message);
  }
  const base = `/empresas/${org}`;
  revalidatePath(base);
  revalidatePath(`${base}/ventas`);
  revalidatePath(`${base}/ventas/${data}`);
  const record = await readDraft(client, org, user.id, key.data.id);
  return {
    message:
      "Venta registrada. Podés consultar el detalle, el historial y el dashboard.",
    draft: record ? draftView(record, [], organization) : undefined,
  };
}
