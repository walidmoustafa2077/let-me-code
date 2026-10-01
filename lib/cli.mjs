import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ASSET_PATHS,
  GITIGNORE_LINES,
  detectConflicts,
  mergeGitignore,
  mergeOpencodeConfig,
  applyModel,
  applyDelegateModel
} from "./merge.mjs";
import { backupFile, installAssets } from "./scaffold.mjs";

export const VERSION = "0.2.0";

const HELP = `let-me-code — agent factory for opencode

Usage:
  let-me-code [init] [target-dir] [options]

Options:
  -y, --yes           non-interactive; accept safe defaults
      --force         overwrite conflicts without prompting
      --no-install    skip npm install in mcp/delegation
      --no-test       skip the MCP test run
      --no-git        skip git init
      --model <id>    model for dispatched agents
  -h, --help          show this help
  -v, --version       print version
`;

export function parseArgs(argv) {
  const options = {
    command: "init",
    target: ".",
    yes: false,
    force: false,
    install: true,
    test: true,
    git: true,
    model: null,
    help: false,
    version: false
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--no-install":
        options.install = false;
        break;
      case "--no-test":
        options.test = false;
        break;
      case "--no-git":
        options.git = false;
        break;
      case "--model":
        options.model = argv[++i] ?? null;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-v":
      case "--version":
        options.version = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positionals.push(arg);
    }
  }
  if (positionals[0] === "init") {
    positionals.shift();
  } else if (positionals.length > 0 && positionals[0] !== ".") {
    options.command = positionals.shift();
  }
  if (positionals.length > 0) {
    options.target = positionals.shift();
  }
  if (positionals.length > 0) {
    throw new Error(`Unexpected argument(s): ${positionals.join(" ")}`);
  }
  return options;
}

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function detectTargetConflicts(targetRoot) {
  return detectConflicts(ASSET_PATHS, (p) => fs.existsSync(p), targetRoot);
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
}

export function resolveConflictMode({ conflicts, options, ask }) {
  if (conflicts.length === 0) {
    return "merge";
  }
  if (options.force) {
    return "overwrite";
  }
  if (options.yes) {
    return "merge";
  }
  return ask(conflicts);
}

export async function runCli(argv, { ask } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(`\n${HELP}`);
    return 1;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (options.version) {
    console.log(VERSION);
    return 0;
  }
  if (options.command !== "init") {
    console.error(`Unknown command: ${options.command}`);
    return 1;
  }

  const sourceRoot = packageRoot();
  const targetRoot = path.resolve(process.cwd(), options.target);
  fs.mkdirSync(targetRoot, { recursive: true });

  console.log(`\nlet-me-code → ${targetRoot}`);

  const conflicts = detectTargetConflicts(targetRoot);
  if (conflicts.length > 0) {
    console.log(`Found existing: ${conflicts.join(", ")}`);
  }

  let mode;
  try {
    mode = resolveConflictMode({ conflicts, options, ask: ask ?? (async () => "merge") });
    if (mode && typeof mode.then === "function") {
      mode = await mode;
    }
  } catch (error) {
    console.error(`Aborted: ${error.message}`);
    return 1;
  }
  if (mode === "abort") {
    console.error("Aborted. No changes made.");
    return 1;
  }
  console.log(`Conflict mode: ${mode}`);

  const log = [];
  installAssets({ sourceRoot, targetRoot, mode, log });

  const opencodePath = path.join(targetRoot, "opencode.json");
  const factoryConfig = JSON.parse(fs.readFileSync(path.join(sourceRoot, "opencode.json"), "utf8"));
  let merged;
  if (fs.existsSync(opencodePath) && mode === "merge") {
    const userConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
    merged = mergeOpencodeConfig(userConfig, factoryConfig);
  } else if (fs.existsSync(opencodePath)) {
    const bak = backupFile(opencodePath);
    console.log(`Backed up opencode.json → ${path.relative(targetRoot, bak)}`);
    merged = factoryConfig;
  } else {
    merged = factoryConfig;
  }
  if (options.model) {
    merged = applyModel(merged, options.model);
    const delegatePath = path.join(targetRoot, "DELEGATE_CONFIG.json");
    if (fs.existsSync(delegatePath)) {
      const delegate = JSON.parse(fs.readFileSync(delegatePath, "utf8"));
      fs.writeFileSync(
        delegatePath,
        `${JSON.stringify(applyDelegateModel(delegate, options.model), null, 2)}\n`
      );
    }
  }
  fs.writeFileSync(opencodePath, `${JSON.stringify(merged, null, 2)}\n`);

  const gitignorePath = path.join(targetRoot, ".gitignore");
  const existingIgnore = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf8")
    : "";
  fs.writeFileSync(gitignorePath, mergeGitignore(existingIgnore, GITIGNORE_LINES));

  if (options.install) {
    const mcpDir = path.join(targetRoot, "mcp", "delegation");
    console.log("\nInstalling MCP dependencies...");
    const installed = run("npm", ["install"], mcpDir);
    if (installed.status !== 0) {
      console.error("npm install failed. Files were copied; install manually with:");
      console.error(`  cd ${path.relative(process.cwd(), mcpDir)} && npm install`);
      return 1;
    }
  }

  if (options.test) {
    const mcpDir = path.join(targetRoot, "mcp", "delegation");
    console.log("\nRunning MCP test suite...");
    const tested = run("npm", ["test"], mcpDir);
    if (tested.status !== 0) {
      console.warn("MCP tests failed — scaffold is in place, review the failures above.");
    }
  }

  if (options.git && !fs.existsSync(path.join(targetRoot, ".git"))) {
    console.log("\nInitialising git repository...");
    run("git", ["init"], targetRoot);
  }

  console.log(`\nDone. Copied ${log.length} files/folders.`);
  console.log(`\nNext steps in ${targetRoot}:`);
  console.log("  1. opencode serve --port 4096");
  console.log("  2. opencode");
  console.log('  3. Ask the Orchestrator to build something.\n');
  return 0;
}
