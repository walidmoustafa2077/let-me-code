# let-me-code

An **agent factory** for [opencode](https://opencode.ai): a roster of
specialised subagents (architect, senior-dev, qa-engineer, git-agent,
tech-writer, …), a library of workflow skills, and a delegation MCP server
that orchestrates them. Bootstrap it into any project with one command.

## Quick start

```bash
# inside the project you want to run the factory in
npx github:walidmoustafa2077/let-me-code
```

The CLI copies the factory assets, merges `opencode.json`, installs the MCP
dependencies, and (optionally) initialises git. Then:

```bash
opencode serve --port 4096   # in one terminal
opencode                     # in another; talk to the Orchestrator
```

## What it installs

| Path | Purpose |
| --- | --- |
| `.opencode/agent/*` | The subagent roster |
| `.opencode/skills/*` | The skill library |
| `mcp/delegation/` | The delegation MCP server (TypeScript, run directly by Node) |
| `opencode.json` | MCP + agent wiring (merged into yours, never clobbered) |
| `DELEGATE_CONFIG.json` | Engine, server URL, timeouts, allowed agents |

## CLI

```
let-me-code [init] [target-dir] [options]

  -y, --yes           non-interactive; accept safe defaults
      --force         overwrite conflicts without prompting
      --no-install    skip npm install in mcp/delegation
      --no-test       skip the MCP test run
      --no-git        skip git init
      --model <id>    model for dispatched agents
  -h, --help          usage
  -v, --version       print version
```

Existing files are never destroyed without a backup (`<name>.bak-<timestamp>`).

## Model configuration

The model each delegated agent runs on is resolved from `DELEGATE_CONFIG.json`.
Every field is optional; the most specific one wins.

```jsonc
{
  "defaultModel": "gemini-proxy/flash",                 // used by any agent without its own
  "fallbackModel": "ollama/deepseek-v4.1-flash:cloud",  // last resort for every agent
  "allowCustomModel": true,                             // may a caller pass a per-call model?
  "agents": {
    "senior-dev": {
      "model": "gemini-proxy/flash",                    // this agent's default
      "fallback": "ollama/deepseek-v4.1-flash:cloud",   // this agent's fallback
      "allowCustom": true                               // may this agent be overridden per call?
    },
    "junior-dev": { "model": "ollama/deepseek-v4.1-flash:cloud", "allowCustom": false }
  }
}
```

Resolution order, per call: **agent `model` → `defaultModel` → agent `fallback`
→ `fallbackModel`**. If `agents` is present its keys are the allowlist;
otherwise `allowedAgents` is used. Passing a `model` to `delegate_task` is
rejected unless the agent (or `allowCustomModel`) allows it. On an
*unknown-model* error the job retries the same message against the next
candidate model, so a stale provider name degrades instead of failing.

## Requirements

- Node.js **>= 22.6** (the MCP relies on native TypeScript type-stripping)
- [opencode](https://opencode.ai) installed

## Development

```bash
npm test              # CLI suite + MCP suite
npm pack --dry-run    # inspect the published tarball
```

## Acknowledgements

This project stands on other people's work. The skill library under
`.opencode/skills/` and `vendor/` is curated from these open sets, and we thank
their authors:

- **[superpowers](https://github.com/obra/superpowers)** — the process-skill
  backbone (brainstorming, systematic-debugging, TDD, planning).
- **[ponytail](https://github.com/DietrichGebert/ponytail)** — the minimalism /
  YAGNI review discipline.
- **matt-skills** — engineering workflow skills
  ([DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)).
- **[delegate-skills](https://github.com/amElnagdy/delegate-skills)** and the
  **addy-agent-skills** set — delegation and quality-gate skills.

Built with [opencode](https://opencode.ai) and the
[Model Context Protocol SDK](https://github.com/modelcontextprotocol). See
`skills-inventory/` for the full provenance and cross-set conflict analysis.

## License

MIT — see [LICENSE](./LICENSE).
