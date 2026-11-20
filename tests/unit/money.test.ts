import { describe, expect, it } from "vitest";
import {
  decimalAmount,
  formatMoney,
  MAX_MINOR,
  parseAmount,
} from "@/modules/shared/money";

describe("importes exactos", () => {
  it("lee CRC y escalas distintas", () => {
    expect(parseAmount("5000,25", 2)).toBe(500025n);
    expect(parseAmount("12", 0)).toBe(12n);
    expect(parseAmount("12.001", 3)).toBe(12001n);
    expect(decimalAmount(-1n, 2)).toBe("-0.01");
  });
  it("preserva todos los dígitos cerca del límite de bigint", () => {
    expect(parseAmount("92233720368547758.07", 2)).toBe(MAX_MINOR);
    expect(formatMoney(MAX_MINOR, "CRC", 2).replace(/\D/g, "")).toBe(
      MAX_MINOR.toString(),
    );
  });
  it.each(["", "-1", "1e3", "1 000", "1.001", "92233720368547758.08"])(
    "rechaza %s",
    (input) => expect(() => parseAmount(input, 2)).toThrow(RangeError),
  );
});
