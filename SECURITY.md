# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub's
[private vulnerability reporting](https://github.com/OneWave-AI/claude-code-mods/security/advisories/new)
for this repository. We aim to reply within three business days.

Useful to include: the mod, the Claude Code version (`claude --version`), and the steps that
reproduce the problem.

## Scope

In scope: anything in these mods that leaks data, runs a command or makes a request the README
does not describe, or lets text from an email, Slack message, web page, or file steer Claude
into an action the user did not ask for.

Out of scope: Claude Code itself. Report those to Anthropic.

## Before you install any mod

A mod runs inside Claude Code with your permissions and is not sandboxed. Run
`claude plugin validate <folder>` and read the `hooks:` and `calls:` lines before loading one,
from this repository or anywhere else.
