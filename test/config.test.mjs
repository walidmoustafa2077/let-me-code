import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));
const skillsDir = join(root, ".opencode", "skills");
const skillNames = readdirSync(skillsDir).filter((entry) =>
  statSync(join(skillsDir, entry)).isDirectory()
);

function frontmatter(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  let key = null;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      fields[key] = kv[2].replace(/^["']|["']$/g, "").trim();
      continue;
    }
    // a wrapped or block value: `description:` followed by indented continuation lines
    if (key && /^\s+\S/.test(line)) {
      fields[key] = `${fields[key] ? `${fields[key]} ` : ""}${line.trim()}`.trim();
    }
  }
  return fields;
}

// Folder names that intentionally differ from the skill name. Permission keys must always use the
// frontmatter name, because that is what the `skill` tool resolves.
const ALIASES = {
  "resume-writer": "resume",
  "taste-skill": "design-taste-frontend",
};

const declaredSkillNames = new Map();

test("every skill folder declares a name, and a mismatch is a declared alias", () => {
  for (const folder of skillNames) {
    const fields = frontmatter(join(skillsDir, folder, "SKILL.md"));
    assert.ok(fields, `${folder}: SKILL.md has no frontmatter`);
    assert.ok(fields.name, `${folder}: frontmatter needs a name`);
    assert.ok(fields.description, `${folder}: frontmatter needs a description`);
    const expected = ALIASES[folder] ?? folder;
    assert.equal(fields.name, expected, `${folder}: frontmatter name must be "${expected}"`);
    declaredSkillNames.set(folder, fields.name);
  }
});

test("no two skills share a name", () => {
  const names = new Set();
  for (const folder of skillNames) {
    const name = declaredSkillNames.get(folder);
    assert.ok(!names.has(name), `duplicate skill name "${name}" (folder ${folder})`);
    names.add(name);
  }
});

test("agent skill allowlists only name skills that exist", () => {
  const config = readJson("opencode.json");
  const available = new Set(declaredSkillNames.values());
  for (const [id, agent] of Object.entries(config.agent ?? {})) {
    const grants = agent.permission?.skill ?? agent.skill;
    if (!grants) continue; // no map at all means the agent inherits every skill, by design for `general`
    for (const skill of Object.keys(grants)) {
      if (skill === "*") continue;
      assert.ok(
        available.has(skill),
        `agent "${id}" allows "${skill}", which no .opencode/skills/*/SKILL.md declares`
      );
    }
    assert.equal(grants["*"], "deny", `agent "${id}" must default-deny unlisted skills`);
  }
});

test("every dispatchable agent loads a skill before it acts", () => {
  const delegate = readJson("DELEGATE_CONFIG.json");
  const agentDir = join(root, ".opencode", "agent");
  const mdAgents = readdirSync(agentDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => entry.slice(0, -3));

  for (const id of Object.keys(delegate.agents ?? {})) {
    // `general` is a built-in agent customised in opencode.json only, with no file of its own.
    assert.ok(mdAgents.includes(id) || readJson("opencode.json").agent?.[id], `DELEGATE_CONFIG.json names "${id}" with no agent definition`);
  }

  for (const id of mdAgents) {
    const text = readFileSync(join(agentDir, `${id}.md`), "utf8").replace(/^\uFEFF/, "");
    assert.match(text, /^## Step 0\b/m, `agent "${id}" has no "## Step 0" skill rule`);
    assert.match(text, /`skill`\s+tool|`skill: /, `agent "${id}" never names the skill it must load`);
    assert.match(text, /skills:/, `agent "${id}" never asks for the skills: line in its HANDOFF`);
  }
});

test("the delegation budgets keep a stall watchdog well under the message ceiling", () => {
  const { timeouts } = readJson("DELEGATE_CONFIG.json");
  assert.equal(typeof timeouts.stallMs, "number", "DELEGATE_CONFIG.json must set timeouts.stallMs");
  assert.ok(timeouts.stallMs > 0 && timeouts.stallMs < timeouts.messageMs, "stallMs must be shorter than messageMs");
});

test("the skill manifest documents every vendored skill", () => {
  const manifest = readFileSync(join(root, "skills-inventory", "SKILLS.md"), "utf8");
  for (const folder of skillNames) {
    assert.match(manifest, new RegExp(`\\b${folder}\\b`), `skills-inventory/SKILLS.md never mentions "${folder}"`);
  }
});

test("delegation agent map stays inside the configured roster", () => {
  const config = readJson("opencode.json");
  const delegate = readJson("DELEGATE_CONFIG.json");
  const declared = Object.keys(config.agent ?? {});
  for (const id of Object.keys(delegate.agents ?? {})) {
    assert.ok(declared.includes(id), `DELEGATE_CONFIG.json names agent "${id}" with no opencode.json entry`);
  }
});

test("no committed template pins a model that cannot resolve", () => {
  for (const name of ["DELEGATE_CONFIG.json"]) {
    const config = readJson(name);
    for (const key of ["defaultModel", "fallbackModel"]) {
      const value = config[key];
      if (value === undefined) continue;
      assert.match(value, /^[\w.-]+\/[\w.:-]+$/, `${name}: ${key} must be "provider/model", got ${value}`);
    }
  }
});

test("the delegation MCP entry points at a file that exists", () => {
  const config = readJson("opencode.json");
  const entry = config.mcp?.delegation;
  assert.ok(entry, "opencode.json must declare mcp.delegation");
  const script = (entry.command ?? []).find((part) => String(part).endsWith(".ts"));
  assert.ok(script, "mcp.delegation command must run a TypeScript entrypoint");
  assert.ok(existsSync(join(root, script)), `missing MCP entrypoint: ${script}`);
});
