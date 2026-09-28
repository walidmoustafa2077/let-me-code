# TICKET-1: Add runtime version reader and `--version` CLI interception

- depends_on: none

## Deliverable

Implement the `--version` flag and replace the hardcoded package version, per `docs/specs/version-flag.md` and `CONSTRAINTS.md`.

**Files:**
- Create: `mcp/delegation/src/version.ts`
- Modify: `mcp/delegation/src/index.ts` (constructor version + entrypoint interception only)

**Interfaces (exact):**

```ts
// mcp/delegation/src/version.ts
export function readPackageVersion(startDir?: string): string;
export function maybePrintVersion(argv?: string[]): boolean;
```

- `readPackageVersion()` resolves the owning `package.json` relative to **this module** via
  `import.meta.url` + `fileURLToPath`, walking up from `startDir` (default: `src/`), and returns
  the raw `version` string. It MUST NOT use `process.cwd()`. It throws if the manifest is
  missing/unreadable, is invalid JSON, or `version` is not a string.
- `maybePrintVersion(argv = process.argv.slice(2))` returns `false` and writes nothing when
  `--version` is absent; otherwise it writes `${readPackageVersion()}\n` to **stdout only** and
  returns `true`. It does not call `process.exit`.

**Wiring in `src/index.ts`:**
1. `import { readPackageVersion, maybePrintVersion } from "./version.ts";`
2. `new McpServer({ name: "delegation", version: readPackageVersion() })` (remove the `"0.1.0"` literal).
3. In the existing bottom entrypoint guard, before `main()`:
   ```ts
   if (maybePrintVersion()) process.exit(0);
   ```
   so the stdio transport is never connected on `--version`.

**Must NOT:** add or remove any MCP tool; touch `TOOL_NAMES`, `listToolNames`, tool schemas, or the no-arg `main()`/`StdioServerTransport` path beyond the guard above.

## Test

- `node mcp/delegation/src/index.ts --version` prints exactly `<package.json version>\n` to stdout, empty stderr, exit code 0 — from any cwd.
- `grep '"0.1.0"' mcp/delegation/src` returns no version literal.
- Existing `node --test` suite (esp. the exactly-seven-tools assertion) still passes.
- Verified against `CONSTRAINTS.md` C1, C2, C3, C4, C6, C7. Formal subprocess coverage lands in TICKET-2.
