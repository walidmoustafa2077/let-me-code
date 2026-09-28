# INTENT

## Goal
Add a `--version` CLI flag to the delegation MCP server so that
`node mcp/delegation/src/index.ts --version` prints the version read from
`mcp/delegation/package.json` and exits with code 0.

## Constraints
- Keep the existing "exactly seven MCP tools" contract intact. No eighth tool may be registered.
- The version MUST be read from `mcp/delegation/package.json` at runtime; it must not be hardcoded.
- Existing behaviour (stdio MCP server startup with no flags) must be unchanged.
- ESM + TypeScript, run via `node src/index.ts` (Node native TS stripping). Tests use `node --test`.
- All existing tests in `mcp/delegation/test/` must still pass.
- Host environment is Windows / PowerShell.

## Success Criteria
1. `node mcp/delegation/src/index.ts --version` writes the version value from `mcp/delegation/package.json` to stdout and exits 0.
2. When `--version` is passed, no stdio MCP transport is connected (the process terminates immediately).
3. An automated test exists that spawns the CLI with `--version`, asserts stdout matches the version from `mcp/delegation/package.json`, and asserts exit code 0.
4. `node --test` (from `mcp/delegation`) passes, including the pre-existing test asserting exactly seven v1 tools.
5. No regression: running with no args still starts the stdio server.

## Assumptions (autonomous mode - no human available)
- "the delegation MCP" means the server at `mcp/delegation`.
- "prints the version" means the raw version string (e.g. `0.1.0`) followed by a newline on stdout, no `v` prefix, and nothing else on stdout.
- The flag is handled in the CLI entry path before `server.connect(...)`.
- "read from package.json" means resolved relative to the source file (not `process.cwd()`), so the flag works regardless of the caller's working directory.
- Passing `--version` must not require the warm opencode server or any network access.
