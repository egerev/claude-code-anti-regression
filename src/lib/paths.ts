import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Paths {
  settings: string;
  backupsDir: string;
  marker: string;
  agentsDir: string;
}

export function defaultPaths(overrides: Partial<Paths> = {}): Paths {
  const home = os.homedir();
  const defaultClaudeDir = path.join(home, ".claude");
  const settings = overrides.settings ?? path.join(defaultClaudeDir, "settings.json");
  // When settings is overridden, derive sibling paths from its parent so tests
  // and custom setups stay self-contained instead of spilling into ~/.claude.
  const claudeDir = overrides.settings ? path.dirname(overrides.settings) : defaultClaudeDir;
  return {
    settings,
    backupsDir: overrides.backupsDir ?? path.join(claudeDir, "backups"),
    marker:
      overrides.marker ?? path.join(claudeDir, ".cc-anti-regression-marker.json"),
    agentsDir: overrides.agentsDir ?? path.join(claudeDir, "agents"),
  };
}

export function packageRoot(): string {
  // this file compiles to dist/lib/paths.js — go up two levels to package root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

export function recommendationsPath(): string {
  return path.join(packageRoot(), "recommendations.json");
}

export function timestampSuffix(now: Date = new Date()): string {
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  );
}
