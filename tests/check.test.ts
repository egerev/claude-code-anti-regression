import { describe, it, expect, afterEach } from "vitest";
import { runCheckCore, runCheck } from "../src/commands/check.js";
import { runInstall } from "../src/commands/install.js";
import { makeTmpEnv, type TmpEnv } from "./helpers.js";

describe("check", () => {
  let env: TmpEnv | null = null;
  afterEach(() => {
    env?.cleanup();
    env = null;
  });

  it("reports NONE when settings.json is empty", () => {
    env = makeTmpEnv("empty-settings.json");
    const result = runCheckCore({ settingsPath: env.settings });
    expect(result.status).toBe("NONE");
    expect(result.diff?.env.every((e) => e.status === "missing")).toBe(true);
  });

  it("reports PARTIAL when some keys are set", () => {
    env = makeTmpEnv("partial-settings.json");
    const result = runCheckCore({ settingsPath: env.settings });
    expect(result.status).toBe("PARTIAL");
  });

  it("reports ALL_SET when all recommended values match", () => {
    env = makeTmpEnv("full-settings.json");
    const result = runCheckCore({ settingsPath: env.settings });
    expect(result.status).toBe("ALL_SET");
  });

  it("reports MALFORMED without throwing when settings.json is invalid JSON", () => {
    env = makeTmpEnv("malformed-settings.json");
    const result = runCheckCore({ settingsPath: env.settings });
    expect(result.status).toBe("MALFORMED");
  });

  it("reports MISSING when settings.json does not exist", () => {
    env = makeTmpEnv();
    const result = runCheckCore({ settingsPath: env.settings });
    expect(result.status).toBe("MISSING");
  });

  it("--exit-code returns 0 on ALL_SET, 1 otherwise", async () => {
    env = makeTmpEnv("empty-settings.json");
    const notSetCode = await runCheck({
      exitCode: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(notSetCode).toBe(1);

    await runInstall({ yes: true, json: true, settingsPath: env.settings });

    const allSetCode = await runCheck({
      exitCode: true,
      json: true,
      settingsPath: env.settings,
    });
    expect(allSetCode).toBe(0);
  });

  it("reports status after install flips from NONE to ALL_SET", async () => {
    env = makeTmpEnv("empty-settings.json");
    expect(runCheckCore({ settingsPath: env.settings }).status).toBe("NONE");
    await runInstall({ yes: true, json: true, settingsPath: env.settings });
    expect(runCheckCore({ settingsPath: env.settings }).status).toBe("ALL_SET");
  });
});
