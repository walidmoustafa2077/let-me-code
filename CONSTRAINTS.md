# CONSTRAINTS — delegation MCP (`mcp/delegation`)

Hard invariants for the `--version` feature. Every constraint below is **checkable**: a reviewer or
CI step can decide pass/fail without reading the original chat. A violation blocks the ticket.

## C1 — Exactly seven MCP tools (inviolable)

`listToolNames()` MUST return exactly, and only, these seven names:

`delegate_task`, `engine_status`, `engine_abort`, `board_read`, `board_update`, `ticket_write`, `ticket_read`

- **No eighth tool may be registered** for any reason — including a tool that would report the
  version. Version reporting is a CLI concern, never a tool.
- **Check:** `mcp/delegation/test/tools.test.ts` test *"the server registers exactly the seven v1
  tools"* passes unmodified. `TOOL_NAMES` is unchanged and `registerTool` is called exactly seven
  times.

## C2 — Version is read, never hardcoded

- The version string MUST be obtained at runtime from `mcp/delegation/package.json`.
- The literal `"0.1.0"` MUST NOT appear in `mcp/delegation/src/**` as a version value.
- Resolution MUST be anchored to the source file (`import.meta.url` / `fileURLToPath`), **not**
  `process.cwd()`.
- **Check:** `grep -n '"0\.1\.0"' mcp/delegation/src` returns no version literal. Changing the
  `version` field in `package.json` changes the `--version` output with no code edit.

## C3 — No-arg stdio startup is unchanged

- Running `node src/index.ts` with no arguments MUST still construct the server and connect
  `new StdioServerTransport()`, exactly as before.
- The `--version` interception MUST NOT alter the server, its tools, or the transport when the flag
  is absent.
- **Check:** no-arg spawn does not exit immediately and exposes the same seven tools over an
  `InMemoryTransport` round-trip.

## C4 — `--version` output contract

- stdout MUST be exactly the package version followed by one newline (`0.1.0\n`) — no `v` prefix,
  no banner, nothing else.
- stderr MUST be empty on success.
- Exit code MUST be `0` on success.
- **Check:** subprocess spawn asserts `stdout === pkgVersion + "\n"`, `stderr === ""`, `code === 0`.

## C5 — Existing tests keep passing

- All tests under `mcp/delegation/test/` MUST pass, including the pre-existing seven-tools
  assertion and the `ticket_write`/`ticket_read`/`board_update` round-trips.
- Test runner is the Node built-in: `node --test` (no Jest/Vitest, no new test dependency).
- **Check:** `node --test` from `mcp/delegation` exits `0` with every suite green.

## C6 — Runtime & module conventions

- ESM + TypeScript executed directly by Node's native type stripping: `node src/index.ts`. **No
  build step, no bundler, no `tsc` required to run.**
- Relative imports MUST include the `.ts` extension (e.g. `import { readPackageVersion } from
  "./version.ts"`).
- Do not add runtime dependencies for this feature; `node:fs`, `node:url`, `node:path`, and
  `node:process` suffice.
- **Check:** the entrypoint runs under Node v24.x with no compile/prebuild; imported specifiers end
  in `.ts`.

## C7 — Windows / cross-platform safety

- Path resolution MUST use `node:url` + `node:path` (`fileURLToPath`, `path.resolve`/`join`) so it
  is correct on `win32` and POSIX alike.
- No hardcoded `\` or `/` assumptions in the new code beyond the existing `argv[1]` normalisation.
- **Check:** the feature works when invoked with an absolute Windows path from PowerShell and from a
  different cwd.

## C8 — No unrelated edits

- Do not reformat, rename, or refactor code outside the version feature. The diff should touch only
  `src/version.ts`, `src/index.ts`, and (TICKET-2) `test/version.test.ts`.
- Do not modify `BOARD.md` (orchestrator-owned), `package.json` (except if a ticket explicitly says
  so), or the seven tool definitions.
- **Check:** `git diff --stat` shows only the expected files.

## C9 — No secrets, no network

- The `--version` path MUST perform no network I/O and require no warm `opencode serve` instance.
- No credentials, tokens, or environment secrets may be read or written for this feature.
- **Check:** `--version` succeeds with no server running and no env vars set.
