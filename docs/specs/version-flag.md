# Spec — `--version` CLI flag for the delegation MCP server

- **Date:** 2026-09-28
- **Status:** Approved (autonomous build)
- **Topic:** version-flag
- **Target package:** `mcp/delegation`
- **Runtime:** Node v24.x native TypeScript (`node src/index.ts`, no build) · win32 / PowerShell
- **Tickets:** `tickets/TICKET-1.md` (implementation), `tickets/TICKET-2.md` (verification)

---

## 1. Problem & Goal

The delegation MCP server (`mcp/delegation`) exposes a stdio MCP transport and can only be
inspected by starting it and running an MCP handshake. There is no lightweight way to ask the
package its version. Today the version is **hardcoded** as `"0.1.0"` in the `McpServer`
constructor, so it silently drifts from `mcp/delegation/package.json`.

**Goal:** `node mcp/delegation/src/index.ts --version` prints the version value read from
`mcp/delegation/package.json` (raw, no `v` prefix) to **stdout**, writes a single trailing
newline, and exits with code **0** — without connecting the stdio transport, without network
access, and without requiring a warm `opencode serve` instance. Separately, the version reported
to MCP clients via the `McpServer` constructor is read from `package.json` at runtime instead of
being hardcoded.

**Success looks like:** any caller (human shell, script, CI) from *any* working directory can run
`node <abs>/mcp/delegation/src/index.ts --version` and receive exactly the package version.

## 2. Approach (chosen)

Introduce a dedicated module `mcp/delegation/src/version.ts` that owns version resolution and
CLI-flag interpretation, then intercept `--version` in the existing bottom-of-file entrypoint
guard in `src/index.ts` **before** `server.connect(...)` is ever reached.

Chosen because:
- The entrypoint already has a single guarded dispatch site; adding one `if` there keeps the
  change tiny and reviewable.
- Resolving via `import.meta.url` (not `process.cwd()`) makes the flag cwd-independent, which
  matches how MCP servers are launched (by absolute path).
- A pure, exported helper is trivially unit-testable without spawning a process.

**Rejected alternatives:**
- *Parse `--version` inside `main()`.* Rejected: `main()` is async and constructs the server;
  the flag must short-circuit before any transport/server work and must be testable in isolation.
- *Read the version from `process.cwd()/package.json`.* Rejected: breaks when the process is
  launched from another directory (the normal MCP launch mode).
- *Hardcode a second copy / inject at build time.* Rejected: no build step exists (Node native TS
  stripping); a second copy reintroduces drift.
- *Register an eighth MCP tool to report the version.* Rejected outright: the exactly-seven-tools
  contract is inviolable (see CONSTRAINTS.md). The version is a **CLI concern**, not a tool.

## 3. CLI Contract

**Invocation:**

```
node mcp/delegation/src/index.ts --version
```

**Behaviour:**

| Aspect | Contract |
|---|---|
| stdout | The raw version string followed by exactly one `\n`. Example: `0.1.0\n`. Nothing else. |
| stderr | Nothing on success. (Error paths may write a message; see §6.) |
| exit code | `0` on success. |
| side effects | None. No stdio transport connected. No HTTP request. No file written. No MCP handshake. |
| `v` prefix | **None.** Output is `0.1.0`, not `v0.1.0`. |
| cwd | Irrelevant. Correct regardless of the caller's working directory. |
| flag precedence | If `--version` is present anywhere in `argv`, it wins: print version and exit. |

**Flag accepted:** `--version` only. (`-v` is a **non-goal**; see §8.)

## 4. Interfaces

All new symbols live in `mcp/delegation/src/version.ts` (ESM, TypeScript, `.ts` import
extensions required).

```ts
/**
 * Read the `version` field from the package manifest that owns this source file.
 *
 * Resolution is relative to THIS module's location (import.meta.url), walking up to the
 * containing package.json; it MUST NOT depend on process.cwd().
 *
 * @param startDir Optional override for the directory to begin resolution from.
 *                 Defaults to the directory of this module (src/).
 * @returns The exact `version` string from package.json (no normalisation, no `v` prefix).
 * @throws If package.json cannot be read, is not valid JSON, or has a non-string `version`.
 */
export function readPackageVersion(startDir?: string): string;

/**
 * If `--version` is present in argv, write the package version to stdout and return true;
 * otherwise do nothing and return false.
 *
 * On success output is `${readPackageVersion()}\n` to stdout, nothing to stderr.
 * Does not call process.exit (the caller owns exit); returns true so the entrypoint can exit 0.
 *
 * @param argv Argument list *excluding* node and the script path. Defaults to process.argv.slice(2).
 * @returns true when `--version` was handled; false otherwise.
 */
export function maybePrintVersion(argv?: string[]): boolean;
```

