import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { DEMO_USERS } from '../routes/auth.js';

/**
 * Creates the demo users (no usable password; they log in via /api/auth/demo) and, if
 * ADMIN_EMAIL + ADMIN_PASSWORD are set, a real admin account.
 */
export async function seedUsers(): Promise<void> {
  for (const d of Object.values(DEMO_USERS)) {
    const exists = await User.exists({ email: d.email });
    if (!exists) {
      await User.create({ ...d, isDemo: true, passwordHash: await bcrypt.hash(crypto.randomUUID(), 10) });
    }
  }
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await User.updateOne(
      { email: ADMIN_EMAIL.toLowerCase() },
      { $set: { name: 'Admin', role: 'admin', isDemo: false, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10) } },
      { upsert: true },
    );
  }
}
