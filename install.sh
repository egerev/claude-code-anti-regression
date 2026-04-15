#!/usr/bin/env bash
# claude-code-anti-regression — install.sh
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/egerev/claude-code-anti-regression/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/egerev/claude-code-anti-regression/main/install.sh | bash -s -- check
#
# Prefers the npm package (Node 20+). Falls back to a jq-based implementation
# that covers install / check / uninstall. For `status`, use the npm package.

set -euo pipefail

SUBCOMMAND="${1:-install}"
shift || true

# --- Try npx path first ---------------------------------------------------
if command -v node >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
    exec npx -y claude-code-anti-regression@latest "$SUBCOMMAND" "$@"
  fi
fi

echo "Node 20+ not found — using bash fallback." >&2

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for the bash fallback." >&2
  echo "  macOS:  brew install jq" >&2
  echo "  Debian: sudo apt-get install jq" >&2
  echo "  RHEL:   sudo yum install jq" >&2
  exit 1
fi

# --- Constants (mirror of recommendations.json, v0.1.0) ------------------
REC_VERSION="0.1.0"
TOOL_VERSION="0.1.0"

CLAUDE_DIR="${HOME}/.claude"
SETTINGS="${CLAUDE_DIR}/settings.json"
BACKUPS_DIR="${CLAUDE_DIR}/backups"
MARKER="${CLAUDE_DIR}/.cc-anti-regression-marker.json"

# Allow override via env var for tests
if [ -n "${CC_AR_SETTINGS_PATH:-}" ]; then
  SETTINGS="$CC_AR_SETTINGS_PATH"
  CLAUDE_DIR="$(dirname "$SETTINGS")"
  BACKUPS_DIR="${CLAUDE_DIR}/backups"
  MARKER="${CLAUDE_DIR}/.cc-anti-regression-marker.json"
fi

ENV_KEYS=(
  "CLAUDE_CODE_EFFORT_LEVEL=max"
  "CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1"
  "MAX_THINKING_TOKENS=63999"
  "CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000"
)
TOP_KEYS_BOOL_TRUE=(
  "showThinkingSummaries"
)

# --- Helpers --------------------------------------------------------------

timestamp() { date -u +"%Y%m%d-%H%M%S"; }
iso8601() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

ensure_settings_exists() {
  if [ ! -f "$SETTINGS" ]; then
    mkdir -p "$(dirname "$SETTINGS")"
    echo '{}' > "$SETTINGS"
  fi
}

check_malformed() {
  if [ ! -f "$SETTINGS" ]; then
    return 1
  fi
  if ! jq -e . "$SETTINGS" >/dev/null 2>&1; then
    echo "Error: ${SETTINGS} is not valid JSON." >&2
    return 2
  fi
  return 0
}

# Read current value of .env.KEY from settings.json. Empty string if missing.
get_env_val() {
  local key="$1"
  jq -r --arg k "$key" '.env[$k] // empty' "$SETTINGS"
}

get_top_val() {
  local key="$1"
  jq -r --arg k "$key" '.[$k] // empty' "$SETTINGS"
}

# --- Commands -------------------------------------------------------------

cmd_check() {
  if [ ! -f "$SETTINGS" ]; then
    echo "⚠ ${SETTINGS} does not exist. Run 'install' to create it."
    return 0
  fi
  if ! check_malformed; then
    return 1
  fi
  local total=0 matched=0
  echo "Claude Code Anti-Regression — check"
  echo "─────────────────────────────────────"
  for pair in "${ENV_KEYS[@]}"; do
    local key="${pair%%=*}"
    local want="${pair#*=}"
    local cur
    cur="$(get_env_val "$key")"
    total=$((total+1))
    if [ "$cur" = "$want" ]; then
      echo "✅ ${key}=${cur}"
      matched=$((matched+1))
    elif [ -z "$cur" ]; then
      echo "❌ ${key} — missing (recommend \"${want}\")"
    else
      echo "❌ ${key}=\"${cur}\" (recommend \"${want}\")"
    fi
  done
  for key in "${TOP_KEYS_BOOL_TRUE[@]}"; do
    local cur
    cur="$(get_top_val "$key")"
    total=$((total+1))
    if [ "$cur" = "true" ]; then
      echo "✅ ${key}=true"
      matched=$((matched+1))
    elif [ -z "$cur" ]; then
      echo "❌ ${key} — missing (recommend true)"
    else
      echo "❌ ${key}=${cur} (recommend true)"
    fi
  done
  echo ""
  if [ "$matched" -eq "$total" ]; then
    echo "Status: ALL_SET (${matched} of ${total} set)"
    return 0
  else
    echo "Status: PARTIAL (${matched} of ${total} set)"
    echo "Run 'cc-anti-regression install' to apply missing."
    return 1
  fi
}

