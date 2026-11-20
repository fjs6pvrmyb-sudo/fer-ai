import { z } from "zod";
import type { Role } from "@/modules/organizations/access";
import { paymentMethods } from "@/modules/payments/methods";

export const canManageOperations = (role: Role) =>
  role === "admin" || role === "manager";
export const daySchema = z.iso
  .date()
  .refine((date) => !date.startsWith("0000"));
export const todayIn = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const integer = z.string().regex(/^-?\d+$/);
const metrics = z.object({
  sale_count: integer,
  sales_minor: integer,
  payment_count: integer,
  collected_minor: integer,
  prior_sales_minor: integer,
  outstanding_minor: integer,
  cash_minor: integer,
  methods: z.array(
    z.object({ method: z.enum(paymentMethods), amount_minor: integer }),
  ),
  unverified_count: integer,
  discrepancy_count: integer,
  evidence_count: integer,
  verified_minor: integer,
  open_days: integer,
  pending_days: integer,
  closed_days: integer,
});

export const operationsMetrics = metrics;
export type Metrics = z.infer<typeof metrics>;

export const dayReview = z.object({
  state: z.enum(["open", "pending", "closed"]),
  exists: z.boolean(),
  metrics,
  review_version: z.string(),
  snapshot: z
    .object({
      id: z.uuid(),
      actor_id: z.uuid(),
      closed_at: z.string(),
      version: z.number(),
      currency: z.string(),
      scale: z.number(),
      metrics,
      cash_counted_minor: integer.nullable(),
      cash_difference_minor: integer.nullable(),
    })
    .nullable(),
});

export const operatingState = {
  open: "Abierta",
  pending: "Cierre pendiente",
  closed: "Cerrada",
} as const;

export const evidenceStatus = ["pending", "verified", "discrepancy"] as const;
export const evidenceKinds = ["transfer", "card", "receipt"] as const;
export const evidenceKindLabels = {
  transfer: "Transferencia / SINPE",
  card: "Tarjeta",
  receipt: "Recibo",
} as const;
export const evidenceLabels = {
  missing: "Sin evidencia",
  pending: "Pendiente de revisión",
  verified: "Verificado",
  discrepancy: "Con discrepancia",
} as const;
export const reconciliationState = (report: Metrics) => {
  if (report.payment_count === "0" || report.evidence_count === "0")
    return "Pendiente";
  return report.unverified_count === "0" ? "Verificada" : "En revisión";
};

export function validPeriod(from: string, to: string, today: string) {
  return (
    daySchema.safeParse(from).success &&
    daySchema.safeParse(to).success &&
    from <= to &&
    to <= today &&
    Date.parse(to) - Date.parse(from) <= 365 * 86_400_000
  );
}
