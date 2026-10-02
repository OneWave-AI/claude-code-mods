# agent-race

Race Claude Code sessions on a task: live split-screen race track scoreboard.

![agent-race](../screenshots/agent-race.png)

`/race start <race> [name]` in two or more sessions puts them on the same track. The pane shows each session's tool calls, files touched, and test runs live, and `/race done` crosses the finish line. Good for comparing models or prompts on the same task.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install agent-race@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./agent-race`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| agent-race | No | No | Reads and writes `~/.claude/agent-race/<race>/` | No | No |

Run `claude plugin validate ./agent-race` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
