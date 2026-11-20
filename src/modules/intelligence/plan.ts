import { z } from "zod";
import { daySchema, validPeriod } from "@/modules/operations/model";
import { paymentMethods } from "@/modules/payments/methods";

const intents = [
  "sales",
  "collections",
  "sales_and_collections",
  "balance",
  "closure",
  "products",
  "evidence",
  "differences",
  "priorities",
  "compare",
  "unsupported",
] as const;
const kinds = [
  "context",
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "latest_close",
  "explicit",
  "ambiguous",
] as const;
const periodPlan = z.strictObject({
  kind: z.enum(kinds),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const queryPlan = z.strictObject({
  intent: z.enum(intents),
  period: periodPlan,
  comparison: periodPlan.nullable(),
  method: z.enum(paymentMethods).nullable(),
  organization: z.string().nullable(),
});

export type Plan = z.infer<typeof queryPlan>;
export type PeriodPlan = z.infer<typeof periodPlan>;
export type Period = { from: string; to: string };

export const requestInput = z.object({
  question: z.string().trim().min(3).max(500),
  from: daySchema,
  to: daySchema,
});
export type RequestInput = z.infer<typeof requestInput>;

export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const relativePatterns = {
  today: /\bhoy\b/,
  yesterday: /\bayer\b/,
  this_week: /\b(?:esta semana|semana actual)\b/,
  last_week: /\b(?:semana pasada|semana anterior)\b/,
  latest_close: /\b(?:ultimo cierre|ultima jornada cerrada)\b/,
};

export function explicitDates(question: string) {
  const dates = Array.from(
    question.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/g),
    ([raw]) => {
      if (!raw.includes("/")) return raw;
      const [day, month, year] = raw.split("/");
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    },
  );
  return [...new Set(dates)];
}

export function mentionedPeriods(question: string) {
  const text = normalize(question);
  return Object.entries(relativePatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([kind]) => kind);
}

export const vaguePeriod = (question: string) =>
  /\b(?:mes|bimestre|semestre|ano|hace|anteayer|anoche|reciente(?:s)?|manana)\b|\b\d{1,2}\s+de\b|\b(?:esa|aquella|otra) (?:fecha|jornada)\b/.test(
    normalize(question),
  ) && !/\bultima jornada cerrada\b/.test(normalize(question));

const methodPatterns = {
  transfer: /\b(?:sinpe|transferencias?)\b/,
  card: /\b(?:tarjetas?|datafono)\b/,
  cash: /\befectivo\b/,
};

export function mentionedPaymentMethods(question: string) {
  const text = normalize(question);
  return paymentMethods.filter((method) => methodPatterns[method].test(text));
}

export const methodMentioned = (question: string) =>
  mentionedPaymentMethods(question)[0] ?? null;

function moveDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monday(today: string) {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  return moveDate(today, -((day + 6) % 7));
}

export function resolvePeriod(
  spec: PeriodPlan,
  question: string,
  context: Period,
  today: string,
  latest: string | null,
): Period | null {
  const dates = explicitDates(question);
  const mentions = mentionedPeriods(question);
  if (spec.kind !== "explicit" && (spec.from !== null || spec.to !== null))
    return null;

  let period: Period | null;
  switch (spec.kind) {
    case "explicit":
      period =
        spec.from &&
        spec.to &&
        dates.includes(spec.from) &&
        dates.includes(spec.to)
          ? { from: spec.from, to: spec.to }
          : null;
      break;
    case "context":
      period =
        dates.length || mentions.length || vaguePeriod(question)
          ? null
          : { from: context.from, to: context.to };
      break;
    case "ambiguous":
      return null;
    default: {
      if (!mentions.includes(spec.kind)) return null;
      if (spec.kind === "this_week")
        period = { from: monday(today), to: today };
      else if (spec.kind === "last_week")
        period = {
          from: moveDate(monday(today), -7),
          to: moveDate(monday(today), -1),
        };
      else {
        const day =
          spec.kind === "latest_close"
            ? latest
            : spec.kind === "yesterday"
              ? moveDate(today, -1)
              : today;
        period = day ? { from: day, to: day } : null;
      }
    }
  }
  return period && validPeriod(period.from, period.to, today) ? period : null;
}

export function asksOutsideActiveCompany(question: string) {
  return /\b(?:otra empresa|otra organizacion|todas las empresas|todas las organizaciones|todos los negocios|todas las companias)\b/.test(
    normalize(question),
  );
}

export function matchedPeriodDates(plan: Plan, question: string) {
  const dates = explicitDates(question);
  const mentions = mentionedPeriods(question);
  const selected = [plan.period, plan.comparison].filter(
    (value): value is PeriodPlan => value !== null,
  );
  const explicit = new Set(
    selected.flatMap(({ from, to }) => [from, to]).filter(Boolean),
  );
  return (
    dates.every((date) => explicit.has(date)) &&
    mentions.every((mention) => selected.some(({ kind }) => kind === mention))
  );
}
