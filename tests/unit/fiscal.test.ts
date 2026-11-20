import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fiscalRequest } from "../../src/modules/fiscal/contract";
import { createOfflineFiscalService } from "../../src/modules/fiscal/offline";
import { renderFiscalOffline } from "../../src/modules/fiscal/render";
import { fiscalFixture, syntheticIssuers } from "../fixtures/fiscal-offline";

const issuer = syntheticIssuers[0];
const documentId = "30000000-0000-4000-8000-000000000001";

function document() {
  return {
    id: documentId,
    kind: "01",
    issued_at: "2026-11-20T09:00:00-06:00",
    environment: "offline",
    branch: "001",
    terminal: "00001",
    sequence: 1,
    security_code: "01234567",
    snapshot: {
      version: "feria-6a-v1",
      priceIncludesTax: true,
      taxTreatment: "iva13",
      supplierId: issuer.identification_number,
      activity: "620100",
      grossMinor: fiscalFixture.grossMinor,
      issuer: {
        name: issuer.legal_name,
        type: issuer.identification_type,
        number: issuer.identification_number,
        email: issuer.email,
        province: issuer.province,
        canton: issuer.canton,
        district: issuer.district,
        address: issuer.address,
      },
      receiver: fiscalFixture.receiver,
      lines: [
        {
          name: "Servicio ficticio FER",
          quantity: "1",
          cabys: fiscalFixture.provenance.code,
          cabysSource: fiscalFixture.provenance.source_ref,
          cabysVersion: fiscalFixture.provenance.source_version,
          unit: "Sp",
          service: true,
          netUnit: fiscalFixture.netUnit,
          grossMinor: fiscalFixture.grossMinor,
        },
      ],
      payments: [{ code: "04", minor: fiscalFixture.grossMinor }],
    },
  };
}

describe("contrato SDK Hacienda 0.13.0 y render offline", () => {
  const network = vi.fn(async () => {
    throw new Error("fiscal_network_forbidden");
  });
  beforeEach(() => {
    network.mockClear();
    vi.stubGlobal("fetch", network);
  });
  afterEach(() => {
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("usa los exports exactos publicados y valida el XML FE contra XSD", async () => {
    const out = await renderFiscalOffline(document());
    expect(out.totals).toEqual(fiscalFixture.totals);
    expect(out.xml).toContain("<FacturaElectronica ");
    expect(out.xml).toContain("<TipoMedioPago>04</TipoMedioPago>");
    expect(out.xml).toContain("<Receptor>");
    expect(out.consecutive).toBe("00100001010000000001");
    expect(out.clave).toMatch(/^506201126\d{41}$/);
  });

  it("usa el builder exacto de TE, omite receptor y conserva código SINPE 06", async () => {
    const draft = document();
    const out = await renderFiscalOffline({
      ...draft,
      kind: "04",
      snapshot: {
        ...draft.snapshot,
        receiver: null,
        payments: [{ code: "06", minor: fiscalFixture.grossMinor }],
      },
    });
    expect(out.totals).toEqual(fiscalFixture.totals);
    expect(out.xml).toContain("<TiqueteElectronico ");
    expect(out.xml).not.toContain("<Receptor>");
    expect(out.xml).toContain("<TipoMedioPago>06</TipoMedioPago>");
  });

  it("bloquea diferencias aun por un céntimo, aun con pagos y totales SDK correctos", async () => {
    const draft = document();
    draft.snapshot.lines[0].grossMinor = "112999";
    await expect(renderFiscalOffline(draft)).rejects.toThrow(
      "fiscal_amount_mismatch",
    );
  });

  it("conserva la base a cinco decimales y concilia exactamente contra céntimos", async () => {
    const draft = document();
    draft.snapshot.lines[0].netUnit = "4.42478";
    draft.snapshot.lines[0].grossMinor = "500";
    draft.snapshot.grossMinor = "500";
    draft.snapshot.payments[0].minor = "500";
    expect((await renderFiscalOffline(draft)).totals).toEqual({
      base: "4.42478",
      iva: "0.57522",
      total: "5.00000",
    });
  });

  it("rechaza IVA ausente y CABYS inválido o sin procedencia", async () => {
    const draft = document();
    await expect(
      renderFiscalOffline({
        ...draft,
        snapshot: { ...draft.snapshot, taxTreatment: null },
      }),
    ).rejects.toThrow();
    draft.snapshot.lines[0].cabys = "831";
    await expect(renderFiscalOffline(draft)).rejects.toThrow();
    draft.snapshot.lines[0].cabys = fiscalFixture.provenance.code;
    draft.snapshot.lines[0].cabysSource = "";
    await expect(renderFiscalOffline(draft)).rejects.toThrow();
  });

  it("rechaza entradas fuera de alcance y hogares Supabase remotos", () => {
    const request = {
      organizationId: documentId,
      saleId: documentId,
      transfers: {},
    };
    expect(
      fiscalRequest.safeParse({
        ...request,
        kind: "04",
        receiver: fiscalFixture.receiver,
      }).success,
    ).toBe(false);
    expect(
      fiscalRequest.safeParse({ ...request, kind: "01", receiver: null })
        .success,
    ).toBe(false);
    expect(
      fiscalRequest.safeParse({ ...request, kind: "03", receiver: null })
        .success,
    ).toBe(false);
    for (const url of [
      "https://application.example",
      "http://localhost/",
      "http://127.0.0.1@application.example",
    ]) {
      expect(() =>
        createOfflineFiscalService({
          url,
          publishableKey: "fake",
          workerKey: "fake",
        }),
      ).toThrow("fiscal_requires_loopback");
    }
  });
});
