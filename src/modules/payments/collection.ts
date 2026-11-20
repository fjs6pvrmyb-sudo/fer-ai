import { z } from "zod";
import { paymentMethods } from "./methods";
import type { Role } from "@/modules/organizations/access";

export const mayCollect = (role: Role) =>
  role === "admin" || role === "manager";

export const collectionInput = z.object({
  request: z.uuid(),
  method: z.enum(paymentMethods),
  amount: z.string().trim().min(1).max(30),
});

export const collectionReceipt = z.object({
  payment_id: z.uuid(),
  sale_id: z.uuid(),
  day: z.iso.date(),
  amount_minor: z.string().regex(/^\d+$/),
  balance_minor: z.string().regex(/^\d+$/),
  replayed: z.boolean(),
});

export type CollectionState =
  | { receipt: z.infer<typeof collectionReceipt> }
  | { error: string; retry?: boolean };
