#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { runInstall } from "./commands/install.js";
import { runCheck } from "./commands/check.js";
import { runUninstall } from "./commands/uninstall.js";
import { runStatus } from "./commands/status.js";
import { toolVersion } from "./lib/version.js";

async function main(): Promise<void> {
  const program = new Command();
  program
    .name("cc-anti-regression")
    .description(
      "Apply recommended env vars to ~/.claude/settings.json to mitigate the Claude Code Feb-Mar 2026 quality regression.",
    )
    .version(toolVersion(), "-v, --version", "print tool version");

  program
    .command("install")
    .description("Apply recommended env vars and top-level keys to settings.json.")
    .option("-y, --yes", "skip confirmation prompt (for CI)")
    .option("--dry-run", "show diff without writing")
    .option("--no-backup", "skip backup creation (default: backup is always created)")
    .option("--json", "machine-readable JSON output")
    .option("--settings-path <path>", "override ~/.claude/settings.json location")
    .action(async (opts: Record<string, unknown>) => {
      const outcome = await runInstall({
        yes: opts.yes as boolean | undefined,
        dryRun: opts.dryRun as boolean | undefined,
        noBackup: opts.backup === false,
        json: opts.json as boolean | undefined,
        settingsPath: opts.settingsPath as string | undefined,
      });
      if (outcome.status === "error") {
        process.exit(1);
      }
    });

  program
    .command("check")
    .description(
      "Compare ~/.claude/settings.json against recommendations and print result.",
    )
    .option("--json", "machine-readable JSON output")
    .option(
      "--exit-code",
      "exit 0 if ALL_SET, 1 if anything missing/differs (for scripts)",
    )
    .option("--settings-path <path>", "override ~/.claude/settings.json location")
    .action(async (opts: Record<string, unknown>) => {
      const code = await runCheck({
        json: opts.json as boolean | undefined,
        exitCode: opts.exitCode as boolean | undefined,
        settingsPath: opts.settingsPath as string | undefined,
      });
      process.exit(code);
    });

  program
    .command("uninstall")
    .description(
      "Restore ~/.claude/settings.json from the backup recorded in the marker file.",
    )
    .option("-y, --yes", "skip confirmation prompt")
    .option("--keep-backups", "do not delete backup files (default: keep them)")
    .option("--json", "machine-readable JSON output")
    .option("--settings-path <path>", "override ~/.claude/settings.json location")
    .action(async (opts: Record<string, unknown>) => {
      const outcome = await runUninstall({
        yes: opts.yes as boolean | undefined,
        keepBackups: opts.keepBackups as boolean | undefined,
        json: opts.json as boolean | undefined,
        settingsPath: opts.settingsPath as string | undefined,
      });
      if (outcome.status === "error") {
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Print last apply timestamp, tool version, and current state.")
    .option("--json", "machine-readable JSON output")
    .option("--settings-path <path>", "override ~/.claude/settings.json location")
    .action(async (opts: Record<string, unknown>) => {
      await runStatus({
        json: opts.json as boolean | undefined,
        settingsPath: opts.settingsPath as string | undefined,
      });
    });

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(kleur.red("✖ ") + msg);
  process.exit(1);
});
