# Eval run: Sarvam `sarvam-105b`, prompt v1

Run `6af2185e66f5f3fe989dec22`, stored 2026-11-09 19:00 UTC (10 Nov 2026 IST). One run over the 30 hand-labelled tickets in [`backend/src/evals/dataset.ts`](../../backend/src/evals/dataset.ts); metrics are computed by [`backend/src/evals/metrics.ts`](../../backend/src/evals/metrics.ts). Raw data: [`2026-11-10-sarvam-105b-prompt-v1.json`](2026-11-10-sarvam-105b-prompt-v1.json).

| Metric | Result |
|---|---|
| Routing accuracy | **100%** (30/30) |
| Escalation precision / recall | **92.3% / 100%** |
| Draft policy violations | 0% (17 drafts checked) |
| Latency per ticket | avg 25.9 s, p95 99.6 s |
| Tokens per ticket | 3,137 on average |
| Errors | 0 |

**Read this with care:** it is a single run on a small set, so one ticket moves routing accuracy by 3.3 points. Latency is end to end through the whole graph on a reasoning model (several LLM calls per ticket).

## Per ticket

✅ = route and escalation both as labelled. "Escalated" tickets get no AI draft, by design.

| ID | Language | Ticket | Expected route · escalate | Actual route · escalate | | Escalation reasons (code) | Latency | Tokens |
|---|---|---|---|---|---|---|---|---|
| E01 | English | **Charged twice**: I was charged twice for order BZ-10001 (₹1,299). Please refund the extra charge. | billing · no | billing · no | ✅ | — | 41.4 s | 4,333 |
| E02 | Hinglish | **Paise kat gaye**: Paise kat gaye par order place nahi hua. Order BZ-10002, ₹899 wapas chahiye. | billing · no | billing · no | ✅ | — | 46.5 s | 4,788 |
| E03 | English | **Double charge on big order**: I was charged ₹4,500 twice for order BZ-10003. Refund the duplicate payment. | billing · yes | billing · yes | ✅ | refund_over_agent_limit | 15.6 s | 1,864 |
| E04 | English | **Plus renewal charge**: Why was I charged ₹999 for Bazaarly Plus renewal? I never opted in to auto-renewal. Please refund it. | billing · yes | billing · yes | ✅ | refund_without_verified_order | 22.2 s | 2,483 |
| E05 | English | **GST invoice**: Can you send me the GST invoice for order BZ-10005? I need it for reimbursement claims at work. | billing · no | billing · no | ✅ | — | 26.5 s | 3,276 |
| E06 | English | **Late delivery**: My order BZ-10006 was supposed to arrive on Monday and it is still not delivered. Where is it? | order · no | order · no | ✅ | — | 32.4 s | 4,037 |
| E07 | Hinglish | **Order nahi aaya**: Bhai mera order BZ-10007 abhi tak nahi aaya, 5 din ho gaye hain. Kab aayega? | order · no | order · no | ✅ | — | 33.3 s | 4,142 |
| E08 | English | **Arrived broken**: The mixer grinder in order BZ-10008 arrived broken. Please send a replacement. | order · no | order · no | ✅ | — | 18.5 s | 2,791 |
| E09 | Hinglish | **Galat item**: Order BZ-10009 mein galat item aaya hai, mujhe refund chahiye. | order · no | order · no | ✅ | — | 33.7 s | 4,919 |
| E10 | English | **Laptop shows delivered but not received**: My laptop order BZ-10010 has not reached me but tracking says delivered. This is a ₹62,000 order! | order · yes | order · yes | ✅ | high_value_order, agent_requested_escalation | 20.9 s | 3,008 |
| E11 | English | **App crash**: The app crashes every time I open the cart page on my Android phone. | technical · no | technical · no | ✅ | — | 16.8 s | 3,605 |
| E12 | Hinglish | **OTP issue**: OTP nahi aa raha checkout ke time, app kaam nahi kar raha. | technical · no | technical · no | ✅ | — | 23.8 s | 4,267 |
| E13 | English | **Blank page**: The website shows a blank page after I click the Pay button on checkout. | technical · no | technical · no | ✅ | — | 13.9 s | 3,376 |
| E14 | English | **Reset email missing**: I forgot my password and the reset email never arrives. | account · no | account · no | ✅ | — | 17.0 s | 3,016 |
| E15 | Hinglish | **Login nahi ho raha**: Password bhool gaya hoon, login nahi ho raha. Help karo. | account · no | account · no | ✅ | — | 15.5 s | 3,144 |
| E16 | English | **Delete account**: Please delete my account and all my data. | account · no | account · yes | ❌ | agent_requested_escalation | 6.9 s | 1,531 |
| E17 | English | **Seller account locked**: Our seller account is locked and we cannot log in. Urgent, our store is down. | account · yes | account · yes | ✅ | enterprise_customer | 24.6 s | 1,950 |
| E18 | English | **Final warning**: If my refund for order BZ-10018 is not processed in 2 days I will send a legal notice and go to consumer court. | billing · yes | billing · yes | ✅ | legal_threat, agent_requested_escalation | 11.1 s | 2,805 |
| E19 | Hinglish | **Paisa wapas karo**: Mera paisa wapas karo warna consumer court mein case karunga. Order BZ-10019. | billing · yes | billing · yes | ✅ | legal_threat | 17.6 s | 3,262 |
| E20 | English | **Wrong shoes AGAIN**: You idiots delivered the wrong shoes again for order BZ-10020. Fix it. | order · yes | order · yes | ✅ | abusive_language | 10.4 s | 2,084 |
| E21 | Hinglish | **Delivery kab**: Bewakoof log ho tum, order BZ-10021 ka delivery kab hoga? | order · yes | order · yes | ✅ | abusive_language | 13.9 s | 2,736 |
| E22 | English | **Order cancelled**: I want to speak to a manager about my order BZ-10022 that was cancelled without any reason. | order · yes | order · yes | ✅ | agent_requested_escalation | 12.8 s | 2,881 |
| E23 | English | **Corporate gifting**: Do you sell gift cards for corporate events? | other · yes | other · yes | ✅ | unclassified, agent_requested_escalation | 6.1 s | 1,309 |
| E24 | Hinglish | **Office address**: Aapke office ka address kya hai? | other · yes | other · yes | ✅ | unclassified, agent_requested_escalation | 3.9 s | 1,044 |
| E25 | English | **Wrong GST number**: The invoice for our bulk order BZ-10025 shows the wrong GST number. | billing · yes | billing · yes | ✅ | enterprise_customer, agent_requested_escalation | 14.2 s | 2,127 |
| E26 | English | **Delayed despite Plus**: Order BZ-10026 is delayed. I am a Plus member and paid for fast delivery. | order · no | order · no | ✅ | — | 17.3 s | 3,074 |
| E27 | English | **Damaged item refund**: Refund ₹3,000 for order BZ-10027 please, the item was damaged. | order · no | order · no | ✅ | — | 99.6 s | 5,682 |
| E28 | Hindi | **ऑर्डर नहीं आया**: मेरा ऑर्डर BZ-10028 अभी तक नहीं आया है। कब तक आएगा? | order · no | order · no | ✅ | — | 101.5 s | 4,119 |
| E29 | Hindi | **दो बार पैसे कटे**: मुझसे दो बार पैसे काटे गए, रिफंड चाहिए। ऑर्डर BZ-10029 | billing · no | billing · no | ✅ | — | 30.6 s | 3,322 |
| E30 | English | **URGENT payment failed**: URGENT!! Payment page error, money deducted but the order failed. Order BZ-10030. | billing · no | billing · no | ✅ | — | 29.3 s | 3,130 |

**Misses:** E16.
