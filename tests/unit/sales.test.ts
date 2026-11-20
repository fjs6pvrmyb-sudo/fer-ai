import { describe, expect, it } from "vitest";
import { normalizePayments, quoteSale } from "@/modules/sales/contract";

describe("cotización de venta", () => {
  const lines = [{ unit: "250000", quantity: 2 }];
  it("calcula un pago parcial dividido con un saldo exacto", () => {
    const payments = normalizePayments(
      [
        { method: "cash", amount: "1000,50" },
        { method: "card", amount: "999.50" },
      ],
      2,
    );
    expect(quoteSale(lines, payments)).toEqual({
      total: 500000n,
      paid: 200000n,
      balance: 300000n,
    });
  });
  it("calcula venta pendiente y pagada", () => {
    expect(quoteSale(lines, []).balance).toBe(500000n);
    expect(quoteSale(lines, [{ amount_minor: "500000" }]).balance).toBe(0n);
  });
  it("rechaza sobrepago, importes negativos y cantidades fraccionarias", () => {
    expect(() => quoteSale(lines, [{ amount_minor: "500001" }])).toThrow(
      /supera/,
    );
    expect(() => quoteSale(lines, [{ amount_minor: "-1" }])).toThrow(
      /importes/,
    );
    expect(() => quoteSale([{ unit: "1", quantity: 1.5 }], [])).toThrow(
      /cantidades/,
    );
    expect(() =>
      normalizePayments([{ method: "cash", amount: "0" }], 2),
    ).toThrow(/mayor/);
  });
});
