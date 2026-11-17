---
name: test-driven-development
description: Write a failing verification test first, make it pass, and commit the passing suite for the ticket under review.
---

# Test-Driven Development

1. Write a test that expresses the ticket's acceptance criterion. Run it and watch it **fail**.
2. If it already passes, the test is wrong or the work is already done — investigate.
3. Make the test pass with the smallest change (coordinate with the implementation, do not weaken the test).
4. Run the full suite (`npm test` / `node --test`) and confirm green.
5. Commit the suite on its own: `test(TICKET-N): add verification suite`.

Never edit `src/**`. Tests live under `tests/**`.
