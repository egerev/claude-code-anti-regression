import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { runInstall } from "../src/commands/install.js";
import { runUninstall } from "../src/commands/uninstall.js";
import { makeTmpEnv, type TmpEnv } from "./helpers.js";

describe("uninstall", () => {
  let env: TmpEnv | null = null;
  afterEach(() => {
    env?.cleanup();
    env = null;
  });

  it("restores settings.json byte-for-byte from the backup", async () => {
    env = makeTmpEnv("partial-settings.json");
    const originalBytes = fs.readFileSync(env.settings);

    await runInstall({ yes: true, json: true, settingsPath: env.settings });

    // sanity: file mutated
    const afterInstallBytes = fs.readFileSync(env.settings);
    expect(afterInstallBytes.equals(originalBytes)).toBe(false);

    const outcome = await runUninstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("restored");

    const restoredBytes = fs.readFileSync(env.settings);
    expect(restoredBytes.equals(originalBytes)).toBe(true);
  });

  it("returns a clear noop when no marker exists", async () => {
    env = makeTmpEnv("empty-settings.json");
    const outcome = await runUninstall({
      yes: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(outcome.status).toBe("noop");
    if (outcome.status === "noop") {
      expect(outcome.reason).toBe("no_marker");
    }
  });

  it("deletes the marker file after successful restore", async () => {
    env = makeTmpEnv("empty-settings.json");
    await runInstall({ yes: true, json: true, settingsPath: env.settings });
    expect(fs.existsSync(env.marker)).toBe(true);

    await runUninstall({ yes: true, json: true, settingsPath: env.settings });
    expect(fs.existsSync(env.marker)).toBe(false);
  });
});
