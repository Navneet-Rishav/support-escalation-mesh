import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { Ticket, type TicketStatus } from '../models/Ticket.js';
import { createTicket, type NewTicketInput } from './triage.js';

/** Fictional Bazaarly customers and orders used by the seed script and the demo account. */

export const DEMO_CUSTOMERS = [
  { name: 'Aarav Mehta', email: 'aarav@example.com', tier: 'standard' },
  { name: 'Priya Sharma', email: 'priya@example.com', tier: 'plus' },
  { name: 'Rohan Gupta', email: 'rohan@example.com', tier: 'standard' },
  { name: 'Kavya Reddy', email: 'kavya@example.com', tier: 'standard' },
  { name: 'Manish Agarwal', email: 'manish@example.com', tier: 'enterprise' },
  { name: 'Tanvi Joshi', email: 'tanvi@example.com', tier: 'standard' },
  { name: 'Vikram Singh', email: 'vikram@example.com', tier: 'standard' },
  { name: 'Meera Pillai', email: 'meera@example.com', tier: 'plus' },
] as const;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export const DEMO_ORDERS = [
  { orderId: 'BZ-20001', customerEmail: 'aarav@example.com', items: 'Bluetooth speaker', amountInr: 1299, status: 'delivered', placedAt: daysAgo(6), deliveredAt: daysAgo(2) },
  { orderId: 'BZ-20002', customerEmail: 'priya@example.com', items: 'Cotton kurta', amountInr: 899, status: 'placed', placedAt: daysAgo(1) },
  { orderId: 'BZ-20003', customerEmail: 'rohan@example.com', items: 'Office chair', amountInr: 7499, status: 'delivered', placedAt: daysAgo(10), deliveredAt: daysAgo(4) },
  { orderId: 'BZ-20004', customerEmail: 'tanvi@example.com', items: 'Headphones', amountInr: 1200, status: 'returned', placedAt: daysAgo(20), deliveredAt: daysAgo(15) },
  { orderId: 'BZ-20005', customerEmail: 'vikram@example.com', items: 'Running shoes', amountInr: 2199, status: 'shipped', placedAt: daysAgo(5) },
  { orderId: 'BZ-20006', customerEmail: 'meera@example.com', items: 'Laptop', amountInr: 58999, status: 'delivered', placedAt: daysAgo(8), deliveredAt: daysAgo(1) },
  { orderId: 'BZ-20007', customerEmail: 'manish@example.com', items: 'Bulk stationery', amountInr: 18400, status: 'delivered', placedAt: daysAgo(12), deliveredAt: daysAgo(7) },
] as const;

export const DEMO_TICKETS: NewTicketInput[] = [
  { channel: 'web', name: 'Aarav Mehta', email: 'aarav@example.com', subject: 'Charged twice for my speaker', body: 'Hi, I was charged twice for order BZ-20001 (₹1,299). Please refund the extra payment.' },
  { channel: 'email', name: 'Priya Sharma', email: 'priya@example.com', subject: 'Paise kat gaye', body: 'Paise kat gaye par order confirm nahi hua. Order BZ-20002, ₹899 wapas chahiye please.' },
  { channel: 'web', name: 'Rohan Gupta', email: 'rohan@example.com', subject: 'Refund for chair', body: 'The office chair from order BZ-20003 is wobbly. I want my full ₹7,499 refunded.' },
  { channel: 'web', name: 'Kavya Reddy', email: 'kavya@example.com', subject: 'Cannot log in', body: 'I forgot my password and the reset email never arrives. Please help.' },
  { channel: 'email', name: 'Manish Agarwal', email: 'manish@example.com', subject: 'Wrong GST number on invoice', body: 'The invoice for our bulk order BZ-20007 shows the wrong GST number. Please fix it urgently.' },
  { channel: 'web', name: 'Tanvi Joshi', email: 'tanvi@example.com', subject: 'Refund still pending', body: 'I returned the headphones (order BZ-20004) two weeks ago. If the refund is not processed soon I will go to consumer court.' },
  { channel: 'web', name: 'Vikram Singh', email: 'vikram@example.com', subject: 'Order kab aayega', body: 'Bhai mera order BZ-20005 abhi tak nahi aaya, 5 din ho gaye. Kab tak aayega?' },
  { channel: 'email', name: 'Meera Pillai', email: 'meera@example.com', subject: 'Laptop not received', body: 'Tracking for order BZ-20006 says delivered but I have not received my laptop.' },
  { channel: 'web', name: 'Rohan Gupta', email: 'rohan@example.com', subject: 'App crash on cart', body: 'The app crashes every time I open the cart page on my Android phone.' },
];

export async function upsertDemoCatalog(): Promise<void> {
  for (const cst of DEMO_CUSTOMERS) {
    await Customer.updateOne({ email: cst.email }, { $set: cst }, { upsert: true });
  }
  for (const ord of DEMO_ORDERS) {
    await Order.updateOne({ orderId: ord.orderId }, { $set: ord }, { upsert: true });
  }
}

const OPEN_STATUSES: TicketStatus[] = ['new', 'triaging', 'awaiting_review', 'escalated'];

/**
 * Keeps the public demo usable: if earlier visitors resolved most tickets,
 * re-submit the sample tickets so the queue is never empty. Returns how many were added.
 */
export async function ensureDemoQueue(minOpen = 4): Promise<number> {
  const open = await Ticket.countDocuments({ status: { $in: OPEN_STATUSES } });
  if (open >= minOpen) return 0;
  await upsertDemoCatalog();
  for (const t of DEMO_TICKETS) await createTicket(t);
  return DEMO_TICKETS.length;
}
