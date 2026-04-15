import kleur from "kleur";
import prompts from "prompts";
import { defaultPaths, type Paths } from "../lib/paths.js";
import {
  loadRecommendations,
  type Recommendations,
} from "../lib/recommendations.js";
import {
  applyRecommendations,
  backupSettings,
  computeDiff,
  diffHasChanges,
  readSettings,
  writeSettings,
  type Diff,
  type Settings,
} from "../lib/settings.js";
import { writeMarker, type Marker } from "../lib/marker.js";
import { toolVersion } from "../lib/version.js";

export interface InstallOptions {
  yes?: boolean;
  dryRun?: boolean;
  noBackup?: boolean;
  json?: boolean;
  settingsPath?: string;
  markerPath?: string;
  backupsDir?: string;
  recommendationsPath?: string;
  now?: Date;
}

export type InstallOutcome =
  | {
      status: "noop";
      reason: "already_applied";
    }
  | {
      status: "dry-run";
      applied: string[];
    }
  | {
      status: "applied";
      applied: string[];
      backup: string | null;
    }
  | {
      status: "error";
      code: "malformed_settings" | "no_changes_needed";
      message: string;
    };

export async function runInstall(
  options: InstallOptions = {},
): Promise<InstallOutcome> {
  const paths: Paths = defaultPaths({
    ...(options.settingsPath ? { settings: options.settingsPath } : {}),
    ...(options.backupsDir ? { backupsDir: options.backupsDir } : {}),
    ...(options.markerPath ? { marker: options.markerPath } : {}),
  });
  const rec = loadRecommendations(options.recommendationsPath);

  const read = readSettings(paths.settings);
  if (read.kind === "malformed") {
    const msg = `~/.claude/settings.json is not valid JSON: ${read.error.message}. Fix the file before running install.`;
    if (!options.json) console.error(kleur.red("✖ ") + msg);
    return {
      status: "error",
      code: "malformed_settings",
      message: msg,
    };
  }

  const current: Settings = read.kind === "ok" ? read.settings : {};
  const diff = computeDiff(current, rec);

  if (!diffHasChanges(diff)) {
    if (options.json) {
      process.stdout.write(
        JSON.stringify(
          { status: "noop", reason: "already_applied" },
          null,
          2,
        ) + "\n",
      );
    } else {
      console.log(
        kleur.green("✅ ") +
          "Already up to date — all recommended values are applied.",
      );
    }
    return { status: "noop", reason: "already_applied" };
  }

  const applied = applyRecommendations(current, rec);
  const changed = [...applied.changedEnvKeys, ...applied.changedTopKeys];

  if (options.dryRun) {
    if (!options.json) {
      printDiff(diff, paths, read.kind === "missing");
      console.log("");
      console.log(
        kleur.dim(
          "Dry run — no files written. Re-run without --dry-run to apply.",
        ),
      );
    } else {
      process.stdout.write(
        JSON.stringify({ status: "dry-run", applied: changed }, null, 2) + "\n",
      );
    }
    return { status: "dry-run", applied: changed };
  }

  if (!options.yes && !options.json) {
    printDiff(diff, paths, read.kind === "missing");
    const backupPreview = !options.noBackup && read.kind === "ok";
    if (backupPreview) {
      console.log("");
      console.log(kleur.dim("Backup will be saved to:"));
      console.log(kleur.dim(`  ${paths.backupsDir}/settings.json.<timestamp>.cc-anti-regression.bak`));
    }
    console.log("");
    const { ok } = await prompts({
      type: "confirm",
      name: "ok",
      message: "Apply these changes?",
      initial: false,
    });
    if (!ok) {
      console.log(kleur.dim("Aborted."));
      return { status: "noop", reason: "already_applied" };
    }
  }

  let backupPath: string | null = null;
  if (read.kind === "ok" && !options.noBackup) {
    backupPath = backupSettings(paths.settings, paths.backupsDir, options.now);
  }

  writeSettings(paths.settings, applied.after);

  const marker: Marker = {
    applied_at: (options.now ?? new Date()).toISOString(),
    tool_version: toolVersion(),
    recommendations_version: rec.version,
    applied: {
      settings_env: applied.changedEnvKeys,
      settings_top_level: applied.changedTopKeys,
    },
    backup_paths: backupPath ? [backupPath] : [],
  };
  writeMarker(paths.marker, marker);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        { status: "applied", applied: changed, backup: backupPath },
        null,
        2,
      ) + "\n",
    );
  } else {
    console.log(kleur.green("✅ Applied."));
    for (const k of applied.changedEnvKeys) {
      console.log(kleur.green("  + ") + `.env.${k}`);
    }
    for (const k of applied.changedTopKeys) {
      console.log(kleur.green("  + ") + `.${k}`);
    }
    if (backupPath) {
      console.log("");
      console.log(kleur.dim(`Backup: ${backupPath}`));
    }
    console.log("");
    console.log(
      kleur.bold("Restart Claude Code") +
        " (exit + relaunch) for env vars to take effect.",
    );
  }

  return { status: "applied", applied: changed, backup: backupPath };
}

function printDiff(diff: Diff, paths: Paths, settingsMissing: boolean): void {
  if (settingsMissing) {
    console.log(
      kleur.yellow("⚠ ") +
        `${paths.settings} does not exist — it will be created.`,
    );
    console.log("");
  }
  console.log(kleur.bold("Will apply these changes to ~/.claude/settings.json:"));
  console.log("");
  for (const e of diff.env) {
    if (e.status === "missing") {
      console.log(
        kleur.green("  + ") + `.env.${e.key} = ${JSON.stringify(e.recommended)}`,
      );
    } else if (e.status === "differs") {
      console.log(
        kleur.yellow("  ~ ") +
          `.env.${e.key} = ${JSON.stringify(e.current)} → ${JSON.stringify(e.recommended)}`,
      );
    }
  }
  for (const t of diff.top) {
    if (t.status === "missing") {
      console.log(
        kleur.green("  + ") + `.${t.key} = ${JSON.stringify(t.recommended)}`,
      );
    } else if (t.status === "differs") {
      console.log(
        kleur.yellow("  ~ ") +
          `.${t.key} = ${JSON.stringify(t.current)} → ${JSON.stringify(t.recommended)}`,
      );
    }
  }
}
