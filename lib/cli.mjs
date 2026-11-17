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

export const VERSION = "1.0.0";

const HELP = `let-me-code — agent factory for opencode

Usage:
  let-me-code [init] [target-dir] [options]

Options:
  -y, --yes           non-interactive; accept safe defaults
      --upgrade       refresh the factory's own files, backing up each one it replaces
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
    upgrade: false,
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
      case "--upgrade":
        options.upgrade = true;
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

/** True when git can sign a commit: both a user name and an email resolve. */
function gitHasIdentity(cwd) {
  return ["user.email", "user.name"].every((key) => {
    const result = spawnSync("git", ["config", key], {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32"
    });
    return result.status === 0 && String(result.stdout ?? "").trim() !== "";
  });
}

export function resolveConflictMode({ conflicts, options, ask }) {
  if (options.force) {
    return "overwrite";
  }
  if (options.upgrade) {
    return "upgrade";
  }
  if (conflicts.length === 0) {
    return "merge";
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
  if (fs.existsSync(opencodePath) && mode !== "overwrite") {
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
    merged = applyModel(merged, options.model, Object.keys(factoryConfig.agent ?? {}));
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
    if (gitHasIdentity(targetRoot)) {
      run("git", ["add", "-A"], targetRoot);
      const commit = run(
        "git",
        ["commit", "--no-gpg-sign", "-m", "chore: scaffold let-me-code factory"],
        targetRoot
      );
      console.log(
        commit.status === 0
          ? "Committed the scaffold as the initial baseline."
          : "Could not commit the scaffold; commit it manually before dispatching."
      );
    } else {
      console.log(
        "No git identity configured; commit the scaffold manually so change detection has a baseline."
      );
    }
  }

  const replaced = log.filter((entry) => entry.action === "backed-up");
  console.log(`\nDone. Copied ${log.length} files/folders.`);
  if (replaced.length > 0) {
    console.log(`Replaced ${replaced.length} file(s); each one is kept next to the original as *.bak-<timestamp>.`);
  }
  console.log(`\nNext steps in ${targetRoot}:`);
  console.log("  1. (auto) The delegation server starts the opencode engine on first dispatch.");
  console.log("  2. opencode");
  console.log('  3. Ask the Orchestrator to build something.\n');
  return 0;
}
