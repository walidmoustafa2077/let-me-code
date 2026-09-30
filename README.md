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

## Requirements

- Node.js **>= 22.6** (the MCP relies on native TypeScript type-stripping)
- [opencode](https://opencode.ai) installed

## Development

```bash
npm test              # CLI suite + MCP suite
npm pack --dry-run    # inspect the published tarball
```

## License

MIT — see [LICENSE](./LICENSE).
