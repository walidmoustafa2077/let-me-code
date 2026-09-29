---
name: agent-dispatcher
description: Dispatch children through the delegation MCP with the right agent, context, and acceptance criteria.
---
# Agent Dispatcher
- One ticket per dispatch. Use `agent: "architect" | "senior-dev" | "qa-engineer" | "git-agent" | "challenger" | "minimalism-enforcer" | "tech-writer" | "general"`.
- Always pass `contextFiles`. Always state the acceptance criteria in the prompt.
- Run independent audits (qa-engineer, minimalism-enforcer) as separate children.
- Never use the native Task tool; nesting goes through `delegation_delegate_task`.
