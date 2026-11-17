---
name: async-unblocker
description: Handle a child that stalled, died, or returned blocked — diagnose from the log, escalate to the human, and never burn wall-clock waiting.
---

# Async Unblocker

The delegation engine now watches progress for you. A child that stops producing messages is
aborted, logged, and retried once in a fresh session. **If it stalls twice, you get
`status: "blocked"` with `stalled: true`.** Your job is to react, not to wait.

## Reading the result

| Result | What it means | What you do |
|---|---|---|
| `done` | Child finished and handed off | Check `artifacts` exist, then move on |
| `blocked` + `stalled: true` | No output for `stallMs` twice, aborted both times | **Stop.** Do not dispatch a third attempt |
| `blocked` (other) | Child hit a wall it could not pass | Read `summary`, surface it, move the ticket to **Blocked** |
| `needs-input` | Child needs a human answer | Surface `QUESTIONS_FOR_CLIENT.md`, pause |
| tool error / `delegate_task failed:` | Engine or server died before a session ran | Report it, check the engine, retry **once** |

## When something stalls

1. **Say so, immediately.** One line in the chat: which agent, which ticket, how long it was quiet,
   and the `session_id`. The human must never be the one who notices the silence.
2. **Read the log**, not your memory of it: newest file in `.delegation/logs/` matching the
   `session_id`, plus the `stalled` payload written on abort. That file holds the prompt, the
   baseline commit, and the moment it went quiet.
3. **Classify, do not guess:**
   - *No messages at all* → the session never started: model, provider, or server problem. Check
     `engine_status` and the server URL before touching the ticket.
   - *One message then silence* → the child is waiting on something: a permission prompt, a tool
     that never returns, or a question nobody answered.
   - *Many messages, then silence* → it looped on the same action or hit a wall it would not admit.
4. **Change the input before retrying.** A retry that repeats the prompt and the scope stalls again.
   Narrow the task, split the ticket, name the exact skill to load, or fix the missing context file.
   A third attempt with the same prompt is forbidden.
5. **Two stalls on one ticket → Blocked.** Record in `BOARD.md`: agent, `session_id`, quiet time,
   what was tried, what changed between attempts. Then tell the human one sentence plus the log path.
6. **Escalate with evidence:** symptom, root cause, action taken, what you need from them. Never
   "it failed" — always "it went quiet after X, I checked Y, I tried Z, a third attempt needs W".

## Limits you must respect

- Never auto-approve a permission prompt or a question the child asked on the human's behalf.
- Never restart work you cannot explain.
- Never retry the same stalled attempt twice.
- Never hide a stall behind a re-dispatch — the human sees the first one in the same message.
