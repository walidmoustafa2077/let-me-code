---
name: e2e-and-browser-testing
description: Playwright E2E testing workflows, browser automation, and integration test patterns.
---
# E2E and Browser Testing
- Prefer Playwright for end-to-end coverage; drive real user flows, not implementation details.
- Run headless in CI (`--headless`), headed locally only when debugging.
- Encapsulate selectors and actions in Page Objects; never repeat raw selectors across specs.
- Select by role, label, or `data-testid`; avoid brittle CSS or XPath coupled to layout.
- Assert on user-visible outcomes (text, URL, state), not internal calls.
- Capture artifacts on failure: trace, screenshot, and video; keep traces on retry.
- Isolate tests: seed own state, clean up after, never depend on execution order.
- For flaky tests, find the race or missing await — do not add blind sleeps.
- Record the exact command run and its output as verification evidence.
