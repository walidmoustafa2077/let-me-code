---
name: nexabasis-architecture
description: Use when working in any Nexabasis repository or when asked to write code, design schemas, or plan features for the Nexabasis ecosystem (NexaCV, NexaMenu, NexaHire, NexaPOS, NexaDoc). Enforces the decoupled micro-API, separated-database, shared-Identity SSO architecture and the fixed technology stack.
---

# Nexabasis Architecture

Nexabasis is a unified ecosystem of **decoupled** SaaS web apps and desktop software.
Each app has its own frontend, backend API, and logical database. They share **only** a central Authentication system (SSO).

## The app suite

| App | Domain | Core | Monetization |
|-----|--------|------|--------------|
| **NexaCV** | cv.nexabasis.com | AI resume builder; strict web forms (no drag-drop); backend injects JSON into templates; OpenAI refines bullets; PDF + ATS Word (.docx) via ASP.NET OpenXML | Pay-per-download + AI credit system |
| **NexaMenu** | menu.nexabasis.com | Digital menu creator; forms for categories/items/prices; hosts live Next.js page; PDF + QR codes | Freemium (branded) / monthly sub (white-label) |
| **NexaHire** | hire.nexabasis.com | Job posting + AI ATS; employers post jobs; candidates upload resumes; parse + AI score (1-100 + report) | Pay-per-job-slot / monthly SaaS |
| **NexaPOS** | Desktop + Web Sync | POS desktop app: sales, inventory, transactions, reports, orders, CRM/loyalty; syncs to cloud | (per deployment) |
| **NexaDoc** | doc.nexabasis.com | Client-side document scanning/manipulation; converters, CamScan (camera, auto-crop, OCR); heavy processing on client to save server cost | (freemium) |

## Stack — do not deviate without being asked

- **Frontend:** Next.js (React) for all web apps.
- **Desktop:** native/cross-platform for NexaPOS (.NET MAUI, Electron, or Tauri — confirm choice before coding).
- **Backend:** ASP.NET Core (C# Web API). **Separate micro-API per app.**
- **Database:** PostgreSQL. **Separated logical database per app**, except the globally shared central **Identity** schema for cross-app SSO.
- **Infra:** Google Cloud Platform VMs, fully Dockerized. Web containers routed by **Nginx reverse proxy on subdomains** (cv., menu., hire., doc.).

## Non-negotiable rules

1. **No cross-app database joins.** Apps never read each other's databases. Sharing happens through APIs or the shared Identity schema only.
2. **One API per app.** Do not add endpoints for app B into app A's API.
3. **Identity is the only shared schema.** Auth, users, and cross-app SSO live there. Treat it as high-risk: serialize changes.
4. **Server cost discipline.** Anything heavy and client-feasible (NexaDoc) runs client-side.
5. **AI calls are backend-mediated** with credits/quota accounting — never expose provider keys to the client.
6. **Subdomain routing is infra, not app code.** Every app assumes it is reached on its own subdomain behind Nginx.
7. **Desktop sync is explicit.** NexaPOS is offline-capable and syncs to the cloud backend — design for conflict resolution.

## When generating code
- State which app and which layer (frontend / API / DB / Identity) you are editing.
- For schemas, name the logical database explicitly.
- For auth, go through shared Identity — never roll per-app auth.
- Flag anything that would couple apps or break the one-API-per-app rule.
