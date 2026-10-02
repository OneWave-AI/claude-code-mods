# inbox-alerts

Gmail + Slack alerts inside Claude Code: toasts, status count, and an Alerts pane.

Polls Gmail, Slack, and Google Calendar every two minutes through the claude.ai connectors, shows new items as toasts and a count in the status line, and keeps a tabbed Alerts pane. `/alerts triage` hands the backlog to Claude.

Needs the Gmail, Slack, and Google Calendar connectors connected in claude.ai. Set your email and Slack member ID in `/config` (or `pluginConfigs` in settings) so your own messages do not alert you.

## Install

In a Claude Code session (2.1.287 or later):

```
/plugin marketplace add OneWave-AI/claude-code-mods
/plugin install inbox-alerts@claude-code-mods
```

Or load this folder for one session: `claude --plugin-dir ./inbox-alerts`

## What it reaches

| Mod | Network | Runs processes | Files | Calls a model | Sends data anywhere |
| --- | --- | --- | --- | --- | --- |
| inbox-alerts | Through your claude.ai Gmail, Slack and Calendar connectors | No | No | `/alerts triage` sends alert snippets to Claude | Only to your Claude model |

Run `claude plugin validate ./inbox-alerts` to list every event it hooks and every call it makes. See the [repository README](../README.md#security) for the full security notes.

Part of [claude-code-mods](https://github.com/OneWave-AI/claude-code-mods) by [OneWave AI](https://www.onewave-ai.com). MIT licensed.
