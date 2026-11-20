import { z } from "zod";

const fictionalEmail = z
  .email()
  .max(160)
  .regex(/\.example$/);
const identification = z.discriminatedUnion("type", [
  z.object({ type: z.literal("01"), number: z.string().regex(/^\d{9}$/) }),
  z.object({ type: z.literal("02"), number: z.string().regex(/^\d{10}$/) }),
]);

export const fiscalReceiver = z.strictObject({
  name: z.string().trim().min(3).max(100),
  identification,
  email: fictionalEmail,
  activity: z.string().regex(/^\d{6}$/),
});

const request = {
  organizationId: z.uuid(),
  saleId: z.uuid(),
  transfers: z.record(z.uuid(), z.enum(["bank_transfer", "sinpe_movil"])),
};

export const fiscalRequest = z.discriminatedUnion("kind", [
  z.strictObject({
    ...request,
    kind: z.literal("01"),
    receiver: fiscalReceiver,
  }),
  z.strictObject({ ...request, kind: z.literal("04"), receiver: z.null() }),
]);

const minor = z.string().regex(/^[1-9]\d{0,18}$/);
const decimal = z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,5})?$/);

export const reservation = z.object({
  id: z.uuid(),
  kind: z.enum(["01", "04"]),
  environment: z.literal("offline"),
  issued_at: z.iso.datetime({ offset: true }),
  branch: z.string().regex(/^\d{3}$/),
  terminal: z.string().regex(/^\d{5}$/),
  sequence: z.number().int().min(1).max(9999999999),
  security_code: z.string().regex(/^\d{8}$/),
  snapshot: z.strictObject({
    version: z.literal("feria-6a-v1"),
    priceIncludesTax: z.literal(true),
    taxTreatment: z.literal("iva13"),
    supplierId: z.string().regex(/^\d{9,10}$/),
    activity: z.string().regex(/^\d{6}$/),
    grossMinor: minor,
    receiver: fiscalReceiver.nullable(),
    issuer: z
      .strictObject({
        name: z.string().min(5).max(100),
        type: z.enum(["01", "02"]),
        number: z.string().regex(/^\d{9,10}$/),
        email: fictionalEmail,
        province: z.string().regex(/^[1-7]$/),
        canton: z.string().regex(/^\d{2}$/),
        district: z.string().regex(/^\d{2}$/),
        address: z.string().min(5).max(250),
      })
      .refine(
        ({ type, number }) =>
          identification.safeParse({ type, number }).success,
      ),
    lines: z
      .array(
        z
          .strictObject({
            name: z.string().min(1).max(100),
            quantity: z.string().regex(/^([1-9]\d{0,2}|1000)$/),
            cabys: z.string().regex(/^\d{13}$/),
            cabysSource: z.literal("tests/fixtures/fiscal-offline.ts"),
            cabysVersion: z.literal("feria-6a-v1"),
            unit: z.enum(["Unid", "Sp"]),
            service: z.boolean(),
            netUnit: decimal.refine((amount) => /[1-9]/.test(amount)),
            grossMinor: minor,
          })
          .refine(({ cabys, service }) => /^[5-9]/.test(cabys) === service),
      )
      .min(1)
      .max(1000),
    payments: z
      .array(z.strictObject({ code: z.enum(["01", "02", "04", "06"]), minor }))
      .min(1)
      .max(4),
  }),
});

export type FiscalReservation = z.infer<typeof reservation>;
