import fs from "node:fs";
import path from "node:path";
import type { Recommendations } from "./recommendations.js";
import { timestampSuffix } from "./paths.js";

export interface Settings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

export interface EnvDiffItem {
  key: string;
  current: string | undefined;
  recommended: string;
  status: "match" | "differs" | "missing";
}

export interface TopDiffItem {
  key: string;
  current: unknown;
  recommended: unknown;
  status: "match" | "differs" | "missing";
}

export interface Diff {
  env: EnvDiffItem[];
  top: TopDiffItem[];
}

export type SettingsReadResult =
  | { kind: "ok"; settings: Settings; raw: string }
  | { kind: "missing" }
  | { kind: "malformed"; error: SyntaxError; raw: string };

export function readSettings(settingsPath: string): SettingsReadResult {
  if (!fs.existsSync(settingsPath)) {
    return { kind: "missing" };
  }
  const raw = fs.readFileSync(settingsPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    const settings: Settings =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Settings)
        : {};
    return { kind: "ok", settings, raw };
  } catch (e) {
    return { kind: "malformed", error: e as SyntaxError, raw };
  }
}

export function computeDiff(settings: Settings, rec: Recommendations): Diff {
  const envNow = settings.env ?? {};
  const env: EnvDiffItem[] = Object.entries(rec.settings_env).map(
    ([key, recommended]) => {
      const current = envNow[key];
      if (current === undefined) {
        return { key, current, recommended, status: "missing" };
      }
      if (current === recommended) {
        return { key, current, recommended, status: "match" };
      }
      return { key, current, recommended, status: "differs" };
    },
  );

  const top: TopDiffItem[] = Object.entries(rec.settings_top_level).map(
    ([key, recommended]) => {
      const current = settings[key];
      if (current === undefined) {
        return { key, current, recommended, status: "missing" };
      }
      if (deepEqual(current, recommended)) {
        return { key, current, recommended, status: "match" };
      }
      return { key, current, recommended, status: "differs" };
    },
  );

  return { env, top };
}

export function diffHasChanges(diff: Diff): boolean {
  return (
    diff.env.some((d) => d.status !== "match") ||
    diff.top.some((d) => d.status !== "match")
  );
}

export interface ApplyResult {
  before: Settings;
  after: Settings;
  changedEnvKeys: string[];
  changedTopKeys: string[];
}

export function applyRecommendations(
  settings: Settings,
  rec: Recommendations,
): ApplyResult {
  const before: Settings = structuredClone(settings);
  const after: Settings = structuredClone(settings);
  const changedEnvKeys: string[] = [];
  const changedTopKeys: string[] = [];

  if (!after.env || typeof after.env !== "object") {
    after.env = {};
  }
  for (const [key, value] of Object.entries(rec.settings_env)) {
    if (after.env[key] !== value) {
      after.env[key] = value;
      changedEnvKeys.push(key);
    }
  }

  for (const [key, value] of Object.entries(rec.settings_top_level)) {
    if (!deepEqual(after[key], value)) {
      after[key] = value;
      changedTopKeys.push(key);
    }
  }

  return { before, after, changedEnvKeys, changedTopKeys };
}

export function stringifySettings(settings: Settings): string {
  return JSON.stringify(settings, null, 2) + "\n";
}

export function writeSettings(settingsPath: string, settings: Settings): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, stringifySettings(settings), "utf8");
}

export function backupSettings(
  settingsPath: string,
  backupsDir: string,
  now: Date = new Date(),
): string {
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`Cannot backup missing file: ${settingsPath}`);
  }
  fs.mkdirSync(backupsDir, { recursive: true });
  const suffix = timestampSuffix(now);
  const backupName = `settings.json.${suffix}.cc-anti-regression.bak`;
  const backupPath = path.join(backupsDir, backupName);
  fs.copyFileSync(settingsPath, backupPath);
  return backupPath;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => deepEqual(ao[k], bo[k]));
}
