# INTENT — Project Audit, PowerShell Enforcement, Server Auto-Start, Agent Sync & Senior-Junior Delegation

- **Date:** 2026-10-03
- **Status:** Active
- **Target:** Full repository (opencode.json, global config, mcp/delegation, CLI scaffold, agent definitions)

## Goal

Audit the project and enforce Windows PowerShell without PTY, implement auto-start of the opencode server in the project directory when offline, synchronize all agent definitions across all config files and templates, and empower Senior Dev to evaluate tickets and delegate scoped tasks/boilerplate to Junior Dev.

## Scope & Deliverables

1. **PowerShell & No PTY Enforcement**:
   - In `opencode.json` and CLI templates (`lib/cli.mjs`, `lib/merge.mjs`): set `"shell": "powershell"`.
   - In user global config (`~/.config/opencode/opencode.json`): remove `"opencode-pty"` from the `plugin` list.
   - Enforce PowerShell execution without PTY across agent instructions and workflows.

2. **Auto-Start Server in Project Directory**:
   - In `mcp/delegation` (`src/http.ts` / `src/spawn.ts` / `src/index.ts`): if `health()` detects the server is offline (e.g. `http://localhost:4096`), automatically spawn `opencode serve --port 4096` in the background rooted at `projectRoot` and wait until healthy.
   - Keep auto-start robust, non-blocking for child sessions, and safe for headless/background runs.

3. **Complete & Synchronized Agent Configuration**:
   - Audit all subagents (`architect`, `senior-dev`, `junior-dev`, `qa-engineer`, `git-agent`, `challenger`, `minimalism-enforcer`, `tech-writer`, `devobs`, `visualizer`, `general`, `orchestrator`).
   - Ensure every agent is declared and consistent across:
     - `.opencode/agent/<name>.md`
     - `opencode.json` (`agent` section, permissions, tools)
     - `DELEGATE_CONFIG.json` (`agents` map and `allowedAgents`)
     - `mcp/delegation/src/config.ts` (`defaultConfig().allowedAgents`)
     - CLI scaffolding (`lib/merge.mjs`, `test/merge.test.mjs`)

4. **Senior Dev to Junior Dev Delegation**:
   - Update `.opencode/agent/senior-dev.md` to explicitly instruct Senior Dev to evaluate tickets for decomposability and delegate mechanical boilerplate, helper routines, and isolated scaffolding to `junior-dev` via `delegation_delegate_task` (`agent: "junior-dev"`).
   - Verify Senior Dev has permissions to dispatch `junior-dev` and Junior Dev has bounded permissions to implement and test without committing.

5. **Test Suite & Verification**:
   - Add comprehensive tests for server auto-start, config synchronization, powershell setting, and junior-dev delegation.
   - All tests pass via `npm test`.

## Constraints

- Backward compatibility: do not break existing MCP tool names or schemas.
- Node.js ESM + TypeScript with native type stripping (`node --test`).
- Windows PowerShell 5.1 compatibility without bash/pty dependencies.
- Zero secrets committed.

## Success Criteria

1. `opencode.json` contains `"shell": "powershell"` and global config excludes `opencode-pty`.
2. `mcp/delegation` auto-spawns `opencode serve --port 4096` if server is down when a request or health check runs.
3. All agents are uniformly recognized in `opencode.json`, `DELEGATE_CONFIG.json`, and `config.ts`.
4. `.opencode/agent/senior-dev.md` contains explicit junior-dev delegation directives.
5. Full test suite passes (`npm test`).
