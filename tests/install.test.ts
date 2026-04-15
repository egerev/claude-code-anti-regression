import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { runInstall } from "../src/commands/install.js";
import { readMarker } from "../src/lib/marker.js";
import type { Settings } from "../src/lib/settings.js";
import { makeTmpEnv, readJson, type TmpEnv } from "./helpers.js";

const RECOMMENDED_ENV_KEYS = [
  "CLAUDE_CODE_EFFORT_LEVEL",
  "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING",
  "MAX_THINKING_TOKENS",
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW",
] as const;

describe("install", () => {
  let env: TmpEnv | null = null;
  afterEach(() => {
    env?.cleanup();
    env = null;
  });

  it("adds all keys when settings.json is empty", async () => {
    env = makeTmpEnv("empty-settings.json");
    const outcome = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("applied");
    const after = readJson<Settings>(env.settings);
    expect(after.env).toBeDefined();
    for (const key of RECOMMENDED_ENV_KEYS) {
      expect(after.env?.[key]).toBeDefined();
    }
    expect(after.showThinkingSummaries).toBe(true);
  });

  it("adds only missing keys when settings.json is partial", async () => {
    env = makeTmpEnv("partial-settings.json");
    const outcome = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("applied");
    if (outcome.status === "applied") {
      expect(outcome.applied).not.toContain("CLAUDE_CODE_EFFORT_LEVEL");
      expect(outcome.applied).toContain("MAX_THINKING_TOKENS");
    }
  });

  it("preserves unrelated keys (permissions, hooks, custom env vars)", async () => {
    env = makeTmpEnv("partial-settings.json");
    await runInstall({ yes: true, json: true, settingsPath: env.settings });
    const after = readJson<Settings>(env.settings);
    expect(after.env?.CUSTOM_VAR).toBe("keep-me");
    expect(after.permissions).toEqual({ allow: ["Read(*)"] });
    expect(after.hooks).toEqual({ Stop: "echo done" });
  });

  it("is idempotent — second run is a noop and does not create another backup", async () => {
    env = makeTmpEnv("empty-settings.json");
    const first = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(first.status).toBe("applied");

    const backupCountAfterFirst = fs
      .readdirSync(env.backupsDir)
      .filter((f) => f.endsWith(".bak")).length;

    const second = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(second.status).toBe("noop");

    const backupCountAfterSecond = fs
      .readdirSync(env.backupsDir)
      .filter((f) => f.endsWith(".bak")).length;
    expect(backupCountAfterSecond).toBe(backupCountAfterFirst);
  });

  it("--dry-run does not write the settings file or marker", async () => {
    env = makeTmpEnv("empty-settings.json");
    const before = fs.readFileSync(env.settings, "utf8");
    const outcome = await runInstall({
      yes: true,
      dryRun: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("dry-run");
    const after = fs.readFileSync(env.settings, "utf8");
    expect(after).toBe(before);
    expect(fs.existsSync(env.marker)).toBe(false);
  });

  it("malformed settings.json produces an error without modifying the file", async () => {
    env = makeTmpEnv("malformed-settings.json");
    const before = fs.readFileSync(env.settings, "utf8");
    const outcome = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.code).toBe("malformed_settings");
    }
    const after = fs.readFileSync(env.settings, "utf8");
    expect(after).toBe(before);
    expect(fs.existsSync(env.marker)).toBe(false);
  });

  it("creates a marker file with correct shape", async () => {
    env = makeTmpEnv("empty-settings.json");
    await runInstall({ yes: true, json: true, settingsPath: env.settings });
    const marker = readMarker(env.marker);
    expect(marker).not.toBeNull();
    expect(marker!.tool_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(marker!.applied.settings_env.length).toBeGreaterThan(0);
    expect(marker!.applied.settings_top_level).toContain("showThinkingSummaries");
    expect(marker!.backup_paths.length).toBe(1);
  });

  it("creates settings.json when it does not exist", async () => {
    env = makeTmpEnv();
    expect(fs.existsSync(env.settings)).toBe(false);
    const outcome = await runInstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("applied");
    expect(fs.existsSync(env.settings)).toBe(true);
    const after = readJson<Settings>(env.settings);
    expect(after.env?.CLAUDE_CODE_EFFORT_LEVEL).toBe("max");
  });
});
