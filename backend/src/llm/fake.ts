import { detectAbuse, detectLegal, extractAmountsInr } from '../domain/detectors.js';
import type { ClassifyInput, DraftInput, SpecialistInput } from '../agents/schemas.js';
import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';

/**
 * A deterministic, keyword-based stand-in for an LLM.
 *
 * Used for tests, CI and running the app without an API key. It is NOT a model: eval numbers from
 * this provider are a keyword baseline and are labelled "fake" everywhere they are shown.
 */

const KEYWORDS: Record<'billing' | 'order' | 'technical' | 'account', [RegExp, number][]> = {
  billing: [
    [/\brefund\b/i, 2],
    [/\b(charged|charge|deducted|debited|double|twice|invoice|bill|payment|paid|upi|emi|cashback)\b/i, 2],
    [/\b(subscription|membership|plus fee|renewal)\b/i, 2],
    [/\b(paise|paisa|kat gaye|kat gaya|kata|wapas)\b/i, 2],
  ],
  order: [
    [/\b(order|parcel|package|shipment|courier)\b/i, 1],
    [/\b(delivery|delivered|deliver|tracking|late|delay(ed)?)\b/i, 2],
    [/\b(damaged|broken|wrong item|missing item|replace|replacement|return)\b/i, 2],
    [/\b(nahi aaya|nahi mila|abhi tak|toota|tuta|galat)\b/i, 2],
  ],
  technical: [
    [/\b(app|website|site|page|screen)\b/i, 1],
    [/\b(crash(es|ing)?|error|bug|otp|loading|freez(e|es|ing)|not working|blank)\b/i, 2],
    [/\b(kaam nahi|chal nahi|khul nahi raha app|hang)\b/i, 2],
  ],
  account: [
    [/\b(login|log in|sign in|signin|password|locked|blocked|2fa)\b/i, 2],
    [/\b(account|profile|email change|change my (email|phone|number)|delete my account)\b/i, 2],
    [/\b(bhool gaya|bhul gaya|account band)\b/i, 2],
  ],
};

const HINGLISH_MARKERS = /\b(hai|hain|nahi|nahin|mera|meri|mere|kya|kab|karo|kar|raha|rahi|hua|gaya|gaye|bhai|ji|abhi|mujhe|aap|kyun|kripya)\b/gi;

function detectLanguage(text: string): 'en' | 'hi' | 'hinglish' {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return (text.match(HINGLISH_MARKERS)?.length ?? 0) >= 2 ? 'hinglish' : 'en';
}

function detectUrgency(text: string): 'low' | 'normal' | 'high' {
  if (/\b(urgent|urgently|asap|immediately|right now|turant|jaldi)\b|!!/i.test(text)) return 'high';
  if (/\b(no rush|whenever|just curious|just wanted to know)\b/i.test(text)) return 'low';
  return 'normal';
}

