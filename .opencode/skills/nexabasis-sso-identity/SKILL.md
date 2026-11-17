---
name: nexabasis-sso-identity
description: Use when implementing or modifying authentication, authorization, user accounts, sessions, JWTs, refresh tokens, roles, or multi-tenancy in any Nexabasis app. Covers the shared central Identity schema and cross-app SSO across NexaCV, NexaMenu, NexaHire, NexaPOS and NexaDoc.
---

# Nexabasis SSO & Shared Identity

All Nexabasis apps authenticate against **one central Identity schema**. Every other database is app-private.
This skill governs the highest-risk shared surface in the ecosystem.

## Core model

- **One Identity database** holds: users, credentials, MFA, sessions, refresh tokens, roles/permissions, tenant/org membership, and cross-app consent.
- **Every app database** stores only app-specific data plus an **opaque `user_id` / `tenant_id` foreign reference** — never duplicated credentials.
- **SSO:** a user signs in once (at the identity/SSO surface) and receives a token usable across cv./menu./hire./doc. subdomains.

## Token strategy

- Short-lived **access JWT** carrying `sub` (user_id), `tenant_id`, `roles`, `aud` (target app), `scope`.
- Long-lived **refresh token** stored server-side in Identity, rotated on use, revocable.
- **Audience-scoped:** an access token minted for NexaCV should not be silently accepted by NexaHire unless cross-app SSO is intended for that scope. Be explicit.
- Signing keys live only in Identity; other APIs validate using public keys (JWKS) and cache them.

## Rules

1. **Never create per-app auth.** No separate user tables, password hashing, or login flows outside Identity.
2. **Validate, don't trust.** Every micro-API validates signature, expiry, audience, issuer, and scopes on every request.
3. **Least privilege by scope.** APIs check scopes/roles required for each endpoint.
4. **Tenant isolation is mandatory.** Every query is scoped by `tenant_id`; a missing tenant filter is a critical bug.
5. **Serialize Identity changes.** Schema/token-contract changes to Identity must not be made in parallel by multiple agents.
6. **Secrets stay server-side.** Client apps get tokens, never signing keys or provider secrets.
7. **Revocation must work.** Logout / password change / admin action revokes refresh tokens in Identity.
8. **Subdomain cookies.** If using cookies for SSO across subdomains, set the cookie domain to the apex with correct `SameSite`/`Secure`/`HttpOnly`. Prefer token-based auth for APIs.

## Checklist before finishing auth work
- [ ] No per-app credential storage introduced
- [ ] Audience + issuer + scope validated in the API
- [ ] Every data access filtered by `tenant_id`
- [ ] Refresh rotation + revocation implemented
- [ ] Tokens not logged; secrets not committed
- [ ] Cross-subdomain behavior tested (or explicitly documented as unsupported)
