import fs from "node:fs";
import { recommendationsPath } from "./paths.js";

export interface Recommendations {
  version: string;
  settings_env: Record<string, string>;
  settings_top_level: Record<string, unknown>;
}

export function loadRecommendations(filePath?: string): Recommendations {
  const resolved = filePath ?? recommendationsPath();
  const raw = fs.readFileSync(resolved, "utf8");
  const data = JSON.parse(raw) as unknown;
  if (!isRecommendations(data)) {
    throw new Error(`Malformed recommendations.json at ${resolved}`);
  }
  return data;
}

function isRecommendations(value: unknown): value is Recommendations {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "string" &&
    typeof v.settings_env === "object" &&
    v.settings_env !== null &&
    typeof v.settings_top_level === "object" &&
    v.settings_top_level !== null
  );
}
