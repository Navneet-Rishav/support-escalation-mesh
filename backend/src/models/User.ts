import { Schema, model, type InferSchemaType } from 'mongoose';

export const ROLES = ['agent', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // bcrypt hash; the plain password is never stored. `select: false` keeps it out of normal queries.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'agent', required: true },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
