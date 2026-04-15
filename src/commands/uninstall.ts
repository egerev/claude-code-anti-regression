import fs from "node:fs";
import kleur from "kleur";
import prompts from "prompts";
import { defaultPaths, type Paths } from "../lib/paths.js";
import { deleteMarker, readMarker } from "../lib/marker.js";

export interface UninstallOptions {
  yes?: boolean;
  keepBackups?: boolean;
  json?: boolean;
  settingsPath?: string;
  markerPath?: string;
  backupsDir?: string;
}

export type UninstallOutcome =
  | { status: "restored"; backupUsed: string }
  | { status: "noop"; reason: "no_marker" | "aborted" }
  | { status: "error"; code: "missing_backup"; message: string };

export async function runUninstall(
  options: UninstallOptions = {},
): Promise<UninstallOutcome> {
  const paths: Paths = defaultPaths({
    ...(options.settingsPath ? { settings: options.settingsPath } : {}),
    ...(options.markerPath ? { marker: options.markerPath } : {}),
    ...(options.backupsDir ? { backupsDir: options.backupsDir } : {}),
  });

  const marker = readMarker(paths.marker);
  if (!marker) {
    const msg =
      "No marker file found — nothing to uninstall. Either the tool was never run, or the marker was removed manually.";
    if (!options.json) console.error(kleur.yellow("⚠ ") + msg);
    return { status: "noop", reason: "no_marker" };
  }

  const backupPath = marker.backup_paths[0];
  if (!backupPath) {
    const msg = `Marker exists but records no backup. Cannot restore. Marker: ${paths.marker}`;
    if (!options.json) console.error(kleur.red("✖ ") + msg);
    return { status: "error", code: "missing_backup", message: msg };
  }
  if (!fs.existsSync(backupPath)) {
    const msg = `Recorded backup does not exist at ${backupPath}. Cannot restore.`;
    if (!options.json) console.error(kleur.red("✖ ") + msg);
    return { status: "error", code: "missing_backup", message: msg };
  }

  if (!options.yes && !options.json) {
    console.log(
      kleur.bold("This will restore ~/.claude/settings.json from backup:"),
    );
    console.log(`  ${backupPath}`);
    console.log("");
    console.log(
      kleur.dim(
        `Applied at: ${marker.applied_at} (tool v${marker.tool_version}, recommendations v${marker.recommendations_version})`,
      ),
    );
    console.log("");
    const { ok } = await prompts({
      type: "confirm",
      name: "ok",
      message: "Restore?",
      initial: false,
    });
    if (!ok) {
      console.log(kleur.dim("Aborted."));
      return { status: "noop", reason: "aborted" };
    }
  }

  fs.copyFileSync(backupPath, paths.settings);
  deleteMarker(paths.marker);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        { status: "restored", backupUsed: backupPath },
        null,
        2,
      ) + "\n",
    );
  } else {
    console.log(kleur.green("✅ Restored.") + ` ${paths.settings}`);
    console.log(kleur.dim(`Backup kept at: ${backupPath}`));
    console.log("");
    console.log(
      kleur.bold("Restart Claude Code") + " to pick up the restored settings.",
    );
  }

  return { status: "restored", backupUsed: backupPath };
}
