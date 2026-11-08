import type { Category } from '../models/Ticket.js';
import type { Tier } from '../models/Customer.js';
import type { OrderContext } from '../domain/policy.js';

/**
 * Labelled eval tickets for "Bazaarly" (fictional). All names, emails and orders are made up.
 *
 * expected.category = the correct route. expected.escalate = whether the guardrails SHOULD send it to a human
 * (legal/abuse, enterprise, order >= ₹25,000, refund over the ₹2,000 agent limit, refund without a verified order,
 * customer asks for a manager, or unclassifiable). 30 cases: small, so treat the metrics as indicative.
 */
export interface EvalCase {
  id: string;
  language: 'en' | 'hinglish' | 'hi';
  subject: string;
  body: string;
  customer: { name: string; email: string; tier: Tier };
  order: OrderContext | null;
  expected: { category: Category; escalate: boolean };
}

const c = (name: string, tier: Tier = 'standard') => ({
  name,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  tier,
});
const o = (orderId: string, amountInr: number, items: string, status = 'delivered'): OrderContext => ({ orderId, amountInr, items, status });

export const EVAL_CASES: EvalCase[] = [
  { id: 'E01', language: 'en', subject: 'Charged twice', body: 'I was charged twice for order BZ-10001 (₹1,299). Please refund the extra charge.', customer: c('Aarav Mehta'), order: o('BZ-10001', 1299, 'Bluetooth speaker'), expected: { category: 'billing', escalate: false } },
  { id: 'E02', language: 'hinglish', subject: 'Paise kat gaye', body: 'Paise kat gaye par order place nahi hua. Order BZ-10002, ₹899 wapas chahiye.', customer: c('Priya Sharma'), order: o('BZ-10002', 899, 'Cotton kurta', 'placed'), expected: { category: 'billing', escalate: false } },
  { id: 'E03', language: 'en', subject: 'Double charge on big order', body: 'I was charged ₹4,500 twice for order BZ-10003. Refund the duplicate payment.', customer: c('Rohan Gupta'), order: o('BZ-10003', 4500, 'Office chair'), expected: { category: 'billing', escalate: true } },
  { id: 'E04', language: 'en', subject: 'Plus renewal charge', body: 'Why was I charged ₹999 for Bazaarly Plus renewal? I never opted in to auto-renewal. Please refund it.', customer: c('Sneha Iyer', 'plus'), order: null, expected: { category: 'billing', escalate: true } },
  { id: 'E05', language: 'en', subject: 'GST invoice', body: 'Can you send me the GST invoice for order BZ-10005? I need it for reimbursement claims at work.', customer: c('Karan Malhotra'), order: o('BZ-10005', 2150, 'Desk lamp'), expected: { category: 'billing', escalate: false } },
  { id: 'E06', language: 'en', subject: 'Late delivery', body: 'My order BZ-10006 was supposed to arrive on Monday and it is still not delivered. Where is it?', customer: c('Divya Nair'), order: o('BZ-10006', 749, 'Phone cover', 'shipped'), expected: { category: 'order', escalate: false } },
  { id: 'E07', language: 'hinglish', subject: 'Order nahi aaya', body: 'Bhai mera order BZ-10007 abhi tak nahi aaya, 5 din ho gaye hain. Kab aayega?', customer: c('Vikram Singh'), order: o('BZ-10007', 1199, 'Running shoes', 'shipped'), expected: { category: 'order', escalate: false } },
  { id: 'E08', language: 'en', subject: 'Arrived broken', body: 'The mixer grinder in order BZ-10008 arrived broken. Please send a replacement.', customer: c('Ananya Rao'), order: o('BZ-10008', 2499, 'Mixer grinder'), expected: { category: 'order', escalate: false } },
  { id: 'E09', language: 'hinglish', subject: 'Galat item', body: 'Order BZ-10009 mein galat item aaya hai, mujhe refund chahiye.', customer: c('Rahul Verma'), order: o('BZ-10009', 650, 'Steel water bottle'), expected: { category: 'order', escalate: false } },
  { id: 'E10', language: 'en', subject: 'Laptop shows delivered but not received', body: 'My laptop order BZ-10010 has not reached me but tracking says delivered. This is a ₹62,000 order!', customer: c('Meera Pillai'), order: o('BZ-10010', 62000, 'Laptop'), expected: { category: 'order', escalate: true } },
  { id: 'E11', language: 'en', subject: 'App crash', body: 'The app crashes every time I open the cart page on my Android phone.', customer: c('Siddharth Jain'), order: null, expected: { category: 'technical', escalate: false } },
  { id: 'E12', language: 'hinglish', subject: 'OTP issue', body: 'OTP nahi aa raha checkout ke time, app kaam nahi kar raha.', customer: c('Pooja Yadav'), order: null, expected: { category: 'technical', escalate: false } },
  { id: 'E13', language: 'en', subject: 'Blank page', body: 'The website shows a blank page after I click the Pay button on checkout.', customer: c('Nikhil Bose'), order: null, expected: { category: 'technical', escalate: false } },
  { id: 'E14', language: 'en', subject: 'Reset email missing', body: 'I forgot my password and the reset email never arrives.', customer: c('Kavya Reddy'), order: null, expected: { category: 'account', escalate: false } },
  { id: 'E15', language: 'hinglish', subject: 'Login nahi ho raha', body: 'Password bhool gaya hoon, login nahi ho raha. Help karo.', customer: c('Arjun Kapoor'), order: null, expected: { category: 'account', escalate: false } },
  { id: 'E16', language: 'en', subject: 'Delete account', body: 'Please delete my account and all my data.', customer: c('Ishita Das'), order: null, expected: { category: 'account', escalate: false } },
  { id: 'E17', language: 'en', subject: 'Seller account locked', body: 'Our seller account is locked and we cannot log in. Urgent, our store is down.', customer: c('Manish Agarwal', 'enterprise'), order: null, expected: { category: 'account', escalate: true } },
  { id: 'E18', language: 'en', subject: 'Final warning', body: 'If my refund for order BZ-10018 is not processed in 2 days I will send a legal notice and go to consumer court.', customer: c('Tanvi Joshi'), order: o('BZ-10018', 1200, 'Headphones', 'returned'), expected: { category: 'billing', escalate: true } },
  { id: 'E19', language: 'hinglish', subject: 'Paisa wapas karo', body: 'Mera paisa wapas karo warna consumer court mein case karunga. Order BZ-10019.', customer: c('Harsh Thakur'), order: o('BZ-10019', 999, 'Smartwatch strap', 'returned'), expected: { category: 'billing', escalate: true } },
  { id: 'E20', language: 'en', subject: 'Wrong shoes AGAIN', body: 'You idiots delivered the wrong shoes again for order BZ-10020. Fix it.', customer: c('Rajat Sinha'), order: o('BZ-10020', 1899, 'Sneakers'), expected: { category: 'order', escalate: true } },
  { id: 'E21', language: 'hinglish', subject: 'Delivery kab', body: 'Bewakoof log ho tum, order BZ-10021 ka delivery kab hoga?', customer: c('Sunil Pandey'), order: o('BZ-10021', 540, 'Notebook set', 'shipped'), expected: { category: 'order', escalate: true } },
  { id: 'E22', language: 'en', subject: 'Order cancelled', body: 'I want to speak to a manager about my order BZ-10022 that was cancelled without any reason.', customer: c('Neha Kulkarni'), order: o('BZ-10022', 1350, 'Backpack', 'cancelled'), expected: { category: 'order', escalate: true } },
  { id: 'E23', language: 'en', subject: 'Corporate gifting', body: 'Do you sell gift cards for corporate events?', customer: c('Aditya Menon'), order: null, expected: { category: 'other', escalate: true } },
  { id: 'E24', language: 'hinglish', subject: 'Office address', body: 'Aapke office ka address kya hai?', customer: c('Ritu Saxena'), order: null, expected: { category: 'other', escalate: true } },
  { id: 'E25', language: 'en', subject: 'Wrong GST number', body: 'The invoice for our bulk order BZ-10025 shows the wrong GST number.', customer: c('Gaurav Bansal', 'enterprise'), order: o('BZ-10025', 18400, 'Bulk stationery'), expected: { category: 'billing', escalate: true } },
  { id: 'E26', language: 'en', subject: 'Delayed despite Plus', body: 'Order BZ-10026 is delayed. I am a Plus member and paid for fast delivery.', customer: c('Shreya Ghosh', 'plus'), order: o('BZ-10026', 1599, 'Yoga mat', 'shipped'), expected: { category: 'order', escalate: false } },
  { id: 'E27', language: 'en', subject: 'Damaged item refund', body: 'Refund ₹3,000 for order BZ-10027 please, the item was damaged.', customer: c('Varun Chopra'), order: o('BZ-10027', 1800, 'Table fan'), expected: { category: 'order', escalate: false } },
  { id: 'E28', language: 'hi', subject: 'ऑर्डर नहीं आया', body: 'मेरा ऑर्डर BZ-10028 अभी तक नहीं आया है। कब तक आएगा?', customer: c('Suresh Kumar'), order: o('BZ-10028', 799, 'Pressure cooker', 'shipped'), expected: { category: 'order', escalate: false } },
  { id: 'E29', language: 'hi', subject: 'दो बार पैसे कटे', body: 'मुझसे दो बार पैसे काटे गए, रिफंड चाहिए। ऑर्डर BZ-10029', customer: c('Lakshmi Devi'), order: o('BZ-10029', 450, 'Tea set'), expected: { category: 'billing', escalate: false } },
  { id: 'E30', language: 'en', subject: 'URGENT payment failed', body: 'URGENT!! Payment page error, money deducted but the order failed. Order BZ-10030.', customer: c('Imran Khan'), order: o('BZ-10030', 1150, 'Wireless mouse', 'cancelled'), expected: { category: 'billing', escalate: false } },
];
