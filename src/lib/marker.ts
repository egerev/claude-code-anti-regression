import fs from "node:fs";
import path from "node:path";

export interface Marker {
  applied_at: string;
  tool_version: string;
  recommendations_version: string;
  applied: {
    settings_env: string[];
    settings_top_level: string[];
    agents_installed?: string[];
  };
  backup_paths: string[];
}

export function readMarker(markerPath: string): Marker | null {
  if (!fs.existsSync(markerPath)) return null;
  const raw = fs.readFileSync(markerPath, "utf8");
  const data = JSON.parse(raw) as unknown;
  if (!isMarker(data)) {
    throw new Error(`Malformed marker file at ${markerPath}`);
  }
  return data;
}

export function writeMarker(markerPath: string, marker: Marker): void {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2) + "\n", "utf8");
}

export function deleteMarker(markerPath: string): void {
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
}

function isMarker(value: unknown): value is Marker {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.applied_at !== "string" ||
    typeof v.tool_version !== "string" ||
    typeof v.recommendations_version !== "string"
  ) {
    return false;
  }
  const applied = v.applied as Record<string, unknown> | undefined;
  if (!applied || typeof applied !== "object") return false;
  if (
    !Array.isArray(applied.settings_env) ||
    !Array.isArray(applied.settings_top_level)
  ) {
    return false;
  }
  if (!Array.isArray(v.backup_paths)) return false;
  return true;
}