function classify(input: ClassifyInput) {
  const text = `${input.subject}\n${input.body}`;
  const scores = Object.entries(KEYWORDS).map(([category, rules]) => ({
    category,
    score: rules.reduce((sum, [re, weight]) => sum + (re.test(text) ? weight : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  const [top, second] = scores;
  const none = top.score === 0;
  const confidence = none ? 0.3 : Math.min(0.95, 0.5 + (0.5 * (top.score - second.score)) / top.score);
  return {
    category: none ? 'other' : top.category,
    confidence: Number(confidence.toFixed(2)),
    language: detectLanguage(text),
    urgency: detectUrgency(text),
    summary: input.subject.slice(0, 200) || 'Customer ticket',
    flags: { legal: detectLegal(text), abuse: detectAbuse(text) },
  };
}

function propose(input: SpecialistInput) {
  const text = `${input.subject}\n${input.body}`;
  if (/\b(manager|supervisor|senior)\b/i.test(text)) {
    return { action: 'escalate', refundAmountInr: null, rationale: 'Customer explicitly asked for a manager.' };
  }
  const wantsMoney = /\b(refund|money back|paise wapas|paisa wapas|wapas|charged twice|double|deducted)\b/i.test(text);
  const mentioned = extractAmountsInr(text)[0] ?? null;

  switch (input.category) {
    case 'billing':
      if (wantsMoney) {
        return {
          action: 'refund',
          refundAmountInr: mentioned ?? input.order?.amountInr ?? null,
          rationale: 'Customer reports an incorrect charge; refund the affected amount.',
        };
      }
      return { action: 'information', refundAmountInr: null, rationale: 'Explain the charge and share the invoice.' };
    case 'order':
      if (/\b(damaged|broken|wrong|missing|toota|tuta|galat)\b/i.test(text)) {
        return wantsMoney
          ? { action: 'refund', refundAmountInr: input.order?.amountInr ?? mentioned, rationale: 'Damaged/wrong item and customer wants money back.' }
          : { action: 'replacement', refundAmountInr: null, rationale: 'Damaged or wrong item; send a replacement.' };
      }
      return { action: 'information', refundAmountInr: null, rationale: 'Share the latest tracking status and expected delivery date.' };
    case 'technical':
      return { action: 'troubleshoot', refundAmountInr: null, rationale: 'Update the app, clear cache, retry; collect device details if it persists.' };
    case 'account':
      return { action: 'account_recovery', refundAmountInr: null, rationale: 'Send a secure password-reset link to the registered email.' };
    default:
      return { action: 'escalate', refundAmountInr: null, rationale: 'Unclear request.' };
  }
}

const NEXT_STEP_EN: Record<string, string> = {
  replacement: 'We have arranged a replacement, which should reach you in 3-5 working days.',
  troubleshoot: 'Please update the Bazaarly app to the latest version, clear its cache and try again. If it still fails, reply with your phone model and we will dig in.',
  account_recovery: 'We have sent a secure password-reset link to your registered email. Please never share your OTP or password with anyone.',
  information: 'We have checked your request and will share a detailed update within 24 hours.',
};

const NEXT_STEP_HINGLISH: Record<string, string> = {
  replacement: 'Humne aapke liye replacement arrange kar diya hai, jo 3-5 working days mein pahunch jayega.',
  troubleshoot: 'Kripya Bazaarly app ko latest version par update karein, cache clear karke dobara try karein. Phir bhi issue ho to apna phone model bhejiye.',
  account_recovery: 'Aapke registered email par password reset link bheja gaya hai. Apna OTP ya password kabhi kisi ke saath share na karein.',
  information: 'Humne aapki request check kar li hai aur 24 ghante mein poori update denge.',
};

function draft(input: DraftInput) {
  const first = input.customerName.split(' ')[0] || 'there';
  const hinglish = input.language !== 'en';
  const refund = input.approvedRefundInr;
  let step: string;
  if (input.action === 'refund' && refund !== null) {
    step = hinglish
      ? `Humne ₹${refund} ka refund initiate kar diya hai, jo 5-7 working days mein aapke original payment method mein aa jayega.`
      : `We have initiated a refund of ₹${refund}, which will reach your original payment method in 5-7 working days.`;
  } else {
    step = (hinglish ? NEXT_STEP_HINGLISH : NEXT_STEP_EN)[input.action] ?? (hinglish ? NEXT_STEP_HINGLISH.information : NEXT_STEP_EN.information);
  }
  const reply = hinglish
    ? `Namaste ${first} ji, aapki pareshani ke liye maafi chahte hain. ${step}\n\nTeam Bazaarly`
    : `Hi ${first}, sorry for the trouble with this. ${step}\n\nTeam Bazaarly`;
  return { reply };
}

const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export class FakeProvider implements LlmProvider {
  readonly name = 'fake';
  readonly model = 'keyword-baseline';

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now();
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    const input = JSON.parse(lastUser?.content ?? '{}');
    const output =
      req.task === 'classify' ? classify(input) : req.task === 'specialist' ? propose(input) : draft(input);
    const text = JSON.stringify(output);
    const promptChars = req.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      text,
      latencyMs: Date.now() - started,
      usage: { promptTokens: Math.ceil(promptChars / 4), completionTokens: estimateTokens(text) },
    };
  }
}
