import { spawn } from "node:child_process";
import { loadConfig, repoRoot } from "../mcp/delegation/src/config.ts";
import { OpenCodeClient } from "../mcp/delegation/src/http.ts";
import { delegateTask } from "../mcp/delegation/src/spawn.ts";

const root = repoRoot();
const cfg = loadConfig(root);
const client = new OpenCodeClient(cfg);

async function ensureServer() {
  try {
    const h = await client.health();
    if (h.healthy) return null;
  } catch {
    /* not up */
  }
  const proc = spawn("opencode", ["serve", "--port", String(new URL(cfg.serverUrl).port)], {
    cwd: root,
    stdio: "ignore",
    shell: true,
  });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const h = await client.health();
      if (h.healthy) return proc;
    } catch {
      /* keep waiting */
    }
  }
  throw new Error("server did not become healthy within 30s");
}

const started = await ensureServer();
try {
  const result = await delegateTask(root, cfg, client, {
    agent: "general",
    prompt: "Create a file named SMOKE_OK.txt at the repo root containing exactly the text: hello factory. Then stop.",
  });
  console.log(JSON.stringify({
    status: result.status,
    changed_files: result.changed_files,
    session_id: result.session_id,
    log_path: result.log_path,
  }, null, 2));
} finally {
  if (started) started.kill();
}
