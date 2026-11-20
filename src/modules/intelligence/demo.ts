import {
  explicitDates,
  mentionedPeriods,
  methodMentioned,
  normalize,
  vaguePeriod,
  type PeriodPlan,
  type Plan,
} from "./plan";
import { ProviderFailure, type Provider } from "./provider-contract";

const relative = (kind: PeriodPlan["kind"]): PeriodPlan => ({
  kind,
  from: null,
  to: null,
});

export const demoProvider: Provider = {
  model: "feria-demo-v1",
  async interpret({ question }) {
    const text = normalize(question);
    if (text === "simular interrupcion del proveedor")
      throw new ProviderFailure("provider_unavailable");

    let intent: Plan["intent"] = "unsupported";
    const sales = /vendimos|ventas?/.test(text);
    const collected = /cobram|cobros|cobrado|recaud/.test(text);
    if (/compar|versus|\bvs\b/.test(text)) intent = "compare";
    else if (/productos?/.test(text) && /vendid|ranking|unidades/.test(text))
      intent = "products";
    else if (
      /prioridad|revisar primero|deberia revisar|pendiente de revisar|revisar primero/.test(
        text,
      )
    )
      intent = "priorities";
    else if (/comprobante|evidencia|verificar/.test(text)) intent = "evidence";
    else if (/diferencia|discrepancia/.test(text)) intent = "differences";
    else if (/saldo|pendiente de cobro|por cobrar/.test(text))
      intent = "balance";
    else if (/cierre|cerramos|cerrada|cerro/.test(text)) intent = "closure";
    else if (sales && collected) intent = "sales_and_collections";
    else if (sales) intent = "sales";
    else if (collected || methodMentioned(question)) intent = "collections";

    const dates = explicitDates(question);
    const mentions = mentionedPeriods(question);
    const explicit = (from: string, to: string): PeriodPlan => ({
      kind: "explicit",
      from,
      to,
    });
    const orderedPeriods = mentions.map((mention) =>
      relative(mention as PeriodPlan["kind"]),
    );
    if (intent === "compare")
      orderedPeriods.push(...dates.map((date) => explicit(date, date)));
    const period =
      orderedPeriods[0] ??
      (dates.length
        ? explicit(dates[0], dates[dates.length - 1])
        : relative(vaguePeriod(question) ? "ambiguous" : "context"));
    const organization =
      question.match(/\b(?:Panader[ií]a|Cafeter[ií]a) Demo\b/i)?.[0] ?? null;
    return {
      plan: {
        intent,
        period,
        comparison: orderedPeriods[1] ?? null,
        method: methodMentioned(question),
        organization,
      },
    };
  },
};
