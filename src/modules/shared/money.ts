export const MAX_MINOR = 9_223_372_036_854_775_807n;

export function parseAmount(input: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 6)
    throw new RangeError("Escala inválida");
  const match = /^([0-9]{1,19})(?:[.,]([0-9]{1,6}))?$/.exec(input.trim());
  if (!match)
    throw new RangeError("Ingresá un importe válido sin separador de miles");
  const fraction = match[2] ?? "";
  if (fraction.length > scale)
    throw new RangeError(`La moneda admite hasta ${scale} decimales`);
  const amount = BigInt(match[1] + fraction.padEnd(scale, "0"));
  if (amount > MAX_MINOR) throw new RangeError("Importe fuera de rango");
  return amount;
}

export function decimalAmount(minor: string | bigint, scale: number): string {
  const value = BigInt(minor);
  const digits = (value < 0n ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  const result = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
    : digits;
  return value < 0n ? `-${result}` : result;
}

export function formatMoney(
  minor: string | bigint,
  currency: string,
  scale: number,
): string {
  const decimal = decimalAmount(minor, scale);
  const [integer, fraction = ""] = decimal.split(".");
  const formatter = new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  const parts = formatter.formatToParts(BigInt(integer));
  if (decimal.startsWith("-") && BigInt(integer) === 0n) {
    return (
      "-" +
      parts
        .map((part) => (part.type === "fraction" ? fraction : part.value))
        .join("")
    );
  }
  return parts
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
