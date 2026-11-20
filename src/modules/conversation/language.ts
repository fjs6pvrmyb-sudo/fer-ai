import { normalize } from "@/modules/intelligence/plan";
import { decimalAmount, parseAmount } from "@/modules/shared/money";

const small = [
  "cero",
  "uno",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciseis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
  "veinte",
  "veintiuno",
  "veintidos",
  "veintitres",
  "veinticuatro",
  "veinticinco",
  "veintiseis",
  "veintisiete",
  "veintiocho",
  "veintinueve",
];
const values = new Map(small.map((word, index) => [word, BigInt(index)]));
for (const one of ["un", "una"]) values.set(one, 1n);
for (const twentyOne of ["veintiun", "veintiuna"]) values.set(twentyOne, 21n);
const tens = [
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const hundreds = [
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];
const numberWords = [
  ...values.keys(),
  ...tens,
  ...hundreds,
  "cien",
  "mil",
].sort((a, b) => b.length - a.length);
const words = `(?:${numberWords.join("|")})(?:\\s+(?:y\\s+)?(?:${numberWords.join("|")}))*`;
const currencyMark = "(?:₡|crc|usd|eur|\\$|€)";
export const amountExpression = `(?:${currencyMark}\\s*)?(?:[0-9]+(?:[.,][0-9]+)*|${words})(?:\\s+(?:col[oó]n(?:es)?|d[oó]lares?|euros?|crc|usd|eur))?`;

function underThousand(text: string): bigint | null {
  if (values.has(text)) return values.get(text)!;
  if (text === "cien") return 100n;
  const [first, ...rest] = text.split(" ");
  const hundred = hundreds.indexOf(first);
  if (hundred !== -1) {
    if (!rest.length)
      return first === "ciento" ? null : BigInt(hundred + 1) * 100n;
    if (hundreds.includes(rest[0]) || rest[0] === "cien") return null;
    const remainder = underThousand(rest.join(" "));
    return remainder !== null && remainder > 0n
      ? BigInt(hundred + 1) * 100n + remainder
      : null;
  }
  const ten = tens.indexOf(first);
  if (ten === -1) return null;
  if (!rest.length) return BigInt(ten + 3) * 10n;
  const unit =
    rest.length === 2 && rest[0] === "y" ? values.get(rest[1]) : undefined;
  return unit && unit < 10n ? BigInt(ten + 3) * 10n + unit : null;
}

function numberWordsValue(input: string): bigint | null {
  const parts = input.split(/\bmil\b/).map((part) => part.trim());
  if (parts.length === 1) return underThousand(input);
  if (parts.length !== 2) return null;
  const thousands = parts[0] ? underThousand(parts[0]) : 1n;
  const rest = parts[1] ? underThousand(parts[1]) : 0n;
  return thousands && rest !== null ? thousands * 1000n + rest : null;
}

export function quantityValue(raw: string | null) {
  if (raw === null) return null;
  const text = normalize(raw);
  const value = /^\d{1,4}$/.test(text) ? BigInt(text) : numberWordsValue(text);
  return value !== null && value >= 1n && value <= 1000n ? Number(value) : null;
}

const currencies = [
  [/₡|\b(?:crc|colon|colones)\b/, "CRC"],
  [/\$|\b(?:usd|dolar|dolares)\b/, "USD"],
  [/€|\b(?:eur|euro|euros)\b/, "EUR"],
] as const;

export function mentionsOtherCurrency(raw: string, currency: string) {
  const text = normalize(raw);
  return currencies.some(
    ([pattern, code]) => pattern.test(text) && currency !== code,
  );
}

export function literalAmount(
  raw: string,
  currency: string,
  scale: number,
): string {
  let text = normalize(raw).replace(/\s+/g, " ");
  if (mentionsOtherCurrency(text, currency))
    throw new RangeError(
      "La moneda declarada difiere de la moneda de la empresa.",
    );
  for (const [pattern] of currencies)
    text = text.replace(new RegExp(pattern.source, "g"), "").trim();
  if (/^-/.test(text)) throw new RangeError("El importe debe ser positivo.");
  if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(text))
    text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    if (scale >= 3 && text.split(".").length === 2)
      throw new RangeError("Aclará el importe sin separador de miles.");
    text = text.replace(/\./g, "");
  } else if (/^\d+,\d{3}$/.test(text) && scale < 3) {
    throw new RangeError("Aclará el importe sin separador de miles.");
  } else if (!/^\d+(?:[.,]\d+)?$/.test(text)) {
    const words = numberWordsValue(text);
    if (words === null)
      throw new RangeError(
        "Aclará el importe en números sin separador de miles.",
      );
    text = words.toString();
  }
  return parseAmount(text, scale).toString();
}

export const amountInEditor = (raw: string, currency: string, scale: number) =>
  decimalAmount(literalAmount(raw, currency, scale), scale);

export const isReadQuestion = (text: string) => {
  const value = normalize(text);
  return (
    /^(?:fer[, ]+)?[¿?]?(?:cuanto[s]?|cual(?:es)?|como|que|tenemos|mostrame|compara)\b/.test(
      value,
    ) &&
    !/\b(?:registra|registrame|agrega|agregale|anula|elimina|cancela)\b/.test(
      value,
    )
  );
};

export const isCancellation = (text: string) =>
  /^(?:fer,? )?(?:cancela|cancelar|descarta|descartar)\b/.test(normalize(text));

export const unsafeInstruction = (text: string) =>
  /(?:^|[\s:₡$€])[-−]\s*(?:₡|\$|€)?\s*\d|\b(?:ignora|omite|desactiva|elude|salta)\b.{0,75}\b(?:instrucciones|confirmacion|seguridad|permisos)\b|\bsin (?:pedir |mi )?confirmacion\b|\b(?:otra empresa|otra organizacion|todas las empresas)\b|\b(?:descuento|descuentos|vuelto|anula|anular|elimina|eliminar|factura)\b/.test(
    normalize(text),
  );

export function isLiteral(question: string, literal: string) {
  const flatten = (value: string) =>
    normalize(value)
      .replace(/[^a-z0-9.,₡$€]+/g, " ")
      .replace(/[.,](?!\d)/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const needle = flatten(literal);
  return Boolean(needle) && ` ${flatten(question)} `.includes(` ${needle} `);
}
