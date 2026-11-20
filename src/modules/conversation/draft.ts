import type { Product } from "@/modules/catalog/data";
import { normalize } from "@/modules/intelligence/plan";
import type { Organization } from "@/modules/organizations/access";
import {
  normalizePayments,
  quoteSale,
  saleDraft,
} from "@/modules/sales/contract";
import { paymentMethods } from "@/modules/payments/methods";
import { formatMoney } from "@/modules/shared/money";
import {
  documentSchema,
  emptyDocument,
  type DraftDocument,
  type DraftRecord,
  type DraftView,
  type Extraction,
} from "./contract";
import {
  amountInEditor,
  isLiteral,
  literalAmount,
  quantityValue,
} from "./language";

type MoneyContext = Pick<
  Organization,
  "currency" | "scale" | "conversational_payment_methods"
>;

function productName(name: string) {
  return normalize(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word === "panes") return "pan";
      if (word === "cafes") return "cafe";
      if (word === "rollos") return "rollo";
      if (word.endsWith("es") && word.length > 5 && /(?:[lrndz])es$/.test(word))
        return word.slice(0, -2);
      if (/[aeiou]s$/.test(word) && word.length > 3) return word.slice(0, -1);
      return word;
    })
    .join(" ");
}

export function productCandidates(name: string, catalog: Product[]) {
  if (!name.trim()) return [];
  const key = productName(name);
  const active = catalog.filter((p) => p.active);
  const exact = active.filter((p) => productName(p.name) === key);
  if (exact.length) return exact;
  if (key.length < 3) return [];
  return active
    .filter((p) => productName(p.name).startsWith(key + " "))
    .slice(0, 6);
}

export function extractedLiteralsValid(
  question: string,
  extracted: Extraction,
) {
  const literals = [
    ...extracted.items.flatMap((item) => [item.name, item.quantity, item.unit]),
    ...extracted.payments.map((payment) => payment.amount),
    extracted.total,
    extracted.balance,
    extracted.quantityEdit,
    extracted.amountEdit,
    extracted.observation,
  ];
  const terms = {
    cash: /\befectivo\b/,
    transfer: /\b(?:sinpe|transferencia)\b/,
    card: /\b(?:tarjeta|datafono)\b/,
  };
  return (
    literals.every(
      (literal) => literal === null || isLiteral(question, literal),
    ) &&
    extracted.payments.every(
      ({ method }) =>
        method === null || terms[method].test(normalize(question)),
    )
  );
}

export function applyExtraction(
  extracted: Extraction,
  previous: DraftDocument | null,
  context: MoneyContext,
  catalog: Product[],
): DraftDocument {
  const editing =
    extracted.intent === "edit" ||
    extracted.intent === "clarify" ||
    extracted.append;
  const draft =
    editing && previous ? structuredClone(previous) : emptyDocument();
  const issues: string[] = editing && previous ? [...previous.issues] : [];
  if (extracted.unclear)
    issues.push(
      "Confirmá qué representa el importe indicado y corregí los campos del borrador.",
    );
  const amount = (value: string | null, minor: boolean) => {
    if (value === null) return null;
    try {
      return minor
        ? literalAmount(value, context.currency, context.scale)
        : amountInEditor(value, context.currency, context.scale);
    } catch (error) {
      issues.push(
        error instanceof RangeError ? error.message : "Aclará el importe.",
      );
      return null;
    }
  };

  const changedItems =
    extracted.items.length > 0 || extracted.quantityEdit !== null;
  if (changedItems) {
    draft.total = null;
    draft.balance = null;
  }
  if (extracted.items.length) {
    const items = extracted.items.map((item) => {
      const candidates = productCandidates(item.name, catalog);
      const exact =
        candidates.length === 1 &&
        productName(candidates[0].name) === productName(item.name);
      return {
        name: item.name,
        productId: exact ? candidates[0].id : null,
        quantity: quantityValue(item.quantity),
        reportedUnit: amount(item.unit, true),
      };
    });
    if (extracted.append) draft.items.push(...items);
    else if (!editing) draft.items = items;
    else {
      for (const [position, item] of items.entries()) {
        const index = draft.items.findIndex(
          (previous) =>
            productName(previous.name) === productName(item.name) ||
            (item.productId !== null && item.productId === previous.productId),
        );
        const singleUnresolved =
          draft.items.length === 1 &&
          !draft.items[0].productId &&
          items.length === 1;
        if (index === -1 && !singleUnresolved) {
          issues.push(
            "Indicá qué línea querés sustituir o editá el producto en el formulario.",
          );
          continue;
        }
        const target = index === -1 ? 0 : index;
        const previous = draft.items[target];
        draft.items[target] = {
          ...item,
          productId: item.productId ?? previous.productId,
          quantity:
            extracted.items[position].quantity === null
              ? previous.quantity
              : item.quantity,
          reportedUnit:
            extracted.items[position].unit === null &&
            item.productId !== null &&
            item.productId === previous.productId
              ? previous.reportedUnit
              : item.reportedUnit,
        };
      }
    }
  }
  if (extracted.quantityEdit !== null) {
    if (draft.items.length === 1)
      draft.items[0].quantity = quantityValue(extracted.quantityEdit);
    else issues.push("Indicá el producto cuya cantidad querés corregir.");
  }
  if (extracted.payments.length) {
    const payments = extracted.payments.map(({ method, amount: raw }) => ({
      method,
      amount: amount(raw, false),
    }));
    if (editing) {
      for (const payment of payments) {
        const sameMethod = draft.payments.findIndex(
          ({ method }) => method === payment.method,
        );
        if (sameMethod === -1) draft.payments.push(payment);
        else draft.payments[sameMethod] = payment;
      }
    } else draft.payments = payments;
    draft.balance = null;
  }
  if (extracted.amountEdit !== null) {
    draft.balance = null;
    if (draft.payments.length === 1)
      draft.payments[0].amount = amount(extracted.amountEdit, false);
    else {
      const pending = draft.payments.filter(
        (payment) => payment.amount === null,
      );
      if (pending.length === 1)
        pending[0].amount = amount(extracted.amountEdit, false);
      else
        issues.push("Indicá el medio del pago cuyo importe querés corregir.");
    }
  }
  if (extracted.total !== null) draft.total = amount(extracted.total, true);
  if (extracted.balance !== null)
    draft.balance = amount(extracted.balance, true);
  if (extracted.observation !== null) draft.observation = extracted.observation;
  if (draft.items.length > 20 || draft.payments.length > 10) {
    const allowed = previous ? structuredClone(previous) : emptyDocument();
    allowed.issues = ["El borrador admite hasta 20 líneas y 10 pagos."];
    return allowed;
  }
  draft.issues = [...new Set(issues)].slice(0, 12);
  return draft;
}

