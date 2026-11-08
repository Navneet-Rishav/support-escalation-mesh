import { Schema, model, type InferSchemaType } from 'mongoose';

export const TIERS = ['standard', 'plus', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

/** Customers of "Bazaarly", the fictional Indian marketplace this support desk serves. */
const customerSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    tier: { type: String, enum: TIERS, default: 'standard' },
  },
  { timestamps: true },
);

export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export const Customer = model('Customer', customerSchema);
