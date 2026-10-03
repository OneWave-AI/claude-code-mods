# swarm

Mission control for subagents and agent teams: who is running, what each is doing, who spawned whom, who is talking to whom, and how they overlap.

![swarm](../screenshots/swarm.png)

`/swarm` opens a live pane with an orchestration tree (lead at the top, every subagent nested under whoever spawned it, with its type, model, current action and tool-call count), a timeline of how the agents overlap, arcs and a log for messages between agents, and an activity feed. A status line shows the live count while agents run, and a toast sums things up when the swarm stands down.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install swarm@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./swarm`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| swarm | No | No | No | No | No |

It reads agent state through `$.agent.list` and the `agent.spawn`, `tool.call`, `session.send` and `session.receive` events. Run `claude plugin validate ./swarm` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
