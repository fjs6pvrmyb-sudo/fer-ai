import type { Organization } from "@/modules/organizations/access";
import type { Metrics } from "@/modules/operations/model";
import { paymentLabels } from "@/modules/payments/methods";
import { formatMoney } from "@/modules/shared/money";
import {
  asksOutsideActiveCompany,
  matchedPeriodDates,
  mentionedPeriods,
  mentionedPaymentMethods,
  normalize,
  resolvePeriod,
  type Period,
  type Plan,
  type RequestInput,
} from "./plan";
import type { AuthorizedReads } from "./queries";

type Indicator = {
  label: string;
  value: string;
  state: "confirmed" | "pending" | "unavailable";
  href?: string;
};
type Link = { label: string; href: string };

export type Answer = {
  organization: string;
  periods: Period[];
  message: string;
  indicators: Indicator[];
  sources: Link[];
  warnings: string[];
  missing: string[];
  recommendations: string[];
};

export type Explanation = {
  answer: Answer;
  status: "answered" | "clarification" | "denied";
};

export function basicAnswer(organization: string, message: string): Answer {
  return {
    organization,
    message,
    periods: [],
    indicators: [],
    sources: [],
    warnings: [],
    missing: [],
    recommendations: [],
  };
}

const dashboardLink = (org: string, period: Period) => ({
  label: "Dashboard del período",
  href: `/empresas/${org}?desde=${period.from}&hasta=${period.to}`,
});

function coverage(answer: Answer, stats: Metrics, period: Period) {
  const size =
    Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) +
    1;
  const days =
    BigInt(stats.open_days) +
    BigInt(stats.pending_days) +
    BigInt(stats.closed_days);
  if (days === 0n) {
    answer.missing.push(
      "No hay jornadas registradas en el período consultado.",
    );
  } else if (days < BigInt(size)) {
    answer.warnings.push(
      `Hay jornadas registradas para ${days} de ${size} días del período.`,
    );
  }
  return days !== 0n;
}

function priorities(stats: Metrics) {
  const items: string[] = [];
  if (BigInt(stats.discrepancy_count) > 0n)
    items.push("Revisá las discrepancias documentadas en Conciliación.");
  if (BigInt(stats.pending_days) > 0n)
    items.push(
      "Revisá las jornadas con cierre pendiente antes de confirmarlas.",
    );
  if (BigInt(stats.unverified_count) > BigInt(stats.discrepancy_count))
    items.push(
      "Priorizá los cobros que aún necesitan evidencia o revisión documental.",
    );
  if (BigInt(stats.outstanding_minor) > 0n)
    items.push(
      "Revisá en Ventas los saldos que requieren seguimiento de cobro.",
    );
  return items.slice(0, 3);
}

