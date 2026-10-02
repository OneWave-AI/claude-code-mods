# code-pet

A pixel pet that lives in a pane and reacts to what Claude does: eats on tool calls, gets sick on failures, panics on rm -rf, sleeps when idle, evolves as you ship.

![code-pet](../screenshots/code-pet.png)

A pixel pet in a pane. It eats when Claude calls tools, gets sick when they fail, panics when a destructive command shows up, sleeps when the session is idle, and evolves as you ship. `/pet rename <name>`, `/pet snack`.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install code-pet@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./code-pet`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| code-pet | No | No | No | No | No |

Run `claude plugin validate ./code-pet` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
