# claude-code-anti-regression

[![npm version](https://img.shields.io/npm/v/claude-code-anti-regression.svg)](https://www.npmjs.com/package/claude-code-anti-regression)
[![CI](https://github.com/egerev/claude-code-anti-regression/actions/workflows/ci.yml/badge.svg)](https://github.com/egerev/claude-code-anti-regression/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## TL;DR

A small CLI that applies a curated set of env vars to `~/.claude/settings.json` to mitigate the Feb–Mar 2026 Claude Code quality regression. Idempotent, reversible, dry-run-able, and never destroys data without a timestamped backup. For everyone who isn't already fixing this via SuperFlow.

## What it does

Merges the following into `~/.claude/settings.json`, preserving every unrelated key (hooks, permissions, custom env vars):

- `env.CLAUDE_CODE_EFFORT_LEVEL = "max"` — force maximum reasoning effort
- `env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING = "1"` — disable adaptive thinking heuristic
- `env.MAX_THINKING_TOKENS = "63999"` — raise the per-turn thinking budget
- `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = "400000"` — extend auto-compaction window
- `showThinkingSummaries = true` — surface thinking summaries in the UI

Before any write, a timestamped backup of your original `settings.json` lands in `~/.claude/backups/`. A marker file at `~/.claude/.cc-anti-regression-marker.json` records what was applied so `uninstall` can restore byte-for-byte.

## Why it exists

In Feb–Mar 2026 Anthropic shipped two changes that measurably regressed Claude Code quality:

1. **Adaptive thinking** (Feb 9, with Opus 4.6) — the model self-paces reasoning per turn and produces zero-thinking turns even at `effort=high`.
2. **Default effort lowered** (Mar 3) from `high` to `medium`.

A senior AI Director at AMD published a log analysis of 6,852 sessions: reads-per-edit dropped 6.6 → 2.0, full-rewrites roughly doubled, a "give up" hook fired 173× in 17 days vs. 0 previously. Anthropic's Boris Cherny acknowledged the regression and recommended env-var workarounds.

- [GitHub issue #42796](https://github.com/anthropics/claude-code/issues/42796) — AMD report + bcherny reply
- [Hacker News discussion](https://news.ycombinator.com/item?id=47664442)

The recommended env vars work, but applying them by hand means editing JSON, remembering the key names, and re-applying whenever you touch `settings.json`. This tool automates that.

## Install

**npm (recommended)** — requires Node 20+:

```bash
npm install -g claude-code-anti-regression
```

**Bash one-liner** — uses `npx` if Node 20+ is available, falls back to `jq` otherwise:

```bash
curl -fsSL https://raw.githubusercontent.com/egerev/claude-code-anti-regression/main/install.sh | bash
```

## Quick start

```bash
# See what's missing
cc-anti-regression check

# Apply recommendations (interactive confirmation)
cc-anti-regression install

# Non-interactive (for CI / scripted setups)
cc-anti-regression install --yes
```

After `install`, **restart Claude Code** (exit + relaunch) for env vars to take effect.

## Each env var explained

### `CLAUDE_CODE_EFFORT_LEVEL=max`

Forces Claude Code to request maximum reasoning effort on every turn, overriding the Mar 3 default drop to `medium`. Trade-off: ~2–4× more thinking tokens per turn. If you pay per token, you'll feel it.

### `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1`

Disables the adaptive thinking heuristic introduced on Feb 9 with Opus 4.6. With adaptive thinking on, the model sometimes skips thinking entirely on turns where it *should* think, producing shallow answers and more "give up" outcomes. **Caveat**: per binary analysis, this env var only covers 1 of 5 adaptive code paths in the current CLI — subagent paths via `V9H()` ignore it. So this helps the main loop but not all spawned subagents. See [`docs/why-not-patch-binary.md`](docs/why-not-patch-binary.md).

### `MAX_THINKING_TOKENS=63999`

Raises the per-turn thinking budget to the model's maximum. Without this, long-horizon tasks (reviews, architectural planning) get truncated reasoning. Trade-off: latency and tokens.

### `CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000`

Extends the context window before auto-compaction kicks in. Auto-compaction aggressively summarises older context, which can lose detail the model needs later. A wider window delays that trade.

### `showThinkingSummaries=true`

UI-only: shows the model's thinking summaries inline in the transcript. Purely diagnostic — helps you see *why* a turn went shallow, which is how regressions were discovered in the first place.

## Uninstall

```bash
cc-anti-regression uninstall
```

This restores `~/.claude/settings.json` byte-for-byte from the backup recorded in the marker file. Backup files are **kept** so you can re-apply later if you change your mind.

## Why I might NOT want this

- **Token cost**: `CLAUDE_CODE_EFFORT_LEVEL=max` + `MAX_THINKING_TOKENS=63999` roughly 2–4× your thinking token bill. If you're on a metered plan or burning through quotas, reconsider.
- **Latency**: max-effort turns take noticeably longer. If your workflow is interactive-heavy (many short prompts), the extra latency adds up.
- **This is a workaround, not a fix**: the root cause is in Anthropic's CLI. Env vars partially compensate, but subagent code paths still ignore some of them (see [`docs/why-not-patch-binary.md`](docs/why-not-patch-binary.md) for the honest version — and why this tool deliberately does *not* patch `cli.js`).
- **Future-proofing**: when Anthropic ships a real fix, these env vars may become redundant or harmful. Re-check the [issue tracker](https://github.com/anthropics/claude-code/issues/42796) periodically.

## For SuperFlow users

If you use [SuperFlow](https://github.com/egerev/superflow), you don't need this tool. SuperFlow ships its own anti-regression onboarding check (PR #64) that applies the same env vars *and* manages agent effort frontmatter — which this tool does not, by design. Run `superflow update` to pull the latest recommendations. This tool exists for everyone else.

## Contributing

Issues, PRs, and recommendation updates welcome at the [issue tracker](https://github.com/egerev/claude-code-anti-regression/issues). Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Small PRs preferred.

## License

[MIT](LICENSE) © 2026 egerev
