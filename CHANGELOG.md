# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-15

### Added

- `install` command — merges recommended env vars and top-level keys into `~/.claude/settings.json`.
  Preserves unrelated keys, hooks, permissions, custom env vars. Creates timestamped backup in
  `~/.claude/backups/` before any modification. Idempotent.
- `check` command — reports which recommended values are applied vs missing. Supports `--json` and
  `--exit-code` flags for CI/scripting.
- `uninstall` command — restores `~/.claude/settings.json` byte-for-byte from the backup recorded
  in the marker file.
- `status` command — prints last apply timestamp, tool version, and current state.
- Bash fallback `install.sh` — implements install/check/uninstall via `jq` for users without Node.
- `recommendations.json` — single source of truth for recommended values. v0.1 covers
  `CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`, `MAX_THINKING_TOKENS`,
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, and `showThinkingSummaries`.

### Not in v0.1 (deferred)

- Agent file patching (`--with-agents` flag). User-defined agents in `~/.claude/agents/*.md` are
  reported in `check` output but not modified. See roadmap for v0.2.

[0.1.0]: https://github.com/egerev/claude-code-anti-regression/releases/tag/v0.1.0
