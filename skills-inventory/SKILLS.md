# Skills manifest

Every skill in `.opencode/skills` and which agents may load it. A skill not listed for an agent is
**hidden** from that agent (`"*": "deny"`), so a missing row is a missing capability, not a typo.

**Why this file exists:** in the first run of this factory the orchestrator loaded zero skills in a
59-message session — the procedure lived in the skill, the agent never opened it, and its four-line
prompt drove the whole build. Skills only help if loading them is mandatory, so:

1. `spawn.ts` appends a **Step 0** instruction to every child prompt: load the named skill before
   acting.
2. Every agent markdown file opens with the same rule and names its own skill.
3. Every `### HANDOFF` block must carry `skills: <what it loaded>`. The orchestrator re-dispatches a
   child whose `skills:` line is empty.
4. `general` inherits all 85 skills; every other agent gets an explicit allow-list.

85 skills, grouped by the job they do. The heavy one is `design-taste-frontend`
(directory `taste-skill`, 33 MB of photographs, icons and checker scripts) — it is what makes a UI
ticket look designed instead of generated.

| Skill | Directory | What it is for | Agents that may load it |
|---|---|---|---|
| `agent-dispatcher` | — | Dispatch children through the delegation MCP with the right agent, context, and acceptance criteria. | general, orchestrator |
| `agent-skill-author` | — | Author, validate, and format new OpenCode SKILL.md files following factory standards. | general, tech-writer |
| `apply-design` | — | Implement the interfaces the architect specified — do not redesign them. | general, senior-dev, junior-dev, visualizer |
| `aspnet-core` | — | Build, review, refactor, or architect ASP.NET Core web applications using current official guidance for .NET web development. Use when working on B... | general, architect, senior-dev, qa-engineer |
| `async-unblocker` | — | Handle a child that stalled, died, or returned blocked — diagnose from the log, escalate to the human, and never burn wall-clock waiting. | general, orchestrator |
| `avoid-ai-design` | — | Audit and rewrite frontend UI to remove generic AI design patterns ("AI slop"), both the first-order defaults (purple gradients, Inter, a centered... | general, senior-dev, qa-engineer, visualizer |
| `brainstorming` | — | "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user in... | general, orchestrator, architect |
| `branch-hygiene` | — | Prune stale worktrees, clean temporary task branches, and enforce pre-commit checks. | general, git-agent |
| `code-review-and-quality` | — | Review the implementation diff against the spec and CONSTRAINTS.md, reporting every violation with file, line, and reason. | general, qa-engineer |
| `code-simplifier` | — | Simplifies and refines code for clarity, consistency, and maintainability while preserving all functionality. Use when asked to "simplify code", "c... | general, senior-dev, qa-engineer, minimalism-enforcer |
| `commit-conventions` | — | Land verified work as clean, separated feat and test commits — and never push. | general, git-agent |
| `composition-patterns` | — | React composition patterns that scale. Use when refactoring components with | general, senior-dev, visualizer |
| `configure-delegation` | — | Read or update DELEGATE_CONFIG.json (engine, serverUrl, defaultModel, timeouts, allowedAgents) for the delegation engine. | general, orchestrator |
| `configuring-opentelemetry-dotnet` | — | Configure OpenTelemetry distributed tracing, metrics, and logging in ASP.NET Core using the .NET OpenTelemetry SDK. Use when adding observability,... | general, senior-dev, devobs |
| `constraint-setter` | — | Write CONSTRAINTS.md — the testable quality and security bar every ticket is graded against. | general, architect |
| `context-engineering` | — | Assemble the minimal, precise context a child agent needs; never dump the whole repo. | general, orchestrator, architect |
| `core-implementer` | — | The primary implementation loop — thin verifiable slices, tests green, tree left dirty for review. | general, senior-dev, junior-dev |
| `core-router` | — | Classify an incoming human request as spike, bounded, or architectural and route it to the correct factory workflow. | general, orchestrator |
| `create-datadriven-aspnetcore` | — | Generate or scaffold ASP.NET Core code — Razor Pages, Blazor components, MVC controllers, views, and Minimal API endpoints — without using ASP.NET... | general, senior-dev |
| `debugging-and-error-recovery` | — | When your own code fails, find the cause and fix it — do not paper over symptoms. | general, senior-dev |
| `delegate-task` | — | Hand a strictly scoped, mechanical coding task to the background worker (general) and integrate its diff. | general, senior-dev |
| `design-language` | — | Design and build a company website that looks made for its client — one system, one section per screen, real photographs, quiet motion; use for any... | general, architect, senior-dev, junior-dev, visualizer |
| `design-review` | — | Gate a page against the design-language house rules before handoff — run the checker, walk the visual list at desktop and phone widths, and report... | general, senior-dev, qa-engineer, visualizer |
| `design-taste-frontend` | `taste-skill` | >- | general, senior-dev, qa-engineer, visualizer |
| `dispatching-parallel-agents` | — | Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies | general, orchestrator |
| `domain-modeling` | — | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR. | general, orchestrator, architect, challenger, tech-writer |
| `dotnet-webapi` | — | > | general, architect, senior-dev, qa-engineer |
| `doubt-driven-review` | — | Adversarial review of a plan — find the way it fails before code is written. | general, challenger |
| `e2e-and-browser-testing` | — | Playwright E2E testing workflows, browser automation, and integration test patterns. | general, senior-dev, qa-engineer |
| `emergency-halt` | — | Safely abort active child sessions, snapshot uncommitted diffs, and revert working tree to clean HEAD. | general, orchestrator |
| `executing-plans` | — | Use when you have a written implementation plan to execute in a separate session with review checkpoints | general, senior-dev |
| `find-bugs` | — | Find bugs, security vulnerabilities, and code quality issues in local branch changes. Use when asked to review changes, find bugs, security review,... | general, senior-dev, qa-engineer |
| `finishing-a-development-branch` | — | Use when implementation is complete, all tests pass, and you need to decide how to integrate the work | general, orchestrator |
| `frontend-design` | — | Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography,... | general, architect, senior-dev, visualizer |
| `git-rewrite-history` | — | Use when the user asks to rewrite Git history or use git-filter-repo. | general, git-agent |
| `git-workflow` | — | Git workflow patterns including branching strategies, commit conventions, merge vs rebase, conflict resolution, and collaborative development best... | general, git-agent |
| `guardrail-audit` | — | Systematically audit agent permission boundaries, path traversal guards, and MCP tool schemas. | general, challenger |
| `incremental-implementation` | — | Build in thin, verifiable slices — smallest change that passes, then expand. | general, senior-dev, junior-dev |
| `intent-extractor` | — | Interview the human one question at a time until problem, scope, stack, data, privacy, interface, look and done-criteria are unambiguous, then writ... | general, orchestrator |
| `mcp-builder` | — | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tool... | general, senior-dev |
| `mentorship` | — | Guide, scaffold, and review junior-dev implementations — clear interfaces, thin slices, and coaching feedback. | general, senior-dev |
| `meta-debugger` | — | Diagnose a stuck or looping factory run from logs and engine status, not from guesswork. | general, orchestrator |
| `minimalism-enforcer` | — | Flag over-engineering and demand the simplest stdlib-first solution. | general, challenger, minimalism-enforcer |
| `nexabasis-architecture` | — | Use when working in any Nexabasis repository or when asked to write code, design schemas, or plan features for the Nexabasis ecosystem (NexaCV, Nex... | general, senior-dev |
| `nexabasis-billing` | — | Use when implementing monetization in any Nexabasis app - AI credit systems, pay-per-download, pay-per-job-slot, or monthly subscriptions. Covers c... | general, senior-dev |
| `nexabasis-openxml` | — | Use when generating, reading, or templating Word .docx files or PDFs for NexaCV (or any Nexabasis export) in ASP.NET Core. Covers the OpenXML SDK a... | general, senior-dev |
| `nexabasis-parallel-workflow` | — | Use when planning or executing work across multiple Nexabasis apps with subagents, parallel agents, or git worktrees. Defines what may be paralleli... | general, senior-dev |
| `nexabasis-sso-identity` | — | Use when implementing or modifying authentication, authorization, user accounts, sessions, JWTs, refresh tokens, roles, or multi-tenancy in any Nex... | general, senior-dev |
| `next-cache-components-optimizer` | — | > | general, senior-dev |
| `next-dev-loop` | — | > | general, senior-dev |
| `optimizing-ef-core-queries` | — | "Optimize and improve the performance of slow Entity Framework Core (EF Core) queries: make them generate less SQL, make fewer database round-trips... | general, senior-dev |
| `performance` | — | Meet the ticket's performance budget without premature optimization. | general, senior-dev |
| `portfolio-case-study-writer` | — | Transform resume bullets into detailed portfolio case studies with context, action, and outcome. Use when the user mentions portfolio, case study,... | general, visualizer |
| `portfolio-page` | — | "Writes compelling portfolio page copy with project descriptions, results, testimonials, and CTAs for freelancers." | general, visualizer |
| `react-best-practices` | — | React and Next.js performance optimization guidelines from Vercel Engineering. This skill should be used when writing, reviewing, or refactoring Re... | general, senior-dev, qa-engineer, visualizer |
| `receiving-code-review` | — | Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requir... | general, senior-dev |
| `refactoring-and-simplification` | — | Apply the simplifications the minimalism-enforcer flags; do not refactor speculatively. | general, senior-dev, minimalism-enforcer |
| `requesting-code-review` | — | Use when completing tasks, implementing major features, or before merging to verify work meets requirements | general, senior-dev, qa-engineer |
| `resume` | `resume-writer` | "Write a sharp, achievement-led resume/CV that passes ATS and earns the interview. Use when asked to write or rewrite a resume or CV, turn experien... | * |
| `review-protocol` | — | How to review an uncommitted diff — verify against the spec, not the author's summary. | general, qa-engineer |
| `root-cause-debugging` | — | Systematic root-cause analysis of a failing gate — reproduce, isolate, explain, then judge. | general, qa-engineer |
| `security-best-practices` | — | "Perform language and framework specific security best-practice reviews and suggest improvements. Trigger only when the user explicitly requests se... | general, senior-dev, qa-engineer |
| `security-hardening` | — | Multi-tier security SAST — dynamically leverage Semgrep MCP if available, falling back to static regex and heuristic pattern scans. | general, qa-engineer, devobs |
| `security-ownership-map` | — | "Analyze git repositories to build a security ownership topology (people-to-file), compute bus factor and sensitive-code ownership, and export CSV/... | general, qa-engineer |
| `security-review` | — | Security code review for vulnerabilities. Use when asked to "security review", "find vulnerabilities", "check for security issues", "audit security... | general, senior-dev, qa-engineer |
| `security-threat-model` | — | "Repository-grounded threat modeling that enumerates trust boundaries, assets, attacker capabilities, abuse paths, and mitigations, and writes a co... | general, architect, challenger, devobs |
| `session-retro` | — | Turn a finished run into at most 3 concrete improvements so the factory stops repeating mistakes. | general, tech-writer |
| `skill-creator` | — | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or... | general, tech-writer |
| `source-grounding` | — | Check the official docs for the framework/API in use before writing code against it. | general, senior-dev, junior-dev |
| `spec-creator` | — | Turn INTENT.md into a rigorous design spec at docs/specs/ covering approach, interfaces, data flow, edge cases, and test strategy. | general, architect |
| `state-manager` | — | Maintain BOARD.md as the single source of truth, moving tickets between Todo, In Progress, In Review, Blocked, and Done. | general, orchestrator |
| `strategic-compact` | — | Use when a long session has accumulated research, exploration, or debugging context and is approaching a phase change - suggests manual /compact (o... | general, orchestrator, tech-writer |
| `subagent-driven-development` | — | Use when executing implementation plans with independent tasks in the current session | general, orchestrator |
| `system-designer` | — | Design module boundaries, API contracts, and data models before tickets are written. | general, architect |
| `system-documenter` | — | Document a landed feature and record non-obvious decisions as ADRs. | general, tech-writer |
| `systematic-debugging` | — | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes | general, senior-dev, qa-engineer, devobs |
| `task-breakdown` | — | Slice a spec into small, independently testable tickets with explicit depends_on ordering, written to tickets/TICKET-N.md. | general, architect |
| `test-driven-development` | — | Write a failing verification test first, make it pass, and commit the passing suite for the ticket under review. | general, senior-dev, junior-dev, qa-engineer |
| `ui-engineer` | — | Build accessible, semantic frontend UI (WCAG-minded) when the ticket is a UI ticket. | general, senior-dev, junior-dev, visualizer |
| `using-git-worktrees` | — | Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace... | general, senior-dev |
| `using-superpowers` | — | Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying qu... | general, orchestrator |
| `verification` | — | Evidence before assertions — run the command and read the output before claiming success. | general, orchestrator, qa-engineer, devobs |
| `verification-before-completion` | — | Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirm... | general, orchestrator, senior-dev, qa-engineer |
| `writing-plans` | — | Use when you have a spec or requirements for a multi-step task, before touching code | general, orchestrator, architect, challenger |
| `writing-skills` | — | Use when creating new skills, editing existing skills, or verifying skills work before deployment | general, tech-writer |
## Notes

- `design-taste-frontend` lives in `taste-skill/` and is the full house-style system plus its
  checker. Any ticket marked `ui: yes` must load it; `qa-engineer` runs its gate for those tickets.
- `resume` is a project-specific writing skill with no factory step, so no agent is granted it.
  It ships anyway so a project that needs it has it.
- `test-driven-development` was the only name collision when merging the global skills; the factory
  version is kept.
- Scaffolding copies `.opencode` wholesale, so a new project receives all 85 skills (~37 MB,
  33 MB of it the design assets). Delete `taste-skill/assets` in a project with no UI.