export function previewDraft(
  id: string,
  document: DraftDocument,
  catalog: Product[],
  context: MoneyContext,
) {
  const problems = [...document.issues];
  const candidates: string[][] = [];
  const lines = [];
  const prices = [];
  const payments = [];
  const allowedMethods =
    context.conversational_payment_methods ?? paymentMethods;
  const display = (minor: string | bigint) =>
    formatMoney(minor, context.currency, context.scale);

  for (const [index, line] of document.items.entries()) {
    const product = catalog.find(
      (item) => item.id === line.productId && item.active,
    );
    const options = productCandidates(line.name, catalog);
    candidates.push(options.map(({ id }) => id));
    if (!product)
      problems.push(
        options.length
          ? `Elegí el producto para «${line.name}».`
          : `La línea ${index + 1} no tiene un producto disponible en esta empresa.`,
      );
    if (line.quantity === null)
      problems.push(
        `Indicá una cantidad entera entre 1 y 1000 en la línea ${index + 1}.`,
      );
    if (product && line.quantity !== null) {
      lines.push({
        product_id: product.id,
        price_id: product.price_id,
        quantity: line.quantity,
      });
      prices.push({ unit: product.amount_minor, quantity: line.quantity });
      if (
        line.reportedUnit !== null &&
        line.reportedUnit !== product.amount_minor
      ) {
        problems.push(
          `El precio unitario declarado para ${product.name} difiere del vigente (${display(product.amount_minor)}).`,
        );
      }
    }
  }
  for (const [index, payment] of document.payments.entries()) {
    if (!payment.method || !payment.amount)
      problems.push(`Completá el medio y el importe del pago ${index + 1}.`);
    else if (!allowedMethods.includes(payment.method))
      problems.push(
        `El medio de pago de la línea ${index + 1} no está disponible para esta empresa.`,
      );
    else payments.push({ method: payment.method, amount: payment.amount });
  }
  if (!document.items.length) problems.push("Agregá al menos un producto.");
  const sale = saleDraft.safeParse({ request: id, lines, payments });
  if (lines.length && !sale.success)
    problems.push("Usá una sola línea por producto y revisá los importes.");

  let quote: DraftView["quote"] = null;
  let review: {
    lines: typeof lines;
    payments: ReturnType<typeof normalizePayments>;
  } | null = null;
  if (
    sale.success &&
    lines.length === document.items.length &&
    payments.length === document.payments.length
  ) {
    try {
      const normalized = normalizePayments(sale.data.payments, context.scale);
      const totals = quoteSale(prices, normalized);
      quote = {
        total: totals.total.toString(),
        paid: totals.paid.toString(),
        balance: totals.balance.toString(),
      };
      if (document.total !== null && document.total !== quote.total)
        problems.push(
          "El total declarado difiere del total calculado con el catálogo.",
        );
      if (document.balance !== null && document.balance !== quote.balance)
        problems.push("El saldo declarado difiere del saldo calculado.");
      if (!problems.length)
        review = { lines: sale.data.lines, payments: normalized };
    } catch (error) {
      problems.push(
        error instanceof RangeError
          ? error.message
          : "Revisá los importes de la operación.",
      );
    }
  }
  return { quote, problems: [...new Set(problems)], candidates, review };
}

export function draftView(
  record: DraftRecord,
  catalog: Product[],
  context: MoneyContext,
): DraftView {
  const key = {
    id: record.id,
    revision: record.revision,
    status: record.status,
    expiresAt: record.expires_at,
    saleId: record.sale_id,
  };
  if (record.status === "confirmed" || record.status === "cancelled")
    return {
      ...key,
      document: null,
      quote: null,
      problems: [],
      candidates: [],
    };
  const document = documentSchema.parse(record.document);
  const { quote, problems, candidates } = previewDraft(
    record.id,
    document,
    catalog,
    context,
  );
  return { ...key, document, quote, problems, candidates };
}