**Wiring in `mcp/delegation/src/index.ts`:**

1. Import `readPackageVersion` and `maybePrintVersion` from `./version.ts`.
2. Replace the hardcoded literal in the constructor:
   `new McpServer({ name: "delegation", version: readPackageVersion() })`.
3. In the existing bottom entrypoint guard, before `main()`:

```ts
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("mcp/delegation/src/index.ts")) {
  if (maybePrintVersion()) {
    process.exit(0);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

`listToolNames()` and the `TOOL_NAMES` array are **untouched**; exactly seven tools remain.

## 5. Data Flow

**`--version` path (happy path):**

1. `node src/index.ts --version` starts; `process.argv = [node, <abs>/mcp/delegation/src/index.ts, "--version"]`.
2. Entrypoint guard matches on `argv[1]` ending `mcp/delegation/src/index.ts`.
3. `maybePrintVersion(["--version"])` sees `--version`, calls `readPackageVersion()`.
4. `readPackageVersion()` resolves `../package.json` from `import.meta.url` (i.e. `mcp/delegation/package.json`), reads + parses it, returns `"0.1.0"`.
5. Helper writes `"0.1.0\n"` to stdout and returns `true`.
6. Entrypoint calls `process.exit(0)`. `main()` and `server.connect(new StdioServerTransport())` never run.

**No-arg path (unchanged):**

1. Guard matches; `maybePrintVersion([])` returns `false` (no write).
2. `main()` runs: `createServer()` builds the server (now reading the real version for its
   identity metadata) and connects `StdioServerTransport`. Behaviour otherwise identical to today.

## 6. Edge Cases & Errors

| Case | Handling |
|---|---|
| `argv` contains `--version` alongside other args (e.g. `--version --foo`) | Print version, exit 0. Flag wins. |
| Caller's cwd is arbitrary (repo root, `C:\`, a temp dir) | Works — resolution is anchored to `import.meta.url`. |
| `--version` with no package.json / unreadable file / invalid JSON / non-string `version` | `readPackageVersion()` throws; the failure surfaces on **stderr** and the process exits **non-zero** (never a false `0`). No partial stdout. |
| Trailing whitespace / CRLF in the JSON | JSON.parse normalises; the returned string is written as-is plus `\n`. |
| Windows path separators in `argv[1]` | Existing guard already normalises `\`→`/`; unchanged. |
| `argv[1]` undefined (e.g. `node -e`) | Guard is falsy; no interception. Module import must have zero side effects. |

## 7. Stdout / Stderr Discipline

- **stdout** is reserved for machine-readable output. On `--version` success it contains *only*
  `0.1.0\n`. No banner, no `v`, no extra newline, no logging.
- **stderr** is silent on success. Diagnostics (if any) belong on stderr so that
  `VERSION=$(node ... --version)` in a shell captures a clean value.
- The helper must not use `console.log` on the no-arg path (that would corrupt an MCP stdio
  stream if ever invoked in-process before transport setup). Only the explicit `--version` branch
  writes to stdout.

## 8. Non-Goals

- Adding an **eighth MCP tool** (e.g. `engine_version`). Explicitly forbidden.
- Supporting `-v`, `version` (subcommand), `--help`, or any other CLI flag.
- Changing the stdio MCP transport startup, the seven registered tools, or their schemas.
- Publishing, tagging, or modifying `package.json`'s version or the workspace root package.
- Reading the version from a git tag, build artifact, environment variable, or network source.
- A `--json` output mode.

## 9. Test Strategy

Proven by `mcp/delegation/test/version.test.ts` (added by TICKET-2), run with `node --test` from
`mcp/delegation`:

1. **Unit:** `readPackageVersion()` equals the `version` field read from
   `mcp/delegation/package.json` (compare against the file, not a literal, so it cannot rot).
2. **Subprocess (the real contract):** spawn `node src/index.ts --version` as a child process;
   assert `stdout === "<pkgVersion>\n"` (exact equality — catches extra output), `exit code === 0`,
   and `stderr === ""`.
3. **cwd-independence:** run the same spawn with `cwd` set to a different directory and assert the
   same stdout/exit.
4. **Regression (no-arg):** start `node src/index.ts` with no args and assert the process does
   **not** exit immediately (i.e. the stdio server is up and waiting), then terminate it cleanly.
5. **Tool-contract regression:** the pre-existing `test/tools.test.ts`
   ("exactly the seven v1 tools") must still pass unmodified.

A red flag is treated as a failure: any test that asserts a hardcoded `"0.1.0"` instead of reading
`package.json`, or that weakens the seven-tools assertion, does not satisfy this spec.
