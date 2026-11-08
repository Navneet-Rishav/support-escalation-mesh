/**
 * Deterministic text detectors. These run in code on every ticket, so mandatory escalations
 * (legal threats, abuse) never depend on the LLM noticing them. The LLM's own flags are OR-ed on top.
 *
 * The lists are intentionally small and readable. They will miss some phrasings; see docs/DECISIONS.md.
 */

const LEGAL_PATTERNS: RegExp[] = [
  /\blegal (notice|action)\b/i,
  /\b(lawyer|advocate|attorney|vakil|vakeel)\b/i,
  /\bconsumer (court|forum|commission)\b/i,
  /\b(court|sue|lawsuit|fir)\b/i,
  /\bpolice (complaint|case)\b/i,
  /\b(kanooni|case (kar|karunga|karenge|kar dunga))\b/i,
];

const ABUSE_PATTERNS: RegExp[] = [
  /\b(idiot|idiots|stupid|moron|morons|bastard|bastards|scumbag)\b/i,
  /\b(bewakoof|gadhe|kamine|kameene|chor log)\b/i,
  /\b(i will|i'll) (kill|hurt|find) you\b/i,
  /\b(maar dunga|dekh lunga)\b/i,
];

export function detectLegal(text: string): boolean {
  return LEGAL_PATTERNS.some((re) => re.test(text));
}

export function detectAbuse(text: string): boolean {
  return ABUSE_PATTERNS.some((re) => re.test(text));
}

/** Order IDs on Bazaarly look like BZ-10234. */
export function extractOrderId(text: string): string | undefined {
  return text.match(/\bBZ-\d{5}\b/i)?.[0].toUpperCase();
}

const AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\b|rupees\b|rupaye\b|rupay\b|inr\b|\/-)/gi;

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

/** All rupee amounts mentioned in the text, e.g. "₹1,499", "Rs. 250", "500 rupees". */
export function extractAmountsInr(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = toNumber(m[1] ?? m[2] ?? '');
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

const REFUND_WORDS = /\b(refund(?:ed|ing)?|reimburse(?:d|ment)?|credit(?:ed)?|money back|paise wapas|paisa wapas|wapas)\b/i;

/**
 * Amounts that appear near a refund word (within the same sentence).
 * Used to check that a drafted reply does not promise more money than the policy approved.
 */
export function refundAmountsMentioned(text: string): number[] {
  return text
    .split(/(?<=[.!?\n।])\s*/)
    .filter((sentence) => REFUND_WORDS.test(sentence))
    .flatMap(extractAmountsInr);
}

const REFUND_PROMISE = [
  /\b(we|i) (will|shall|have|'ve|'ll) (refund|process(?:ed)? (?:a|your) refund|initiate(?:d)? (?:a|your) refund)\b/i,
  /\brefund (has been|will be|is being) (processed|initiated|issued|credited)\b/i,
  /\brefund (kar|process kar|initiate kar) (diya|denge|di|denge|rahe)\b/i,
];

export function promisesRefund(text: string): boolean {
  return REFUND_PROMISE.some((re) => re.test(text));
}
