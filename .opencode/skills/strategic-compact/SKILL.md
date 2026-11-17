---
name: strategic-compact
description: Use when a long session has accumulated research, exploration, or debugging context and is approaching a phase change - suggests manual /compact (or opencode's session compaction) at logical task boundaries instead of letting arbitrary auto-compaction discard implementation context mid-task. Triggers on long sessions, context growth, token pressure, phase transitions from exploration to implementation, or finishing a milestone.
---

# Strategic Compact Skill

Suggests manual context compaction at strategic points in your workflow rather than relying on arbitrary auto-compaction.

## Why Strategic Compaction?

Auto-compaction triggers at arbitrary points:

- Often mid-task, losing important context
- No awareness of logical task boundaries
- Can interrupt complex multi-step operations

Strategic compaction at logical boundaries:

- **After exploration, before execution** - Compact research context, keep implementation plan
- **After completing a milestone** - Fresh start for next phase
- **Before major context shifts** - Clear exploration context before different task

## How It Works

The `strategic-compact` plugin tracks Edit/Write tool calls and:

1. **Tracks tool calls** - Counts file-modifying tool invocations per session
2. **Threshold detection** - Suggests at a configurable threshold (default: 50 calls)
3. **Periodic reminders** - Reminds every 25 calls after the threshold
4. **Toast notification** - Surfaces a non-blocking TUI toast at each boundary

The original Claude Code version used a `PreToolUse` hook running
`suggest-compact.sh`. In opencode this is implemented as a plugin
(`~/.config/opencode/plugins/strategic-compact.ts`) because opencode has no
`PreToolUse` shell hook; the plugin hooks `tool.execute.before` instead.

## Configuration

Environment variables:

- `COMPACT_THRESHOLD` - Tool calls before first suggestion (default: 50)
- `COMPACT_REMINDER_INTERVAL` - Calls between follow-up reminders (default: 25)

The plugin is auto-discovered from `~/.config/opencode/plugins/`, so no
`opencode.json` entry is needed. If you ever move it out of that directory,
register it explicitly in `plugin` and pass options instead:

```json
{
  "plugin": [
    ["file:///absolute/path/to/strategic-compact.ts", { "threshold": 50, "reminderInterval": 25 }]
  ]
}
```

Do not both auto-discover and list the file; that loads it twice.

## Best Practices

1. **Compact after planning** - Once plan is finalized, compact to start fresh
2. **Compact after debugging** - Clear error-resolution context before continuing
3. **Don't compact mid-implementation** - Preserve context for related changes
4. **Read the suggestion** - The plugin tells you *when*, you decide *if*

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - Token optimization section
- `experimental.session.compacting` plugin hook - For state that survives compaction
