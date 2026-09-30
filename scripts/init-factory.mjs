#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("Usage: node scripts/init-factory.mjs <target-directory>");
  process.exit(1);
}

const sourceRoot = path.resolve(import.meta.dirname, "..");
const targetRoot = path.resolve(process.cwd(), targetArg);

console.log(`\n🚀 Initializing Agent Factory in: ${targetRoot}`);

if (!fs.existsSync(targetRoot)) {
  fs.mkdirSync(targetRoot, { recursive: true });
}

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true });
    }
    for (const item of fs.readdirSync(src)) {
      if (item === "node_modules" || item === ".git" || item === ".delegation" || item === "vendor") {
        continue;
      }
      copyRecursive(path.join(src, item), path.join(dst, item));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

// 1. Copy core factory assets
console.log("📦 Copying Agent Factory assets...");
copyRecursive(path.join(sourceRoot, "mcp"), path.join(targetRoot, "mcp"));
copyRecursive(path.join(sourceRoot, ".opencode"), path.join(targetRoot, ".opencode"));

const filesToCopy = [
  "DELEGATE_CONFIG.json",
  "opencode.json",
  "package.json",
  ".gitignore"
];

for (const file of filesToCopy) {
  const srcPath = path.join(sourceRoot, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(targetRoot, file));
  }
}

// 2. Initialize git repository if needed
if (!fs.existsSync(path.join(targetRoot, ".git"))) {
  console.log("🌱 Initializing Git repository...");
  execFileSync("git", ["init"], { cwd: targetRoot, stdio: "inherit" });
}

// 3. Install MCP dependencies
console.log("⚙️  Installing MCP dependencies...");
const mcpDir = path.join(targetRoot, "mcp", "delegation");
execFileSync("npm", ["install"], { cwd: mcpDir, stdio: "inherit", shell: true });

// 4. Run MCP test suite
console.log("🧪 Verifying Agent Factory MCP test suite...");
execFileSync("npm", ["test"], { cwd: mcpDir, stdio: "inherit", shell: true });

console.log("\n✅ Agent Factory successfully bootstrapped!");
console.log(`\nTo start orchestrating in ${targetRoot}:`);
console.log(`  1. Start server: opencode serve --port 4096 (in background or separate terminal)`);
console.log(`  2. In ${targetRoot}, run: opencode`);
console.log(`  3. Ask Orchestrator: "Create a simple app with .NET backend and Next.js frontend"\n`);
