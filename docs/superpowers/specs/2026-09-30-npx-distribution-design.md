# npx Distribution for the Agent Factory — Design

Date: 2026-09-30
Status: Draft (awaiting review)
Repo: https://github.com/walidmoustafa2077/let-me-code (public)

## Goal

Let anyone bootstrap the Agent Factory into an existing project with a single
command:

```
npx github:walidmoustafa2077/let-me-code
```

No npm registry account required. The same GitHub repo is both the source of
truth we dogfood in and the distributable.

## Non-Goals

- Publishing to the npm registry (chosen against; GitHub-only).
- Versioning/release automation, CI, provenance.
- Changing the MCP delegation engine's behavior.
- Shipping a `Dockerfile` or devcontainer.

## Approach

Single package. The repo root `package.json` becomes the distributable and
declares a `bin`. A thin CLI copies the factory's assets into the user's
project and merges config.

Rejected alternatives:

- **Duplicate `template/` dir** — two copies drift; DRY violation.
- **Publish MCP to npm separately** — needs an npm account; contradicts the
  GitHub-only decision.

## Packaging

`package.json` (root) changes:

- Remove `"private": true`.
- Add `"name": "let-me-code"`, `"version"`, `"description"`, `"license": "MIT"`.
- Add `"bin": { "let-me-code": "bin/cli.mjs" }`.
- Add `"engines": { "node": ">=22.6" }` (native TS type-stripping is required
  by `mcp/delegation/src/index.ts` being run directly with `node`).
- Add `"files"` allowlist so the published tarball contains the factory assets:
  `.opencode`, `mcp`, `opencode.json`, `DELEGATE_CONFIG.json`, `LICENSE`,
  `README.md`, `bin`, `lib`.
- Keep `"type": "module"`.
- Zero runtime dependencies; Node stdlib only (`node:fs`, `node:path`,
  `node:readline/promises`, `node:child_process`).

The npm "files" mechanism includes dot-directories when named explicitly
(`.opencode`) — verified with `npm pack --dry-run` during implementation.

`mcp/delegation/package.json` keeps its own deps (`@modelcontextprotocol/sdk`,
`zod`) and is installed at the user's target via `npm install`.

## CLI Surface

Entry: `bin/cli.mjs` (thin dispatcher) → `lib/cli.mjs` (arg parsing) →
`lib/scaffold.mjs` (pure file ops) + `lib/merge.mjs` (pure config merge) →
`lib/wizard.mjs` (interactive prompts).

```
let-me-code [init] [target-dir] [options]
```

| Flag | Meaning |
| --- | --- |
| (none) | Interactive wizard |
| `[target-dir]` | Scaffold into dir (default: cwd) |
| `--yes`, `-y` | Non-interactive; accept safe defaults |
| `--force` | Overwrite conflicts without prompting |
| `--no-install` | Skip `npm install` in mcp/delegation |
| `--no-test` | Skip the MCP test run |
| `--no-git` | Skip `git init` |
| `--model <id>` | Set model for dispatched agents (default: keep current) |
| `--help`, `-h` | Usage |
| `--version`, `-v` | Print version |

## Wizard Flow

1. **Resolve target** — from arg or prompt; default cwd. Create if missing.
2. **Scan conflicts** — list existing `.opencode/`, `opencode.json`,
   `mcp/`, `DELEGATE_CONFIG.json`, `.gitignore`.
3. **Conflict policy** — if conflicts and not `--force`, prompt
   `merge / overwrite / abort`:
   - *merge*: keep user files; add missing factory files.
   - *overwrite*: back up each replaced file to `<name>.bak-<timestamp>`,
     then write the factory version.
   - *abort*: exit 1, change nothing.
4. **Copy assets** — `.opencode/**`, `mcp/delegation/**` (excluding
   `node_modules`), `DELEGATE_CONFIG.json`. Does **not** copy the factory's
   root `package.json` (it would clobber the user's).
5. **Merge `opencode.json`** — deep-merge the factory's `mcp.delegation`
   block and `agent.*` definitions into the user's file; preserve all
   user-owned keys. If `--model` is given, set it on dispatched agents;
   otherwise keep the file's existing model.
6. **Merge `.gitignore`** — append only missing lines.
7. **Install** — `npm install` in `mcp/delegation` (unless `--no-install`).
8. **Test** — run the MCP test suite (unless `--no-test`); surface failures
   but don't hard-fail the scaffold.
9. **Git** — `git init` only if no `.git` (unless `--no-git`).
10. **Next steps** — print `opencode serve`, `opencode`, and the demo prompt.

## Module Boundaries

- `bin/cli.mjs` — shebang, wires modules, sets exit code. No logic.
- `lib/cli.mjs` — `parseArgs(argv)` → options object; `--help`/`--version`.
- `lib/merge.mjs` — pure: `deepMerge(base, overlay)`, `mergeGitignore(text, lines)`,
  `detectConflicts(targetDir, assetList)`. No disk I/O; unit-tested directly.
- `lib/scaffold.mjs` — file ops: `copyAsset`, `backup`, `writeIfNeeded`.
  FS injected or over a passed root so tests can use a temp dir.
- `lib/wizard.mjs` — readline prompts; delegates to merge/scaffold.

## Error Handling

- Missing target dir → create it; failure → clear message, exit 1.
- `npm install` failure → report, keep copied files, exit 1 with guidance.
- Test failure → warn, continue (scaffold already succeeded).
- Ctrl-C during wizard → exit 130, no partial writes beyond what was already
  backed up.
- Never delete user files without a backup.

## Testing

- Node built-in test runner (`node --test`).
- Unit: `merge` (deep merge of nested agent maps, gitignore append, conflict
  detection), `cli` (flag parsing, help/version).
- Integration: scaffold into an OS temp dir; assert file tree, `opencode.json`
  merged, backup created on overwrite, `.gitignore` appended. Uses
  `--no-install --no-test --no-git`.
- Root `npm test` runs both the CLI suite and `mcp/delegation` suite.

## Publish Steps (execution)

1. Add `LICENSE` (MIT, Walid Mostafa) to local repo from the existing remote.
2. Add `README.md` with install/usage.
3. Implement CLI + tests; `npm test` green.
4. `npm pack --dry-run` to confirm tarball contents.
5. Reconcile history: create/commit on `main` against the remote's single
   LICENSE commit (unrelated histories — may require `--allow-unrelated-histories`
   or a force-push; decide at execution, LICENSE preserved either way).
6. `git remote add origin https://github.com/walidmoustafa2077/let-me-code.git`.
7. `gh auth login` (user action) → push `main`.
8. Verify: `npx github:walidmoustafa2077/let-me-code --help` from a clean dir.
