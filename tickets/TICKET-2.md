# TICKET-2: Verify `--version` via subprocess and guard the no-arg regression

- depends_on: TICKET-1

## Deliverable

Add the verification suite `mcp/delegation/test/version.test.ts` (Node `node:test` + `node:assert/strict`) proving TICKET-1's implementation, per `docs/specs/version-flag.md` §9 and `CONSTRAINTS.md`.

**Tests to implement:**
1. **Unit:** `readPackageVersion()` equals the `version` field read from `mcp/delegation/package.json` (read the file in the test — do **not** hardcode `"0.1.0"`).
2. **Subprocess contract:** `spawnSync(process.execPath, ["src/index.ts", "--version"], { cwd: <mcp/delegation> })`; assert `status === 0`, `stdout === pkgVersion + "\n"` (exact), and `stderr === ""`.
3. **cwd-independence:** repeat (2) with `cwd` set to a different directory and an absolute script path; same assertions.
4. **No-arg regression:** spawn `node src/index.ts` with no args and assert the process does **not** exit immediately (still running after a short delay, i.e. stdio server is up); then terminate it cleanly.
5. **Tool contract regression:** confirm the pre-existing seven-tools assertion still passes (do not modify `tools.test.ts`).

**Files:** Create `mcp/delegation/test/version.test.ts` only.

## Test

- Run `node --test` from `mcp/delegation`; **all** suites green, including `tools.test.ts` and the new `version.test.ts`.
- Report the raw summary. If any test fails, report `blocked` with exact output — never a false pass.
- Confirm `git diff --stat` touches only `test/version.test.ts` (plus TICKET-1's files).
