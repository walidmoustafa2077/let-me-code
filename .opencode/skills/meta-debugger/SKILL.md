---
name: meta-debugger
description: Diagnose a stuck or looping factory run from logs and engine status, not from guesswork.
---
# Meta-Debugger
When the human asks "why is this stuck/slow?", do this:
1. `delegation_engine_status` — is the server up? which children are active?
2. Read the newest files in `.delegation/logs/` — the child's full transcript is there.
3. Identify the loop: a repeated dispatch, a hung permission, a child waiting on input.
4. Report the root cause in one paragraph and the concrete unblock (cancel, re-dispatch, escalate).
Never silently restart work you cannot explain.
