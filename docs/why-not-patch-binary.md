# Why this tool does not patch `cli.js`

## The honest limitation of env-vars

Env vars applied to `~/.claude/settings.json` are read by Claude Code at startup and used to configure the main request loop. That's enough to close most of the regression gap — but not all of it.

Per [`@Frisch12`'s binary analysis on issue #42796](https://github.com/anthropics/claude-code/issues/42796):

- `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` is checked in **1 of 5** adaptive code paths.
- The remaining 4 paths — notably subagent spawning through the `V9H()` helper and some tool-use fallbacks — do not check the env var. They apply adaptive thinking unconditionally.

Practical consequence: if you rely on subagents (Agent tool invocations, Task-based parallel work), they will still occasionally produce zero-thinking turns even with this tool installed. The main loop, however, is fixed.

## Why we don't patch `cli.js` directly

It would be trivial to write a patcher that edits `cli.js` to force-disable adaptive thinking everywhere. We deliberately do not, for three reasons:

1. **Terms of Service.** Anthropic's ToS forbid reverse engineering or modifying their software. A patcher walks squarely into that grey area. Even if individual patches are low-risk in practice, publishing a tool that automates binary modification normalises it and puts users in a position where Anthropic support may decline to help them.

2. **Fragility.** `cli.js` is re-minified on every Claude Code release. Variable names like `V9H` change from one build to the next. A patcher would need per-version signatures, maintained manually. With the 2.1.104+ Bun-compiled binary, the patch surface becomes a native executable — substantially harder and riskier to modify.

3. **It's a workaround, not a fix.** The right remedy is upstream. Anthropic has acknowledged the regression in the issue tracker and on Hacker News. The correct path is: apply env vars as a partial mitigation, track the upstream fix, remove the workaround when it lands. A binary patcher would delay that cycle by making the symptom tolerable.

## What to do about subagents

For users of opinionated workflow frameworks (SuperFlow and similar), the answer is to define agents explicitly in `~/.claude/agents/*.md` with `effort: max` or `effort: high` frontmatter. That closes the subagent gap for agents *you* define and spawn explicitly. Built-in subagents (those defined inside the Claude Code binary itself) remain out of reach until Anthropic ships the fix.

Pattern-based agent-file patching is intentionally out of scope for v0.1 of this tool (see v0.2 roadmap). For now: if you use SuperFlow, run `superflow update`. If you have a custom setup, edit your agent files manually.

## When to remove this tool

Watch [issue #42796](https://github.com/anthropics/claude-code/issues/42796) for the upstream fix. When Anthropic raises the default effort back to `high` (or exposes a proper config knob), `cc-anti-regression uninstall` returns your `settings.json` to its pre-install state. Backups are kept, so there's no lossy path.
