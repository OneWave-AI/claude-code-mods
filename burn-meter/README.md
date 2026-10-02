# burn-meter

Live session cost odometer above the prompt: a burning fuse, real-world comparisons, threshold alerts.

![burn-meter](../screenshots/burn-meter.png)

A band above the prompt with a growing fire bar for session spend, 5-hour and weekly plan-limit bars with reset times, and the cost converted into burritos and McDoubles. `/burn` opens the full panel with per-turn cost. Alerts fire when you cross a threshold.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install burn-meter@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./burn-meter`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| burn-meter | No | No | No | No | No |

Run `claude plugin validate ./burn-meter` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
