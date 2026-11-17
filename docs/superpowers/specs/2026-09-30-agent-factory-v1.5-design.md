# Agent Factory v1.5 — Per-Agent Model Configuration

**Status:** approved
**Depends on:** v1.4 (per-project `DELEGATE_CONFIG.json` resolution)

## Problem

Today every delegated job runs on a single model: `DELEGATE_CONFIG.json`
`defaultModel`, or a per-call `model` argument. There is no way to say
"architect runs on the cheap model, `senior-dev` on the strong one, and
`qa-engineer` may be overridden per call". A bad or unknown model string also
fails the whole job with no recovery.

## Goals

1. Give each agent its own **default model**, **fallback model**, and
   **allow-custom** policy.
2. Let a caller override the model **per call** when the agent permits it.
3. On a model-resolution failure (unknown provider/model), **retry the same
   message on the next candidate model** before giving up.
4. Keep every existing config field, tool output shape, and test contract intact.

## Non-goals

- No new MCP tools and no new fields on `engine_status` (frozen by
  `test/json-flag.test.ts`).
- No provider auto-discovery. The caller still owns provider registration in
  `opencode.json`.

## Configuration surface

New optional fields on `DelegateConfig`:

```jsonc
{
  "defaultModel": "gemini-proxy/flash",          // existing — global default
  "fallbackModel": "ollama/deepseek-v4.1-flash:cloud", // new — global fallback
  "allowCustomModel": true,                      // new — global per-call policy
  "agents": {                                    // new — per-agent overrides
    "senior-dev": {
      "model": "gemini-proxy/flash",
      "fallback": "ollama/deepseek-v4.1-flash:cloud",
      "allowCustom": true
    },
    "junior-dev": { "model": "ollama/deepseek-v4.1-flash:cloud", "allowCustom": false }
  },
  "allowedAgents": ["..."]                        // existing — still honored
}
```

```ts
export interface AgentModelConfig {
  model?: string;
  fallback?: string;
  allowCustom?: boolean;
}
```

### `agents` supersedes `allowedAgents` as the allowlist

When `agents` is non-empty, its keys **are** the allowlist. `allowedAgents` is
still read for backward compatibility and remains the fallback when `agents` is
empty or absent. This avoids a second source of truth while not breaking the
shipped v1.4 config.

## Model resolution

A new pure, exported helper keeps the precedence in one testable place:

```ts
export function resolveModels(
  cfg: DelegateConfig,
  agent: string,
  perCall?: string,
): { candidates: ModelRef[]; usedCustom: boolean };
```

Precedence:

1. **Per-call `model` present.** Allowed iff
   `cfg.agents?.[agent]?.allowCustom ?? cfg.allowCustomModel ?? true`.
   - allowed → `candidates = [parse(perCall)]`, `usedCustom = true`.
   - denied → throw `agent "X" does not allow a custom (per-call) model`.
2. **Otherwise** build candidates from, in order, undefined entries skipped and
   duplicates removed:
   1. `cfg.agents?.[agent]?.model`
   2. `cfg.defaultModel`
   3. `cfg.agents?.[agent]?.fallback`
   4. `cfg.fallbackModel`

   An empty candidate list means "omit `model`" so opencode's own
   `agent.<name>.model` applies.

`parseModel` moves from `spawn.ts` to `config.ts` (still exported, identical
behavior) so `resolveModels` and the spawn path share one parser.

## Dispatch with fallback

`delegateTask` now:

1. Computes the effective allowlist
   (`Object.keys(cfg.agents ?? {}).length ? Object.keys(cfg.agents!) : cfg.allowedAgents`)
   and rejects unlisted agents with the existing `allowlist` message.
2. Calls `resolveModels(cfg, args.agent, args.model)` once.
3. Iterates candidates on a **single session**: post the message with candidate
   `i`; on error, if a later candidate exists **and** the error looks like a
   model-resolution error, retry with candidate `i+1`; otherwise rethrow.

```ts
function isModelError(err: unknown): boolean {
  return /ProviderModelNotFoundError|Model not found|provider/i.test(String((err as Error)?.message));
}
```

`http.ts` currently throws `HTTP <status> <path>` without the body, which hides
`ProviderModelNotFoundError`. It will now read the response text and append a
truncated body:

```ts
if (!res.ok) {
  const body = await res.text().catch(() => "");
  throw new Error(`HTTP ${res.status} ${path}${body ? ` ${body.slice(0, 500)}` : ""}`);
}
```

The `HTTP <status> <path>` prefix is unchanged, so existing assertions hold.

## Validation and merge

`validateConfig` additionally rejects wrong types for the new fields:

- `fallbackModel` → string
- `allowCustomModel` → boolean
- `agents` → object; each entry an object with optional string `model`,
  optional string `fallback`, optional boolean `allowCustom`

`mergeConfig` shallow-merges `agents` (`{ ...base.agents, ...over.agents }`) and
`defaultConfig()` gains `agents: {}` and `allowCustomModel: true`.

## Testing

- New `mcp/delegation/test/agent-models.test.ts`: precedence order, dedup,
  custom-allowed / custom-denied, `agents`-as-allowlist, `allowedAgents`
  fallback, new-field validation, and a fallback retry where a fake client
  returns HTTP 500 for the first model and 200 for the second.
- `test/spawn.test.ts`: `parseModel` import repointed to `../src/config.ts`.
- Existing `config.test.ts`, `config-resolution.test.ts`, `json-flag.test.ts`,
  `version.test.ts`, `guardrails.test.ts` stay green.

## Rollout

- Version bump `0.1.0 → 0.2.0` in root `package.json`,
  `mcp/delegation/package.json`, and `lib/cli.mjs`.
- Root `DELEGATE_CONFIG.json` documents `fallbackModel` and an `agents` map.
- README gains a model-configuration section and a credits section thanking the
  vendored skill authors.
