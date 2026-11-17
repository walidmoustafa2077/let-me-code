---
name: nexabasis-billing
description: Use when implementing monetization in any Nexabasis app - AI credit systems, pay-per-download, pay-per-job-slot, or monthly subscriptions. Covers credit accounting, entitlements, and Stripe-style payment integration for NexaCV, NexaMenu, NexaHire.
---

# Nexabasis Billing & Monetization

Each app monetizes differently. All must be **server-authoritative** — clients never decide entitlement.

## Per-app models
| App | Model |
|-----|-------|
| **NexaCV** | Pay-per-download + credit system for AI usage |
| **NexaMenu** | Freemium (branded) / monthly subscription for unlimited white-labeled menus |
| **NexaHire** | Pay-per-job-slot / monthly SaaS tier |
| **NexaPOS** | Per-deployment (not covered here) |
| **NexaDoc** | (freemium) |

## Rules
1. **Server-authoritative entitlements.** The backend decides if an action is allowed; the client only displays state.
2. **Credits are a ledger.** Model AI usage as append-only ledger entries (grant, consume, refund) tied to `user_id`/`tenant_id`. Never mutate a single counter blindly.
3. **Reserve then commit.** For AI calls: check balance → reserve → call provider → commit on success / release on failure. Never charge for a failed call.
4. **Idempotency.** Payment webhooks and credit consumption must be idempotent (idempotency keys).
5. **Subscription state machine.** Track `trialing → active → past_due → canceled`. Gate features by state, not just by a boolean.
6. **White-label gating.** NexaMenu branding removal and unlimited menus unlock only on active paid subscription.
7. **Pay-per-download gating.** NexaCV releases the .docx/PDF only after entitlement is verified server-side.
8. **Webhook signature verification** is mandatory for any payment provider.
9. **Auditability.** Every credit/subscription change is logged with reason, actor, and timestamp.
10. **Currency/pricing** stored server-side per product; never trust client-sent prices.

## Data model sketch (per app DB)
- `plans` (product, price, interval, features)
- `subscriptions` (tenant_id, plan_id, status, period_start/end, provider_ref)
- `credit_ledger` (user_id/tenant_id, delta, reason, ref, created_at)
- `entitlements` (tenant_id, feature, value, source)
- `payments` (provider_id, amount, status, idempotency_key)

## Checklist
- [ ] Entitlement enforced server-side
- [ ] Credits are an append-only ledger with reserve/commit
- [ ] Webhooks idempotent and signature-verified
- [ ] Failed AI/provider calls do not consume credits
- [ ] Subscription state drives feature gating
- [ ] All changes audited
