import type { Organization } from "@/modules/organizations/access";
import { basicAnswer, explainPlan, type Answer } from "./answer";
import {
  asksOutsideActiveCompany,
  queryPlan,
  type Plan,
  type RequestInput,
} from "./plan";
import {
  interpretWithDeadline,
  ProviderFailure,
  type Provider,
  type Usage,
} from "./provider-contract";
import type { AuthorizedReads } from "./queries";

export type Outcome = {
  answer: Answer;
  status:
    | "answered"
    | "clarification"
    | "denied"
    | "provider_unavailable"
    | "provider_timeout"
    | "invalid_plan"
    | "query_error";
  intent?: Plan["intent"];
  usage?: Usage;
};

export async function runIntelligence(
  provider: Provider,
  input: RequestInput,
  organization: Organization,
  today: string,
  reads: AuthorizedReads,
  timeout?: number,
): Promise<Outcome> {
  if (asksOutsideActiveCompany(input.question))
    return {
      answer: basicAnswer(
        organization.name,
        "La consulta debe referirse a la empresa activa.",
      ),
      status: "denied",
    };

  let interpreted;
  try {
    interpreted = await interpretWithDeadline(provider, input, timeout);
  } catch (error) {
    const status =
      error instanceof ProviderFailure ? error.reason : "provider_unavailable";
    const message =
      status === "provider_timeout"
        ? "El asistente tardó demasiado. Probá de nuevo o consultá el dashboard."
        : "El proveedor del asistente no está disponible. Podés seguir usando el dashboard y los registros.";
    return { answer: basicAnswer(organization.name, message), status };
  }

  const plan = queryPlan.safeParse(interpreted.plan);
  if (!plan.success)
    return {
      answer: basicAnswer(
        organization.name,
        "No pude interpretar la consulta con seguridad. Reformulala o elegí una pregunta sugerida.",
      ),
      status: "invalid_plan",
      usage: interpreted.usage,
    };

  try {
    return {
      ...(await explainPlan(plan.data, input, organization, today, reads)),
      intent: plan.data.intent,
      usage: interpreted.usage,
    };
  } catch {
    return {
      answer: basicAnswer(
        organization.name,
        "No pude recuperar datos autorizados para esa consulta. Revisá el período e intentá de nuevo.",
      ),
      status: "query_error",
      intent: plan.data.intent,
      usage: interpreted.usage,
    };
  }
}
