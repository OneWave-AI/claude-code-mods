# boss-fight

Failing tests spawn a pixel boss; every run that fixes tests lands a hit, zero failures is a KO with loot.

![boss-fight](../screenshots/boss-fight.png)

When a test run fails, a pixel boss spawns with one HP per failing test. Every later run that fixes tests lands a hit. Zero failures is a KO with loot. Reads vitest, jest, pytest, mocha, and cargo test output.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install boss-fight@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./boss-fight`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| boss-fight | No | No | No | No | No |

Run `claude plugin validate ./boss-fight` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
