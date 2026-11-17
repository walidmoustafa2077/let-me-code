import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Directory of this module (src/), used as the default resolution start. */
const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Read the `version` field from the package manifest that owns this source file.
 *
 * Resolution is relative to THIS module's location (import.meta.url), walking up to the
 * containing package.json; it MUST NOT depend on process.cwd().
 *
 * @param startDir Optional override for the directory to begin resolution from.
 *                 Defaults to the directory of this module (src/).
 * @returns The exact `version` string from package.json (no normalisation, no `v` prefix).
 * @throws If package.json cannot be read, is not valid JSON, or has a non-string `version`.
 */
export function readPackageVersion(startDir?: string): string {
  let dir = startDir ?? moduleDir;
  for (;;) {
    const manifestPath = join(dir, "package.json");
    if (existsSync(manifestPath)) {
      let raw: string;
      try {
        raw = readFileSync(manifestPath, "utf8");
      } catch (e) {
        throw new Error(`Unable to read package manifest at ${manifestPath}: ${(e as Error).message}`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Invalid JSON in package manifest at ${manifestPath}: ${(e as Error).message}`);
      }
      const version = (parsed as { version?: unknown } | null)?.version;
      if (typeof version !== "string") {
        throw new Error(`Package manifest at ${manifestPath} is missing a string "version" field`);
      }
      return version;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No package.json found while resolving from ${startDir ?? moduleDir}`);
    }
    dir = parent;
  }
}

/**
 * If `--version` is present in argv, write the package version to stdout and return true;
 * otherwise do nothing and return false.
 *
 * On success output is `${readPackageVersion()}\n` to stdout, nothing to stderr.
 * Does not call process.exit (the caller owns exit); returns true so the entrypoint can exit 0.
 *
 * @param argv Argument list *excluding* node and the script path. Defaults to process.argv.slice(2).
 * @returns true when `--version` was handled; false otherwise.
 */
export function maybePrintVersion(argv: string[] = process.argv.slice(2)): boolean {
  if (!argv.includes("--version")) {
    return false;
  }
  process.stdout.write(`${readPackageVersion()}\n`);
  return true;
}
