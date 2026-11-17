---
name: nexabasis-parallel-workflow
description: Use when planning or executing work across multiple Nexabasis apps with subagents, parallel agents, or git worktrees. Defines what may be parallelized, what must be serialized, agent roles, and merge/review flow.
---

# Nexabasis Parallel Workflow

Guidance for fanning out work across the Nexabasis ecosystem using subagents and parallel execution.
The architecture is decoupled, so parallelism is natural — **but some surfaces are shared and must be serialized.**

## Golden rule

> Parallelize by **app boundary**. Serialize anything touching the **shared Identity schema** or a **cross-app API contract**.

## Safe to parallelize
- One Nexabasis app per agent (NexaCV, NexaMenu, NexaHire, NexaPOS, NexaDoc)
- Frontend vs backend of the *same* app (separate repos/areas)
- Each app's own PostgreSQL database
- Independent features within one app that don't share migrations

## MUST be serialized (never two agents at once)
- **Shared Identity / SSO schema** and token contracts
- Cross-app API contract changes (version first, then fan out)
- Nginx / Docker / infra changes that affect all subdomains
- Global dependency upgrades (e.g., .NET or Next.js major versions)

## Recommended agent roles
| Agent | Scope | Mode |
|-------|-------|------|
| `nexa-backend` | One app's ASP.NET Core API | subagent |
| `nexa-frontend` | One app's Next.js frontend | subagent |
| `nexa-db` | One app's PostgreSQL schema/migrations | subagent |
| `nexa-identity` | Shared Identity schema/auth | **serialized, single agent** |
| `nexa-reviewer` | Reviews a branch/diff before merge | subagent |
| `explore` (built-in) | Read-only recon across repos | subagent |

## Isolation
- Use **git worktrees** — one per agent/branch. Never let two agents edit the same working tree.
- Branch naming: `feat/<app>-<topic>` (e.g., `feat/nexacv-openxml-export`).
- Each agent works only inside its app's worktree.

## Flow
1. **Plan first** (`writing-plans`): decompose into app-scoped, independently mergeable units.
2. **Identify shared surfaces** and pull them out into serial tasks.
3. **Fan out** app-scoped tasks to subagents in worktrees.
4. **Verify** each branch (`verification-before-completion`).
5. **Review** each branch (`nexa-reviewer`, `code-review`).
6. **Merge and clean up** (`finishing-a-development-branch`).

## Resource limits (local models)
- Cap concurrency at **2–3 agents** with Ollama cloud models to avoid rate limits.
- Long-running agents: keep context lean; DCP (installed) prunes stale tool output.
- Prefer more, smaller tasks over few giant ones.

## Done criteria per agent
- [ ] Changes confined to the agent's app/worktree
- [ ] No edits to shared Identity or other apps' schemas
- [ ] Tests/verification run and reported
- [ ] Branch name follows convention
- [ ] Ready for independent review
