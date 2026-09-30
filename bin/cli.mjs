#!/usr/bin/env node
import { runCli } from "../lib/cli.mjs";
import { createAsk } from "../lib/wizard.mjs";

const interactive = process.stdin.isTTY && !process.argv.includes("--yes") && !process.argv.includes("-y");

try {
  const code = await runCli(process.argv.slice(2), {
    ask: interactive ? createAsk() : undefined
  });
  process.exit(code);
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exit(1);
}
