import kleur from "kleur";
import { defaultPaths, type Paths } from "../lib/paths.js";
import {
  loadRecommendations,
  type Recommendations,
} from "../lib/recommendations.js";
import { computeDiff, readSettings, type Diff } from "../lib/settings.js";
import fs from "node:fs";

export interface CheckOptions {
  json?: boolean;
  exitCode?: boolean;
  settingsPath?: string;
  agentsPath?: string;
  recommendationsPath?: string;
}

export type CheckStatus = "ALL_SET" | "PARTIAL" | "NONE" | "MALFORMED" | "MISSING";

export interface CheckResult {
  status: CheckStatus;
  diff: Diff | null;
  settingsExists: boolean;
  malformed: boolean;
  recommendationsVersion: string;
  agentsFound: number;
}

export function runCheckCore(options: CheckOptions = {}): CheckResult {
  const paths: Paths = defaultPaths({
    ...(options.settingsPath ? { settings: options.settingsPath } : {}),
    ...(options.agentsPath ? { agentsDir: options.agentsPath } : {}),
  });
  const rec: Recommendations = loadRecommendations(options.recommendationsPath);

  const read = readSettings(paths.settings);
  if (read.kind === "missing") {
    return {
      status: "MISSING",
      diff: null,
      settingsExists: false,
      malformed: false,
      recommendationsVersion: rec.version,
      agentsFound: countAgents(paths.agentsDir),
    };
  }
  if (read.kind === "malformed") {
    return {
      status: "MALFORMED",
      diff: null,
      settingsExists: true,
      malformed: true,
      recommendationsVersion: rec.version,
      agentsFound: countAgents(paths.agentsDir),
    };
  }

  const diff = computeDiff(read.settings, rec);
  const anyMatch =
    diff.env.some((d) => d.status === "match") ||
    diff.top.some((d) => d.status === "match");
  const anyMiss =
    diff.env.some((d) => d.status !== "match") ||
    diff.top.some((d) => d.status !== "match");
  let status: CheckStatus;
  if (!anyMiss) status = "ALL_SET";
  else if (anyMatch) status = "PARTIAL";
  else status = "NONE";

  return {
    status,
    diff,
    settingsExists: true,
    malformed: false,
    recommendationsVersion: rec.version,
    agentsFound: countAgents(paths.agentsDir),
  };
}

function countAgents(agentsDir: string): number {
  if (!fs.existsSync(agentsDir)) return 0;
  try {
    return fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .length;
  } catch {
    return 0;
  }
}

export async function runCheck(options: CheckOptions = {}): Promise<number> {
  const result = runCheckCore(options);

  if (options.json) {
    process.stdout.write(JSON.stringify(toJsonOutput(result), null, 2) + "\n");
    if (options.exitCode) {
      return result.status === "ALL_SET" ? 0 : 1;
    }
    return 0;
  }

  printHumanOutput(result);
  if (options.exitCode) {
    return result.status === "ALL_SET" ? 0 : 1;
  }
  return 0;
}

interface JsonOutput {
  status: CheckStatus;
  recommendationsVersion: string;
  env: Array<{
    key: string;
    status: "match" | "differs" | "missing";
    current: string | undefined;
    recommended: string;
  }>;
  top: Array<{
    key: string;
    status: "match" | "differs" | "missing";
    current: unknown;
    recommended: unknown;
  }>;
  missing: string[];
  differs: string[];
  agentsFound: number;
}

function toJsonOutput(result: CheckResult): JsonOutput {
  const env = result.diff?.env ?? [];
  const top = result.diff?.top ?? [];
  return {
    status: result.status,
    recommendationsVersion: result.recommendationsVersion,
    env: env.map((e) => ({
      key: e.key,
      status: e.status,
      current: e.current,
      recommended: e.recommended,
    })),
    top: top.map((t) => ({
      key: t.key,
      status: t.status,
      current: t.current,
      recommended: t.recommended,
    })),
    missing: [
      ...env.filter((e) => e.status === "missing").map((e) => e.key),
      ...top.filter((t) => t.status === "missing").map((t) => t.key),
    ],
    differs: [
      ...env.filter((e) => e.status === "differs").map((e) => e.key),
      ...top.filter((t) => t.status === "differs").map((t) => t.key),
    ],
    agentsFound: result.agentsFound,
  };
}

function printHumanOutput(result: CheckResult): void {
  console.log(kleur.bold("Claude Code Anti-Regression — check"));
  console.log(kleur.dim("─".repeat(37)));

  if (result.status === "MISSING") {
    console.log(
      kleur.yellow("⚠ ") +
        `~/.claude/settings.json does not exist. Run ${kleur.cyan(
          "cc-anti-regression install",
        )} to create it with recommended values.`,
    );
    return;
  }
  if (result.status === "MALFORMED") {
    console.log(
      kleur.red("✖ ") +
        "~/.claude/settings.json is not valid JSON. Fix the file before running install.",
    );
    return;
  }

  const diff = result.diff!;
  let matched = 0;
  let total = 0;

  for (const e of diff.env) {
    total += 1;
    if (e.status === "match") {
      matched += 1;
      console.log(kleur.green("✅ ") + `${e.key}=${e.current}`);
    } else if (e.status === "missing") {
      console.log(
        kleur.red("❌ ") +
          `${e.key} — missing (recommend "${e.recommended}")`,
      );
    } else {
      console.log(
        kleur.red("❌ ") +
          `${e.key}="${e.current}" (recommend "${e.recommended}")`,
      );
    }
  }
  for (const t of diff.top) {
    total += 1;
    if (t.status === "match") {
      matched += 1;
      console.log(kleur.green("✅ ") + `${t.key}=${JSON.stringify(t.current)}`);
    } else if (t.status === "missing") {
      console.log(
        kleur.red("❌ ") +
          `${t.key} — missing (recommend ${JSON.stringify(t.recommended)})`,
      );
    } else {
      console.log(
        kleur.red("❌ ") +
          `${t.key}=${JSON.stringify(t.current)} (recommend ${JSON.stringify(t.recommended)})`,
      );
    }
  }

  console.log("");
  if (result.status === "ALL_SET") {
    console.log(kleur.green().bold(`Status: ALL_SET (${total} of ${total} set)`));
  } else {
    console.log(
      kleur.yellow().bold(`Status: ${result.status} (${matched} of ${total} set)`),
    );
    console.log(
      `Run ${kleur.cyan("cc-anti-regression install")} to apply missing.`,
    );
  }

  if (result.agentsFound > 0) {
    console.log("");
    console.log(
      kleur.dim(
        `ℹ Found ${result.agentsFound} custom agent file${result.agentsFound === 1 ? "" : "s"} in ~/.claude/agents/ — not analyzed in v0.1 (see v0.2 roadmap).`,
      ),
    );
  }
}
