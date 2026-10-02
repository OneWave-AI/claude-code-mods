# Claude Code Mods

Ten mods for Claude Code, built in one night.

A mod is a Claude Code plugin made of function hooks. It can draw a live pane beside the transcript, a band above the prompt, a status line, or a toast. It can also block, rewrite, or react to any tool call, add slash commands, play sounds, and call the model. Mods hot-reload while you work.

These are a mix of useful and ridiculous. All of them are MIT licensed. Fork them, break them, ship your own.

| Mod | Command | What it does |
| --- | --- | --- |
| [burn-meter](#burn-meter) | `/burn` | Live session cost above the prompt, with plan-limit bars and real-world comparisons |
| [launch-codes](#launch-codes) | `/launch-codes` | Dangerous Bash commands (rm -rf, force push, DROP, curl to bash, prod deploys) need a code before they run |
| [session-wrapped](#session-wrapped) | `/wrapped` | Spotify Wrapped for a session: animated reveal plus a shareable PNG card |
| [boss-fight](#boss-fight) | `/boss` | Failing tests spawn a pixel boss. Each run that fixes tests lands a hit |
| [code-pet](#code-pet) | `/pet` | A pixel pet that eats on tool calls, gets sick on failures, and panics on rm -rf |
| [inner-monologue](#inner-monologue) | `/monologue` | A pane of Claude's dry inner thoughts about your session |
| [sportscaster](#sportscaster) | `/caster` | TV play-by-play of your session, spoken aloud, with crowd effects |
| [agent-narrator](#agent-narrator) | `/narrate` | Every agent step in plain English, with a time-saved counter. Built for showing non-engineers |
| [agent-race](#agent-race) | `/race` | Race several Claude Code sessions on the same task on a live scoreboard |
| [inbox-alerts](#inbox-alerts) | `/alerts` | Gmail, Slack, and Calendar alerts inside Claude Code as toasts, a status count, and a pane |

## Install

Requires Claude Code 2.1.287 or later.

```bash
git clone <this repo's URL> ~/claude-code-mods
```

Try one for a single session:

```bash
claude --plugin-dir ~/claude-code-mods/burn-meter
```

Repeat `--plugin-dir` to load several. To load mods in every session (including the desktop app), add them to the `env` block of `~/.claude/settings.json`, separated by `:`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-code-mods/burn-meter:~/claude-code-mods/session-wrapped"
  }
}
```

Every mod has tests:

```bash
claude plugin validate ~/claude-code-mods/burn-meter
claude plugin test ~/claude-code-mods/burn-meter
```

Most mods have a `demo` subcommand (`/boss demo`, `/pet demo`, `/burn demo`) so you can see them without waiting for the real event.

## The mods

### burn-meter

![burn-meter](screenshots/burn-meter.png)

A band above the prompt with a growing fire bar for session spend, 5-hour and weekly plan-limit bars with reset times, and the cost converted into burritos and McDoubles. `/burn` opens the full panel with per-turn cost. Alerts fire when you cross a threshold.

### launch-codes

![launch-codes](screenshots/launch-codes.png)

Hooks `tool.call` on Bash and classifies the command before it runs: risky `rm -rf`, `git push --force`, `git reset --hard`, `DROP`/`TRUNCATE` through a live SQL client, `supabase db reset`, `vercel --prod`, `chmod -R 777`, and downloaded scripts piped into a shell. A match opens a red-alert pane with a siren and a one-time code. Type the code to arm, press LAUNCH to fire. Anything else is denied and Claude is told why. `/launch-codes test <command>` shows the verdict without running anything.

It is strict. It blocked one of our own cleanup commands while we were putting this repo together, which is the point.

### session-wrapped

![session-wrapped](screenshots/session-wrapped.png)

`/wrapped` plays an animated stat reveal (session length, tool calls, MVP tool, red-to-green test runs, longest turn, cost) and writes a 1200px PNG card to your Desktop. Week and month totals come from `scripts/usage.py`, which reads your local transcripts in `~/.claude/projects` and caches the rollups. Needs `python3`. Nothing leaves your machine.

### boss-fight

![boss-fight](screenshots/boss-fight.png)

When a test run fails, a pixel boss spawns with one HP per failing test. Every later run that fixes tests lands a hit. Zero failures is a KO with loot. Reads vitest, jest, pytest, mocha, and cargo test output.

### code-pet

![code-pet](screenshots/code-pet.png)

A pixel pet in a pane. It eats when Claude calls tools, gets sick when they fail, panics when a destructive command shows up, sleeps when the session is idle, and evolves as you ship. `/pet rename <name>`, `/pet snack`.

### inner-monologue

![inner-monologue](screenshots/inner-monologue.png)

While the pane is open, a model call every so often turns the recent prompts and tool calls into one dry line, typed out live. Harmless and weirdly useful for noticing when the agent is flailing.

### sportscaster

![sportscaster](screenshots/sportscaster.png)

Play-by-play commentary on the session, spoken aloud with generated crowd audio (cheers on passing tests, groans on fouls). `/caster booth` opens the booth pane. Loud. You have been warned.

### agent-narrator

![agent-narrator](screenshots/agent-narrator.png)

Translates every tool call into one plain-English sentence ("Reading the pricing page to find the old numbers") and keeps a running estimate of time saved. `/narrate smart` uses a model call per step; the default is rule-based and free. `/narrate demo` plays a scripted session. We built this for training sessions where the audience has never seen an agent work.

### agent-race

![agent-race](screenshots/agent-race.png)

`/race start <race> [name]` in two or more sessions puts them on the same track. The pane shows each session's tool calls, files touched, and test runs live, and `/race done` crosses the finish line. Good for comparing models or prompts on the same task.

### inbox-alerts

Polls Gmail, Slack, and Google Calendar every two minutes through the claude.ai connectors, shows new items as toasts and a count in the status line, and keeps a tabbed Alerts pane. `/alerts triage` hands the backlog to Claude.

Needs the Gmail, Slack, and Google Calendar connectors connected in claude.ai. Set your email and Slack member ID in `/config` (or `pluginConfigs` in settings) so your own messages do not alert you.

## Writing your own

Ask Claude Code to make one. The built-in `plugin-authoring` skill knows the API: say "make a mod that..." and it writes the folder, validates it, and hot-reloads it into the session. Each mod here is three files at minimum:

```
my-mod/
  .claude-plugin/plugin.json   name, version, description
  hooks/hooks.json             { "modules": ["./register.tsx"] }
  hooks/register.tsx           export const register: Register = (on, options) => { ... }
```

## License

MIT. See [LICENSE](LICENSE).
