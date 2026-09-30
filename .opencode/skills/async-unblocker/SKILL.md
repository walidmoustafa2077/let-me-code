---
name: async-unblocker
description: Diagnose and remediate hung or looping child sessions, timeout management, and ticket escalation.
---
# Async Unblocker
When a child session hangs, loops, or times out, do this:
1. Check `engine_status` for active sessions and their runtime.
2. Read the newest file in `.delegation/logs/` for the stalled child — identify the loop or wait.
3. Classify the cause: repeated dispatch, hung permission prompt, waiting on input, or timeout.
4. Remediate once:
   - Looping on the same action → abort the session and re-dispatch with narrower scope.
   - Hung permission → surface the prompt to the human; do not auto-approve.
   - Genuine timeout → extend the timeout and re-run, or split the ticket smaller.
5. If the ticket cannot proceed, move it to **Blocked** and record why.
6. Escalate to the human partner with: symptom, root cause, action taken, and what you need.
Never restart work you cannot explain; never silently retry more than once.
