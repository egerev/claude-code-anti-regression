import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixturesDir(): string {
  return path.join(here, "fixtures");
}

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir(), name), "utf8");
}

export interface TmpEnv {
  dir: string;
  settings: string;
  backupsDir: string;
  marker: string;
  cleanup: () => void;
}

export function makeTmpEnv(fixtureName?: string): TmpEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cc-ar-test-"));
  const settings = path.join(dir, "settings.json");
  const backupsDir = path.join(dir, "backups");
  const marker = path.join(dir, ".cc-anti-regression-marker.json");
  if (fixtureName) {
    fs.copyFileSync(path.join(fixturesDir(), fixtureName), settings);
  }
  return {
    dir,
    settings,
    backupsDir,
    marker,
    cleanup: () => {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}
