import { z } from "zod";
import { paymentMethods } from "@/modules/payments/methods";

const method = z.enum(paymentMethods);
const field = z.string().max(120);
const literal = field.nullable();

// Only substrings of the user's message may populate these fields. No IDs or prices from a catalog.
export const extraction = z.strictObject({
  intent: z.enum([
    "create",
    "edit",
    "clarify",
    "cancel",
    "read",
    "unsupported",
  ]),
  items: z
    .array(z.strictObject({ name: field, quantity: literal, unit: literal }))
    .max(20),
  payments: z
    .array(z.strictObject({ method: method.nullable(), amount: literal }))
    .max(10),
  total: literal,
  balance: literal,
  quantityEdit: literal,
  amountEdit: literal,
  append: z.boolean(),
  observation: literal,
  unclear: z.boolean(),
});
export type Extraction = z.infer<typeof extraction>;

const minor = z
  .string()
  .regex(/^\d{1,19}$/)
  .nullable();
export const documentSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        name: field,
        productId: z.uuid().nullable(),
        quantity: z.number().int().min(1).max(1000).nullable(),
        reportedUnit: minor,
      }),
    )
    .max(20),
  payments: z
    .array(
      z.strictObject({
        method: method.nullable(),
        amount: z.string().max(30).nullable(),
      }),
    )
    .max(10),
  total: minor,
  balance: minor,
  observation: literal,
  issues: z.array(z.string().max(180)).max(12),
});
export type DraftDocument = z.infer<typeof documentSchema>;

export const draftKey = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
});
export type DraftKey = z.infer<typeof draftKey>;

export const draftRecord = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  expires_at: z.string(),
  status: z.enum(["editing", "review", "cancelled", "confirmed"]),
  document: z.unknown(),
  sale_id: z.uuid().nullable(),
});
export type DraftRecord = z.infer<typeof draftRecord>;

export type DraftView = DraftKey & {
  status: DraftRecord["status"];
  expiresAt: string;
  saleId: string | null;
  document: DraftDocument | null;
  quote: { total: string; paid: string; balance: string } | null;
  problems: string[];
  candidates: string[][];
};

export const emptyDocument = (): DraftDocument => ({
  items: [],
  payments: [],
  total: null,
  balance: null,
  observation: null,
  issues: [],
});

export const emptyExtraction = (intent: Extraction["intent"]): Extraction => ({
  intent,
  items: [],
  payments: [],
  total: null,
  balance: null,
  quantityEdit: null,
  amountEdit: null,
  observation: null,
  append: false,
  unclear: false,
});
