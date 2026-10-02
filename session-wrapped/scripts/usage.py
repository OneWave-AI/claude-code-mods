#!/usr/bin/env python3
"""Week and month usage from Claude Code transcripts, for /wrapped.

Reads ~/.claude/projects/**/*.jsonl, folds each file into per-day rollups,
caches them by (mtime, size) so later runs only re-read changed files, and
prints {"week": Window, "month": Window} as JSON on stdout.
"""
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude", "projects")
CACHE = os.path.join(HOME, ".cache", "session-wrapped", "usage-v3.json")
DAYS = 30
UUIDISH = re.compile(r"^[0-9a-f]{8}[-_][0-9a-f]{4}")
COMMAND = re.compile(r"<command-name>/?([\w:.-]+)</command-name>")
BUILTIN = {"clear", "compact", "model", "config", "plugin", "plugins", "reload-plugins", "resume", "cost", "context", "help",
           "login", "logout", "exit", "mcp", "memory", "permissions", "status", "doctor", "init", "fast", "effort", "diff",
           "agents", "hooks", "rewind", "export", "add-dir", "ide", "theme", "usage", "btw", "artifacts", "statusline"}


def connector(tool):
    # mcp__claude_ai_Gmail__search_threads -> Gmail; mcp__plugin_x_slack__y -> slack
    parts = tool.split("__")
    if len(parts) < 3:
        return None
    name = parts[1]
    for prefix in ("claude_ai_", "plugin_"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    if "_" in name and parts[1].startswith("plugin_"):
        name = name.split("_", 1)[1]
    if UUIDISH.match(name):
        return None
    return name.replace("_", " ").replace("-", " ").strip() or None


def model_name(m):
    # claude-opus-5-5 -> Opus 5.5; claude-haiku-4-5-20251001 -> Haiku 4.5
    if not m or m.startswith("<"):
        return None
    bits = [b for b in m.replace("claude-", "").split("-") if not (b.isdigit() and len(b) == 8)]
    family = next((b for b in bits if b.isalpha()), None)
    nums = [b for b in bits if b.isdigit()]
    if not family:
        return m
    return family.capitalize() + (" " + ".".join(nums) if nums else "")


def empty_day():
    return {"sessions": [], "prompts": 0, "tokens": 0, "out": 0,
            "models": {}, "tools": {}, "skills": {}, "connectors": {}}


def fold_file(path, since):
    days = {}
    seen = set()
    usage = {}
    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except OSError:
        return days
    with fh:
        for line in fh:
            is_assistant = '"type":"assistant"' in line
            is_user = not is_assistant and '"type":"user"' in line and '"tool_result"' not in line
            if not (is_assistant or is_user):
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            ts = rec.get("timestamp")
            if not ts or ts[:10] < since:
                continue
            day = days.setdefault(ts[:10], empty_day())
            msg = rec.get("message") or {}
            if is_user:
                if rec.get("isMeta") or rec.get("isSidechain"):
                    continue
                text = msg.get("content")
                if isinstance(text, list):
                    text = " ".join(c.get("text", "") for c in text if isinstance(c, dict) and c.get("type") == "text")
                if not isinstance(text, str) or not text.strip():
                    continue
                day["prompts"] += 1
                sid = rec.get("sessionId")
                if sid and sid not in day["sessions"]:
                    day["sessions"].append(sid)
                for cmd in COMMAND.findall(text):
                    if cmd not in BUILTIN:
                        day["skills"][cmd] = day["skills"].get(cmd, 0) + 1
                continue
            mid = msg.get("id")
            if mid:
                # Streamed blocks repeat the message; the last usage is the final one.
                usage[mid] = (ts[:10], model_name(msg.get("model")), msg.get("usage") or {})
            for c in msg.get("content") or []:
                if not isinstance(c, dict) or c.get("type") != "tool_use" or c.get("id") in seen:
                    continue
                seen.add(c.get("id"))
                tool = c.get("name") or "?"
                day["tools"][tool] = day["tools"].get(tool, 0) + 1
                if tool == "Skill":
                    skill = (c.get("input") or {}).get("skill")
                    if skill:
                        day["skills"][skill] = day["skills"].get(skill, 0) + 1
                conn = connector(tool) if tool.startswith("mcp__") else None
                if conn:
                    day["connectors"][conn] = day["connectors"].get(conn, 0) + 1
    for date, name, u in usage.values():
        day = days.setdefault(date, empty_day())
        total = sum(int(u.get(k) or 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        day["tokens"] += total
        day["out"] += int(u.get("output_tokens") or 0)
        if name and total:
            day["models"][name] = day["models"].get(name, 0) + total
    return days


def window(rollups, start):
    w = {"sessions": set(), "prompts": 0, "tokens": 0, "out": 0, "activeDays": 0,
         "models": Counter(), "tools": Counter(), "skills": Counter(), "connectors": Counter()}
    active = set()
    for days in rollups:
        for date, d in days.items():
            if date < start:
                continue
            active.add(date)
            w["sessions"].update(d["sessions"])
            for k in ("prompts", "tokens", "out"):
                w[k] += d[k]
            for k in ("models", "tools", "skills", "connectors"):
                w[k].update(d[k])
    return {
        "sessions": len(w["sessions"]),
        "prompts": w["prompts"],
        "tokens": w["tokens"],
        "out": w["out"],
        "activeDays": len(active),
        "models": w["models"].most_common(5),
        "tools": w["tools"].most_common(8),
        "toolKinds": len(w["tools"]),
        "skills": w["skills"].most_common(8),
        "skillKinds": len(w["skills"]),
        "connectors": w["connectors"].most_common(8),
        "connectorKinds": len(w["connectors"]),
    }


def main():
    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=DAYS)).strftime("%Y-%m-%d")
    cutoff = time.time() - (DAYS + 1) * 86400
    try:
        with open(CACHE) as fh:
            cache = json.load(fh)
    except (OSError, ValueError):
        cache = {}
    fresh = {}
    for dirpath, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith(".jsonl"):
                continue
            path = os.path.join(dirpath, f)
            try:
                st = os.stat(path)
            except OSError:
                continue
            if st.st_mtime < cutoff:
                continue
            key = f"{int(st.st_mtime)}:{st.st_size}"
            hit = cache.get(path)
            if hit and hit.get("key") == key:
                fresh[path] = hit
            else:
                fresh[path] = {"key": key, "days": fold_file(path, since)}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = CACHE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(fresh, fh)
    os.replace(tmp, CACHE)
    rollups = [v["days"] for v in fresh.values()]
    week = (now - timedelta(days=6)).strftime("%Y-%m-%d")
    json.dump({"week": window(rollups, week), "month": window(rollups, since), "at": int(time.time() * 1000)}, sys.stdout)


if __name__ == "__main__":
    main()
