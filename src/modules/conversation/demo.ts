import { normalize } from "@/modules/intelligence/plan";
import type { PaymentMethod } from "@/modules/payments/methods";
import { emptyExtraction, type Extraction } from "./contract";
import { amountExpression, isReadQuestion, quantityValue } from "./language";

const methodPatterns: Record<PaymentMethod, string> = {
  transfer: "sinpe|transferencia",
  cash: "efectivo",
  card: "tarjeta|datafono",
};
const amount = `(?<amount>${amountExpression})`;
const leadingQuantity = new RegExp(`^(${amountExpression})\\s+(.+)$`);

export function demoSaleExtraction(
  question: string,
  existing: boolean,
): Extraction {
  const text = normalize(question);
  if (isReadQuestion(text)) return emptyExtraction("read");
  if (/^(?:fer,? )?(?:cancela|cancelar|descarta)\b/.test(text))
    return emptyExtraction(existing ? "cancel" : "unsupported");
  const sale = text.match(
    /\b(?:vendi(?:mos)?|registra(?:me)?(?: esta| una| la)? venta(?: de)?)\s+(.+)/,
  );
  const append = text.match(/\b(?:agrega(?:le|me)?|anadi(?:le)?)\s+(.+)/);
  const correction = text.match(new RegExp(`\\b(?:eran|son)\\s+${amount}`));
  const paid =
    /\b(?:paga(?:ron|do)|pago|cobre|cobramos|cobro|recibi|dieron)\b/.test(text);
  let result = emptyExtraction(
    sale
      ? "create"
      : existing && (append || correction || paid)
        ? "edit"
        : "unsupported",
  );
  if (result.intent === "unsupported") return result;
  result.append = Boolean(append);
  result.quantityEdit = correction?.groups?.amount ?? null;
  if (existing && correction?.groups?.amount) {
    const tail = text
      .slice((correction.index ?? 0) + correction[0].length)
      .trim()
      .replace(/[.!?]+$/, "");
    if (tail && !/^(?:unidades?|productos?)$/.test(tail)) {
      result.items.push({
        name: tail,
        quantity: correction.groups.amount,
        unit: null,
      });
      result.quantityEdit = null;
    }
  }

  const fragment = (sale?.[1] ?? append?.[1] ?? "")
    .split(
      /\.(?=\s|$)|[;!]|[, ]+(?:y )?(?:me )?paga(?:ron|do)\b|[, ]+con (?:un )?pago\b/,
    )[0]
    .trim();
  for (const raw of fragment
    ? fragment.split(
        /,\s+(?!\d)|\s+y\s+(?=(?:un[ao]?|dos|tres|cuatro|cinco|\d+)\s)/,
      )
    : []) {
    const text = raw.trim();
    const leading = text.match(leadingQuantity);
    const qty =
      leading && quantityValue(leading[1]) !== null
        ? leading[1]
        : (leading?.[1] ?? null);
    const nameAndPrice = (leading?.[2] ?? text).replace(/[.!?]+$/, "").trim();
    const priced = nameAndPrice.match(
      new RegExp(
        `^(.+?)\\s+(?:de|a)\\s+${amount}(?:\\s+(cada uno|cada una|por unidad))?$`,
      ),
    );
    const useUnit = Boolean(priced && (quantityValue(qty) === 1 || priced[3]));
    result.items.push({
      name: priced?.[1] ?? nameAndPrice,
      quantity: qty,
      unit: useUnit ? (priced?.groups?.amount ?? null) : null,
    });
    if (priced && !useUnit) result.unclear = true;
  }

  if (paid || /\b(?:efectivo|sinpe|tarjeta)\b/.test(text)) {
    for (const [method, pattern] of Object.entries(methodPatterns) as [
      PaymentMethod,
      string,
    ][]) {
      if (!new RegExp(`\\b(?:${pattern})\\b`).test(text)) continue;
      const match = text.match(
        new RegExp(
          `${amount}\\s+(?:en|por|con|mediante)\\s+(?:la |el )?(?:${pattern})\\b`,
        ),
      );
      result.payments.push({ method, amount: match?.groups?.amount ?? null });
    }
    if (paid && !result.payments.length) {
      const match = text.match(
        new RegExp(`\\b(?:pagaron|cobre|cobramos|recibi|dieron)\\s+${amount}`),
      );
      if (existing && !sale) result.amountEdit = match?.groups?.amount ?? null;
      else
        result.payments.push({
          method: null,
          amount: match?.groups?.amount ?? null,
        });
    }
  }
  result.total =
    text.match(new RegExp(`\\btotal(?: de| fue de)?\\s+${amount}`))?.groups
      ?.amount ?? null;
  result.balance =
    text.match(new RegExp(`${amount}\\s+pendientes?\\b`))?.groups?.amount ??
    null;
  result.observation =
    text.match(/\bobservacion:?\s+([^.!?]{1,120})/)?.[1] ?? null;
  if (
    result.intent === "edit" &&
    !result.items.length &&
    !result.payments.length &&
    !result.quantityEdit &&
    !result.amountEdit
  )
    result = { ...result, intent: "clarify" };
  return result;
}
