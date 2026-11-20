"use server";

import { z } from "zod";
import { organizationAccess } from "@/modules/organizations/access";
import {
  canManageOperations,
  todayIn,
  validPeriod,
} from "@/modules/operations/model";
import { basicAnswer, type Answer } from "./answer";
import { intelligenceConfig } from "./config";
import { demoProvider } from "./demo";
import { openAIProvider } from "./openai";
import { requestInput } from "./plan";
import { authorizedReads } from "./queries";
import { runIntelligence } from "./service";

export async function askIntelligence(
  org: string,
  request: unknown,
): Promise<Answer> {
  const { client, organization, role } = await organizationAccess(org);
  const { name, timezone } = organization;
  if (!canManageOperations(role))
    return basicAnswer(
      name,
      "Tu cuenta requiere un rol gerencial para consultar el asistente.",
    );

  const config = intelligenceConfig();
  if (config.mode === "disabled")
    return basicAnswer(
      name,
      "El asistente está deshabilitado en este entorno.",
    );

  const today = todayIn(timezone);
  const input = requestInput.safeParse(request);
  if (!input.success || !validPeriod(input.data.from, input.data.to, today))
    return basicAnswer(
      name,
      "Ingresá una pregunta de 3 a 500 caracteres y un período válido de hasta 366 días.",
    );

  const provider =
    config.mode === "demo" ? demoProvider : openAIProvider(config);
  const reservation = await client.rpc("begin_intelligence_request", {
    p_org: org,
    p_mode: config.mode,
    p_model: provider.model,
  });
  const id = z.uuid().safeParse(reservation.data);
  if (reservation.error || !id.success) {
    if (reservation.error?.message === "intelligence_rate_limited")
      return basicAnswer(
        name,
        "Alcanzaste el límite de consultas. Esperá antes de volver a intentar.",
      );
    return basicAnswer(
      name,
      "No se pudo autorizar esa consulta. Podés seguir usando las pantallas habituales.",
    );
  }

  const outcome = await runIntelligence(
    provider,
    input.data,
    organization,
    today,
    authorizedReads(client, org),
  );
  const { error } = await client.rpc("finish_intelligence_request", {
    p_org: org,
    p_request: id.data,
    p_status: outcome.status,
    p_intent: outcome.intent ?? null,
    p_input: outcome.usage?.input ?? null,
    p_output: outcome.usage?.output ?? null,
  });
  if (error)
    console.warn("Intelligence request metadata update failed", id.data);
  return outcome.answer;
}
