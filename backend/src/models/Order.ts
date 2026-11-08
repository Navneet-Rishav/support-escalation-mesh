import { Schema, model, type InferSchemaType } from 'mongoose';

export const ORDER_STATUSES = ['placed', 'shipped', 'delivered', 'cancelled', 'returned'] as const;

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true, uppercase: true },
    customerEmail: { type: String, required: true, lowercase: true, index: true },
    items: { type: String, required: true },
    amountInr: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    placedAt: { type: Date, required: true },
    deliveredAt: { type: Date },
  },
  { timestamps: true },
);

export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const Order = model('Order', orderSchema);
