---
name: configure-delegation
description: Read or update DELEGATE_CONFIG.json (engine, serverUrl, defaultModel, timeouts, allowedAgents) for the delegation engine.
---

# Configure Delegation

The engine reads `DELEGATE_CONFIG.json` at the repo root:

```json
{
  "engine": "opencode",
  "serverUrl": "http://localhost:4096",
  "defaultModel": "ollama/deepseek-v4.1-flash:cloud",
  "timeouts": { "healthMs": 5000, "messageMs": 900000 },
  "allowedAgents": ["architect", "senior-dev", "qa-engineer", "general"]
}
```

To change behavior: edit this file, then confirm with `delegation_engine_status` (it reports
`server_up`, `version`, and `agent_roster`). Only `architect`, `senior-dev`, `qa-engineer`, and
`general` are permitted children.
