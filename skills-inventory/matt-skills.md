# Skills Inventory — matt-skills

**Source:** https://github.com/DietrichGebert/ponytail (matt-skills) — vendored at `vendor/matt-skills`
**Location:** `vendor/matt-skills/skills/` (grouped: `engineering/`, `in-progress/`, `misc/`, `productivity/`)
**Total skills:** 38

| # | Skill | Group | Description |
|---|-------|-------|-------------|
| 1 | ask-matt | engineering | Ask which skill or flow fits your situation. A router over the skills in this repo. |
| 2 | code-review | engineering | Review changes since a fixed point (commit, branch, tag, merge-base) along two axes: Standards (follows repo coding standards?) and Spec (matches originating issue/spec?). Runs both reviews in parallel sub-agents, reports side by side. Use to review a branch, PR, WIP changes, or "review since X". |
| 3 | codebase-design | engineering | Shared vocabulary for designing deep modules. Use when designing/improving a module's interface, finding deepening opportunities, deciding where a seam goes, making code more testable or AI-navigable, or when another skill needs the deep-module vocabulary. |
| 4 | diagnosing-bugs | engineering | Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow. |
| 5 | domain-modeling | engineering | Build and sharpen a project's domain model. Use when discussing codebase terminology, writing/editing a CONTEXT.md, or recording/editing an ADR. |
| 6 | grill-with-docs | engineering | A relentless interview to sharpen a plan or design, which also creates docs (ADRs and glossary) as we go. |
| 7 | implement | engineering | Implement a piece of work based on a spec or set of tickets. |
| 8 | improve-codebase-architecture | engineering | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| 9 | prototype | engineering | Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like. |
| 10 | research | engineering | Investigate a question against high-trust primary sources and capture findings as a Markdown file in the repo. Use when the user wants a topic researched, docs/API facts gathered, or reading legwork delegated to a background agent. |
| 11 | resolving-merge-conflicts | engineering | Use when you need to resolve an in-progress git merge/rebase conflict. |
| 12 | setup-matt-pocock-skills | engineering | Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills. |
| 13 | tdd | engineering | Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests. |
| 14 | to-spec | engineering | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| 15 | to-tickets | engineering | Break a plan, spec, or the current conversation into tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| 16 | triage | engineering | Move issues and external PRs through a state machine of triage roles, categorise, verify, grill if needed, and write agent-ready briefs. |
| 17 | wayfinder | engineering | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear. |
| 18 | wizard | engineering | Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials/CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration/cutover. Don't invoke for steps the agent can perform itself. |
| 19 | claude-handoff | in-progress | Hand the current conversation off to a fresh background agent that picks up the work immediately. |
| 20 | implement-spec | in-progress | Implement a specification in code. |
| 21 | loop-me | in-progress | Grill me about specs for the workflows I want to build, within this workspace. |
| 22 | pr | in-progress | Use when writing a PR body. |
| 23 | retro | in-progress | Conduct a retrospective on a coding session. |
| 24 | setup-ts-deep-modules | in-progress | Wire dependency-cruiser into a TypeScript repo so each package is a deep module, with implementation hidden in subfolders and reachable only through its entry-point files. User-invoked. |
| 25 | writing-beats | in-progress | Writing, exploit; assemble raw material into a journey of beats, grounding each term before a beat leans on it. |
| 26 | writing-fragments | in-progress | Writing, explore: mine raw fragments, no structure yet. |
| 27 | writing-shape | in-progress | Writing, exploit: shape raw material into an article, paragraph by paragraph. |
| 28 | git-guardrails-claude-code | misc | Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block git push/reset in Claude Code. |
| 29 | migrate-to-shoehorn | misc | Migrate test files from `as` type assertions to @total-typescript/shoehorn. Use when user mentions shoehorn, wants to replace `as` in tests, or needs partial test data. |
| 30 | scaffold-exercises | misc | Create exercise directory structures with sections, problems, solutions, and explainers that pass linting. Use when user wants to scaffold exercises, create exercise stubs, or set up a new course section. |
| 31 | setup-pre-commit | misc | Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. Use when user wants to add pre-commit hooks, set up Husky, configure lint-staged, or add commit-time formatting/typechecking/testing. |
| 32 | grill-me | productivity | A relentless interview to sharpen a plan or design. |
| 33 | grilling | productivity | Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases. |
| 34 | handoff | productivity | Compact the current conversation into a handoff document for another agent to pick up. |
| 35 | teach | productivity | Teach the user a new skill or concept, within this workspace. |
| 36 | to-questionnaire | productivity | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. |
| 37 | wait-what | productivity | Stop. That last message did not land: re-pitch it. |
| 38 | writing-for-agents | productivity | Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md. |
