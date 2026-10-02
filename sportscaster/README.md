# sportscaster

Live TV play-by-play of your Claude Code session, spoken aloud with crowd effects.

![sportscaster](../screenshots/sportscaster.png)

Play-by-play commentary on the session, spoken aloud with generated crowd audio (cheers on passing tests, groans on fouls). `/caster booth` opens the booth pane. Loud. You have been warned.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install sportscaster@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./sportscaster`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| sportscaster | No | No | No | Yes, a summary of recent tool calls | Only to your Claude model |

Run `claude plugin validate ./sportscaster` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