cmd_install() {
  ensure_settings_exists
  if ! check_malformed; then
    return 1
  fi

  # Compute diff
  local changed_env=()
  local changed_top=()
  for pair in "${ENV_KEYS[@]}"; do
    local key="${pair%%=*}"
    local want="${pair#*=}"
    local cur
    cur="$(get_env_val "$key")"
    if [ "$cur" != "$want" ]; then
      changed_env+=("$key=$want")
    fi
  done
  for key in "${TOP_KEYS_BOOL_TRUE[@]}"; do
    local cur
    cur="$(get_top_val "$key")"
    if [ "$cur" != "true" ]; then
      changed_top+=("$key")
    fi
  done

  if [ "${#changed_env[@]}" -eq 0 ] && [ "${#changed_top[@]}" -eq 0 ]; then
    echo "✅ Already up to date — all recommended values are applied."
    return 0
  fi

  # Backup
  mkdir -p "$BACKUPS_DIR"
  local ts backup_path
  ts="$(timestamp)"
  backup_path="${BACKUPS_DIR}/settings.json.${ts}.cc-anti-regression.bak"
  cp "$SETTINGS" "$backup_path"

  # Apply via jq. Build a single expression that sets all env keys and top-level keys.
  local filter='.'
  filter+=' | .env //= {}'
  for pair in "${ENV_KEYS[@]}"; do
    local key="${pair%%=*}"
    local want="${pair#*=}"
    filter+=" | .env[\"${key}\"] = \"${want}\""
  done
  for key in "${TOP_KEYS_BOOL_TRUE[@]}"; do
    filter+=" | .[\"${key}\"] = true"
  done

  local tmp
  tmp="$(mktemp)"
  jq "$filter" "$SETTINGS" > "$tmp"
  mv "$tmp" "$SETTINGS"

  # Build arrays as JSON
  local env_json='[]' top_json='[]'
  if [ "${#changed_env[@]}" -gt 0 ]; then
    env_json="$(printf '%s\n' "${changed_env[@]%%=*}" | jq -R . | jq -s .)"
  fi
  if [ "${#changed_top[@]}" -gt 0 ]; then
    top_json="$(printf '%s\n' "${changed_top[@]}" | jq -R . | jq -s .)"
  fi

  # Write marker
  jq -n \
    --arg applied_at "$(iso8601)" \
    --arg tool_version "$TOOL_VERSION" \
    --arg rec_version "$REC_VERSION" \
    --argjson env_keys "$env_json" \
    --argjson top_keys "$top_json" \
    --arg backup_path "$backup_path" \
    '{
      applied_at: $applied_at,
      tool_version: $tool_version,
      recommendations_version: $rec_version,
      applied: {
        settings_env: $env_keys,
        settings_top_level: $top_keys
      },
      backup_paths: [$backup_path]
    }' > "$MARKER"

  echo "✅ Applied."
  if [ "${#changed_env[@]}" -gt 0 ]; then
    for item in "${changed_env[@]}"; do
      echo "  + .env.${item%%=*}"
    done
  fi
  if [ "${#changed_top[@]}" -gt 0 ]; then
    for key in "${changed_top[@]}"; do
      echo "  + .${key}"
    done
  fi
  echo ""
  echo "Backup: ${backup_path}"
  echo ""
  echo "Restart Claude Code (exit + relaunch) for env vars to take effect."
}

cmd_uninstall() {
  if [ ! -f "$MARKER" ]; then
    echo "⚠ No marker file found — nothing to uninstall."
    return 0
  fi
  local backup_path
  backup_path="$(jq -r '.backup_paths[0] // empty' "$MARKER")"
  if [ -z "$backup_path" ] || [ ! -f "$backup_path" ]; then
    echo "Error: recorded backup ${backup_path} does not exist." >&2
    return 1
  fi
  cp "$backup_path" "$SETTINGS"
  rm -f "$MARKER"
  echo "✅ Restored. ${SETTINGS}"
  echo "Backup kept at: ${backup_path}"
  echo ""
  echo "Restart Claude Code to pick up the restored settings."
}

# --- Dispatch -------------------------------------------------------------

case "$SUBCOMMAND" in
  install)   cmd_install "$@" ;;
  check)     cmd_check "$@" ;;
  uninstall) cmd_uninstall "$@" ;;
  status)
    echo "Error: 'status' is not implemented in the bash fallback." >&2
    echo "Install the npm package to use 'status': npm install -g claude-code-anti-regression" >&2
    exit 1
    ;;
  -h|--help|help)
    cat <<'EOF'
Usage: install.sh [install|check|uninstall]

  install    Apply recommended env vars to ~/.claude/settings.json (default).
  check      Compare settings against recommendations.
  uninstall  Restore settings from the backup recorded in the marker file.

Prefers the npm package (requires Node 20+). Falls back to jq when Node is absent.

Env overrides (for tests):
  CC_AR_SETTINGS_PATH — override ~/.claude/settings.json location (backups
  and marker are then derived from its parent directory).
EOF
    ;;
  *)
    echo "Unknown subcommand: $SUBCOMMAND" >&2
    echo "Run 'install.sh help' for usage." >&2
    exit 1
    ;;
esac