export async function explainPlan(
  plan: Plan,
  input: RequestInput,
  organization: Organization,
  today: string,
  reads: AuthorizedReads,
): Promise<Explanation> {
  const { id: org, name, currency, scale } = organization;
  const { question } = input;
  const answer = basicAnswer(name, "");
  const money = (minor: string) => formatMoney(minor, currency, scale);
  const clarify = (message: string): Explanation => ({
    answer: { ...answer, message },
    status: "clarification",
  });
  if (
    asksOutsideActiveCompany(question) ||
    (plan.organization !== null &&
      normalize(plan.organization) !== normalize(name))
  ) {
    return {
      answer: {
        ...answer,
        message:
          "La consulta debe referirse a la empresa activa. Cambiá de empresa si tenés una membresía autorizada.",
      },
      status: "denied",
    };
  }
  if (plan.intent === "unsupported") {
    return clarify(
      "Puedo consultar ventas, cobros, saldos, cierres, productos y conciliación. Los costos y la rentabilidad no están disponibles.",
    );
  }
  if (
    !matchedPeriodDates(plan, question) ||
    (plan.intent === "compare") !== (plan.comparison !== null)
  ) {
    return clarify(
      "Indicá con más precisión la fecha o las dos jornadas que querés comparar.",
    );
  }

  const wantsLatest =
    plan.period.kind === "latest_close" ||
    plan.comparison?.kind === "latest_close";
  if (wantsLatest && !mentionedPeriods(question).includes("latest_close")) {
    return clarify("Indicá el período que querés consultar.");
  }
  const latest = wantsLatest ? await reads.latestClosure(today) : null;
  if (wantsLatest && !latest) {
    answer.missing.push(
      "Esta empresa todavía no tiene un cierre operativo registrado.",
    );
    return clarify("No encontré un último cierre hasta la jornada actual.");
  }

  const period = resolvePeriod(plan.period, question, input, today, latest);
  if (!period)
    return clarify(
      "Indicá una fecha, un rango válido de hasta 366 días o el período de referencia.",
    );
  answer.periods.push(period);
  answer.sources.push(dashboardLink(org, period));
  const dayLink = {
    label: `Jornada ${period.to}`,
    href: `/empresas/${org}/jornadas/${period.to}`,
  };
  const evidenceLink = {
    label: `Conciliación del ${period.to}`,
    href: `/empresas/${org}/conciliacion?fecha=${period.to}`,
  };
  const add = (
    label: string,
    value: string,
    state: Indicator["state"] = "confirmed",
    href?: string,
  ) =>
    answer.indicators.push({ label, value, state, ...(href ? { href } : {}) });

  if (plan.intent === "closure") {
    if (period.from !== period.to)
      return clarify(
        "Para explicar un cierre necesito una sola jornada. Indicá la fecha o pedí el último cierre.",
      );
    answer.sources.push(dayLink);
    const snapshot = await reads.closure(period.to);
    if (!snapshot) {
      answer.message =
        "La jornada consultada todavía no tiene una instantánea de cierre.";
      answer.missing.push("Cierre operativo de la jornada.");
    } else {
      const snapshotMoney = (minor: string) =>
        formatMoney(minor, snapshot.currency, snapshot.scale);
      answer.message =
        "Estas cifras provienen de la instantánea guardada para esa jornada.";
      add("Ventas al cierre", snapshotMoney(snapshot.metrics.sales_minor));
      add("Cobros al cierre", snapshotMoney(snapshot.metrics.collected_minor));
      add(
        "Saldo pendiente al cierre",
        snapshotMoney(snapshot.metrics.outstanding_minor),
        BigInt(snapshot.metrics.outstanding_minor) > 0n
          ? "pending"
          : "confirmed",
      );
      add(
        "Cobros por verificar al cierre",
        snapshot.metrics.unverified_count,
        BigInt(snapshot.metrics.unverified_count) > 0n
          ? "pending"
          : "confirmed",
      );
      if (snapshot.cash_counted_minor === null)
        answer.missing.push("Conteo de efectivo pendiente en la instantánea.");
      else add("Efectivo contado", snapshotMoney(snapshot.cash_counted_minor));
    }
    return { answer, status: "answered" };
  }

  if (plan.intent === "products") {
    const products = await reads.products(period);
    answer.message = products.length
      ? "Productos con más unidades vendidas en el período. Se muestra su nombre actual de catálogo."
      : "No encontré líneas de venta registradas en el período.";
    if (!products.length)
      answer.missing.push("Líneas de venta para elaborar el ranking.");
    for (const product of products)
      add(
        product.name,
        `${product.units} unidades`,
        "confirmed",
        `/empresas/${org}/catalogo/${product.product_id}`,
      );
    return { answer, status: "answered" };
  }

  if (plan.intent === "compare") {
    const second =
      plan.comparison &&
      resolvePeriod(plan.comparison, question, input, today, latest);
    if (
      !second ||
      Date.parse(period.to) - Date.parse(period.from) !==
        Date.parse(second.to) - Date.parse(second.from) ||
      (period.from <= second.to && second.from <= period.to)
    ) {
      return clarify(
        "Elegí dos jornadas distintas o dos períodos sin superposición y de igual duración.",
      );
    }
    answer.periods.push(second);
    answer.sources.push({
      ...dashboardLink(org, second),
      label: "Dashboard del segundo período",
    });
    const [left, right] = await Promise.all([
      reads.totals(period),
      reads.totals(second),
    ]);
    const labels = [period, second].map(({ from, to }) =>
      from === to ? from : `${from} al ${to}`,
    );
    const firstCovered = coverage(answer, left, period);
    const secondCovered = coverage(answer, right, second);
    add(
      `Ventas · ${labels[0]}`,
      firstCovered ? money(left.sales_minor) : "Sin registros",
      firstCovered ? "confirmed" : "unavailable",
    );
    add(
      `Ventas · ${labels[1]}`,
      secondCovered ? money(right.sales_minor) : "Sin registros",
      secondCovered ? "confirmed" : "unavailable",
    );
    answer.message = "Comparación de importes registrados en los dos períodos.";
    if (!firstCovered || !secondCovered || answer.warnings.length)
      answer.warnings.push(
        "La cobertura incompleta impide inferir una tendencia.",
      );
    return { answer, status: "answered" };
  }

  const methods = mentionedPaymentMethods(question);
  const method = methods[0];
  if (
    (plan.intent === "collections" ||
      plan.intent === "sales_and_collections") &&
    (methods.length > 1 || (plan.method && plan.method !== method))
  ) {
    return clarify(
      "Indicá un medio por consulta o pedí el total de todos los cobros.",
    );
  }
  const stats = await reads.totals(period);
  const covered = coverage(answer, stats, period);

  const addCount = (label: string, count: string) =>
    add(
      label,
      covered ? count : "Sin registros",
      !covered ? "unavailable" : count === "0" ? "confirmed" : "pending",
    );
  switch (plan.intent) {
    case "sales":
    case "collections":
    case "sales_and_collections":
      answer.message = covered
        ? "Estas son las operaciones registradas en el período consultado."
        : "No encontré operaciones registradas en el período consultado.";
      if (plan.intent !== "collections")
        add(
          "Ventas registradas",
          covered ? money(stats.sales_minor) : "Sin registros",
          covered ? "confirmed" : "unavailable",
        );
      if (plan.intent !== "sales") {
        const total = method
          ? (stats.methods.find((one) => one.method === method)?.amount_minor ??
            "0")
          : stats.collected_minor;
        add(
          method ? `Cobros por ${paymentLabels[method]}` : "Cobros registrados",
          covered ? money(total) : "Sin registros",
          covered ? "confirmed" : "unavailable",
        );
      }
      answer.sources.push(dayLink);
      break;
    case "balance":
      answer.message =
        "El saldo al corte incluye ventas anteriores y descuenta los cobros hasta la fecha final.";
      add(
        "Saldo pendiente al corte",
        covered || stats.outstanding_minor !== "0"
          ? money(stats.outstanding_minor)
          : "Sin registros",
        stats.outstanding_minor !== "0"
          ? "pending"
          : covered
            ? "confirmed"
            : "unavailable",
      );
      break;
    case "evidence": {
      const noEvidence =
        BigInt(stats.payment_count) - BigInt(stats.evidence_count);
      answer.message =
        stats.payment_count === "0"
          ? "No encontré cobros registrados para revisar en el período."
          : "Los estados documentales reflejan la revisión actual de los cobros del período.";
      addCount("Cobros sin evidencia", noEvidence.toString());
      addCount("Cobros por verificar", stats.unverified_count);
      answer.sources.push(evidenceLink);
      break;
    }
    case "differences": {
      const differences = await reads.differences(period);
      answer.message =
        "Estas son las diferencias documentadas. El conteo se compara con los cobros en efectivo modelados.";
      addCount("Discrepancias documentales", stats.discrepancy_count);
      add(
        "Cierres con diferencias de conteo",
        stats.closed_days === "0"
          ? "Sin cierres"
          : differences.cashDifferences.toString(),
        stats.closed_days === "0"
          ? "unavailable"
          : differences.cashDifferences
            ? "pending"
            : "confirmed",
      );
      if (differences.missingCounts)
        answer.missing.push(
          `Cierres sin conteo: ${differences.missingCounts}.`,
        );
      answer.warnings.push(
        "Las diferencias de conteo requieren revisión de caja.",
      );
      answer.sources.push(evidenceLink, dayLink);
      break;
    }
    case "priorities":
      answer.recommendations = priorities(stats);
      answer.message = answer.recommendations.length
        ? "Estas prioridades se derivan de los pendientes registrados para el período y su saldo al corte."
        : "No encontré pendientes que ameriten una recomendación con los datos disponibles.";
      addCount("Cobros por verificar", stats.unverified_count);
      addCount("Discrepancias documentales", stats.discrepancy_count);
      addCount("Jornadas con cierre pendiente", stats.pending_days);
      if (stats.outstanding_minor !== "0")
        add(
          "Saldo pendiente al corte",
          money(stats.outstanding_minor),
          "pending",
        );
      answer.sources.push(evidenceLink, {
        label: "Jornadas",
        href: `/empresas/${org}/jornadas`,
      });
      break;
  }
  return { answer, status: "answered" };
}
