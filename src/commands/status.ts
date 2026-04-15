import kleur from "kleur";
import { defaultPaths, type Paths } from "../lib/paths.js";
import { readMarker } from "../lib/marker.js";
import { runCheckCore } from "./check.js";
import { toolVersion } from "../lib/version.js";

export interface StatusOptions {
  json?: boolean;
  settingsPath?: string;
  markerPath?: string;
  backupsDir?: string;
  agentsPath?: string;
  recommendationsPath?: string;
}

export async function runStatus(options: StatusOptions = {}): Promise<number> {
  const paths: Paths = defaultPaths({
    ...(options.settingsPath ? { settings: options.settingsPath } : {}),
    ...(options.markerPath ? { marker: options.markerPath } : {}),
    ...(options.backupsDir ? { backupsDir: options.backupsDir } : {}),
    ...(options.agentsPath ? { agentsDir: options.agentsPath } : {}),
  });

  const marker = readMarker(paths.marker);
  const checkResult = runCheckCore({
    ...(options.settingsPath ? { settingsPath: options.settingsPath } : {}),
    ...(options.agentsPath ? { agentsPath: options.agentsPath } : {}),
    ...(options.recommendationsPath
      ? { recommendationsPath: options.recommendationsPath }
      : {}),
  });

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          toolVersion: toolVersion(),
          marker: marker,
          currentStatus: checkResult.status,
          agentsFound: checkResult.agentsFound,
        },
        null,
        2,
      ) + "\n",
    );
    return 0;
  }

  console.log(kleur.bold("Claude Code Anti-Regression — status"));
  console.log(kleur.dim("─".repeat(38)));
  console.log(`Tool version: ${kleur.cyan(toolVersion())}`);
  console.log(`Settings path: ${paths.settings}`);
  console.log("");

  if (!marker) {
    console.log(
      kleur.yellow("⚠ Not installed.") +
        " No marker file at " +
        kleur.dim(paths.marker) +
        ".",
    );
    console.log(
      `Current state: ${kleur.bold(checkResult.status)}. Run ${kleur.cyan(
        "cc-anti-regression install",
      )} to apply recommendations.`,
    );
    return 0;
  }

  console.log(kleur.green("✅ Installed."));
  console.log(`  Applied at: ${marker.applied_at}`);
  console.log(`  Tool version used: ${marker.tool_version}`);
  console.log(`  Recommendations version: ${marker.recommendations_version}`);
  if (marker.applied.settings_env.length > 0) {
    console.log(`  Env keys applied: ${marker.applied.settings_env.join(", ")}`);
  }
  if (marker.applied.settings_top_level.length > 0) {
    console.log(
      `  Top-level keys applied: ${marker.applied.settings_top_level.join(", ")}`,
    );
  }
  if (marker.backup_paths.length > 0) {
    console.log(`  Backup: ${marker.backup_paths[0]}`);
  }
  console.log("");
  console.log(`Current state: ${kleur.bold(checkResult.status)}`);
  if (checkResult.status !== "ALL_SET") {
    console.log(
      kleur.dim(
        "Settings drifted since install (perhaps edited manually or by another tool). Re-run install to re-apply.",
      ),
    );
  }
  return 0;
}
