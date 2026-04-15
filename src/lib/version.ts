import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./paths.js";

let cached: string | undefined;

export function toolVersion(): string {
  if (cached) return cached;
  const pkgPath = path.join(packageRoot(), "package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  cached = pkg.version ?? "0.0.0";
  return cached;
}
