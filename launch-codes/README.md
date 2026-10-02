# launch-codes

Dangerous Bash commands need launch codes: red alert pane, siren, a code to arm and a LAUNCH to fire.

![launch-codes](../screenshots/launch-codes.png)

Hooks `tool.call` on Bash and classifies the command before it runs: risky `rm -rf`, `git push --force`, `git reset --hard`, `DROP`/`TRUNCATE` through a live SQL client, `supabase db reset`, `vercel --prod`, `chmod -R 777`, and downloaded scripts piped into a shell. A match opens a red-alert pane with a siren and a one-time code. Type the code to arm, press LAUNCH to fire. Anything else is denied and Claude is told why. `/launch-codes test <command>` shows the verdict without running anything.

It is strict. It blocked one of our own cleanup commands while we were putting this repo together, which is the point.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install launch-codes@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./launch-codes`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| launch-codes | No | No | No | No | No |

Run `claude plugin validate ./launch-codes` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
