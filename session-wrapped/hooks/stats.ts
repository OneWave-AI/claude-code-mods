/** Session stats: the reducers the hooks feed, and the cards they reveal. Pure. */

import type { Limits, Stats, Usage, UsageWindow } from '../types'

export const empty = (startedAt: number): Stats => ({
  startedAt,
  tools: {},
  files: {},
  bash: 0,
  tests: { pass: 0, fail: 0, comebacks: 0, last: null },
  turns: 0,
  longestTurnMs: 0,
  usd: 0,
  skills: {},
  connectors: {},
  model: '',
})

const TEST_RUN = /\b(vitest|jest|pytest|playwright\s+test|mocha|cargo\s+test|go\s+test|bun\s+test|deno\s+test|claude\s+plugin\s+test|(npm|pnpm|yarn)\s+(run\s+)?test\b|npm\s+t\b|rspec|phpunit)/

export const isTestRun = (command: string) => TEST_RUN.test(command)

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** `mcp__claude_ai_Gmail__search_threads` -> `Gmail`; null for a built-in tool. */
export const connectorOf = (tool: string) => {
  const parts = tool.split('__')
  if (parts[0] !== 'mcp' || parts.length < 3) return null
  const raw = parts[1] ?? ''
  let name = raw.replace(/^claude_ai_/, '').replace(/^plugin_/, '')
  if (raw.startsWith('plugin_') && name.includes('_')) name = name.slice(name.indexOf('_') + 1)
  if (/^[0-9a-f]{8}[-_][0-9a-f]{4}/.test(name)) return null
  return name.replace(/[_-]+/g, ' ').trim() || null
}

const bump = (counts: Record<string, number>, key: string | null | undefined) =>
  key ? { ...counts, [key]: (counts[key] ?? 0) + 1 } : counts

/** Folds one finished tool call into the stats. */
export const addCall = (
  s: Stats,
  call: { tool: string; filePath?: string; command?: string; skill?: string; isError: boolean },
): Stats => {
  const tools = { ...s.tools, [call.tool]: (s.tools[call.tool] ?? 0) + 1 }
  const skills = call.tool === 'Skill' ? bump(s.skills ?? {}, call.skill) : s.skills ?? {}
  const connectors = bump(s.connectors ?? {}, connectorOf(call.tool))
  const files = { ...s.files }
  if (EDITS.has(call.tool) && call.filePath) files[call.filePath] = (files[call.filePath] ?? 0) + 1
  let { bash, tests } = s
  if (call.tool === 'Bash') {
    bash += 1
    if (call.command && isTestRun(call.command)) {
      const result = call.isError ? 'fail' : 'pass'
      tests = {
        pass: tests.pass + (result === 'pass' ? 1 : 0),
        fail: tests.fail + (result === 'fail' ? 1 : 0),
        comebacks: tests.comebacks + (tests.last === 'fail' && result === 'pass' ? 1 : 0),
        last: result,
      }
    }
  }
  return { ...s, tools, files, bash, tests, skills, connectors }
}

export const addTurn = (s: Stats, ms: number): Stats => ({
  ...s,
  turns: s.turns + 1,
  longestTurnMs: Math.max(s.longestTurnMs, ms),
})

const top = (counts: Record<string, number>) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null

export const mvp = (s: Stats) => top(s.tools)
export const topFile = (s: Stats) => top(s.files)
export const totalCalls = (s: Stats) => Object.values(s.tools).reduce((a, b) => a + b, 0)

/** `3.5B`, `840M`, `12K`, `950`. */
export const compact = (n: number) => {
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]
  for (const [size, unit] of units) {
    if (n >= size) {
      const v = n / size
      return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}${unit}`
    }
  }
  return String(Math.round(n))
}

/** `claude-opus-5-5[1m]` -> `Opus 5.5`; a name already pretty passes through. */
export const prettyModel = (model: string) => {
  const id = model.replace(/\[.*\]$/, '').trim()
  if (!/^claude-/.test(id)) return id
  const bits = id.replace(/^claude-/, '').split('-').filter(b => !/^\d{8}$/.test(b))
  const family = bits.find(b => /^[a-z]+$/i.test(b))
  const nums = bits.filter(b => /^\d+$/.test(b))
  if (!family) return id
  return `${family[0]!.toUpperCase()}${family.slice(1)}${nums.length ? ` ${nums.join('.')}` : ''}`
}

const comma = (n: number) => Math.round(n).toLocaleString('en-US')

/** `Opus 5.5 52%, Opus 5 44%`: the leaders after the first, by share. */
const rest = (pairs: [string, number][], skip: number, total: number, count = 2) =>
  pairs
    .slice(skip, skip + count)
    .map(([name, n]) => (total > 0 ? `${name} ${Math.round((n / total) * 100)}%` : name))
    .join(', ')

const names = (pairs: [string, number][], skip: number, count = 2) =>
  pairs.slice(skip, skip + count).map(([name]) => name).join(', ')

/** `1H 23M`, `14M`, `45S`. */
export const span = (ms: number) => {
  const m = Math.floor(ms / 60000)
  if (m >= 60) return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M`
  if (m >= 1) return `${m}M`
  return `${Math.max(0, Math.round(ms / 1000))}S`
}

const base = (path: string) => path.split('/').pop() ?? path

export type Card = { label: string; value: string; note: string; accent: 'gold' | 'blue' | 'paper' }

/** The reveal, in order: each card one stat, the big number first. */
export const cards = (s: Stats, now: number): Card[] => {
  const best = mvp(s)
  const file = topFile(s)
  return [
    {
      label: 'SESSION LENGTH',
      value: span(now - s.startedAt),
      note: `${s.turns} turn${s.turns === 1 ? '' : 's'}${s.model ? ` on ${prettyModel(s.model)}` : ''}`,
      accent: 'paper',
    },
    { label: 'TOOL CALLS', value: String(totalCalls(s)), note: `${Object.keys(s.tools).length} different tools`, accent: 'blue' },
    { label: 'MVP', value: best ? best[0].toUpperCase().slice(0, 10) : 'NONE', note: best ? `called ${best[1]} times` : 'quiet session', accent: 'gold' },
    { label: 'FILES TOUCHED', value: String(Object.keys(s.files).length), note: file ? `most: ${base(file[0])} x${file[1]}` : 'read-only session', accent: 'blue' },
    { label: 'BASH RUNS', value: String(s.bash), note: `${s.tests.pass + s.tests.fail} test runs`, accent: 'paper' },
    { label: 'RED TO GREEN', value: String(s.tests.comebacks), note: `${s.tests.fail} red, ${s.tests.pass} green`, accent: 'gold' },
    { label: 'LONGEST TURN', value: span(s.longestTurnMs), note: 'one prompt', accent: 'paper' },
    { label: 'COST', value: `$${s.usd.toFixed(2)}`, note: `$${(s.usd / Math.max(1, totalCalls(s))).toFixed(3)} / call`, accent: 'gold' },
  ]
}

/** The session's kit: skills and connectors. */
export const kitCards = (s: Stats, usage: Usage | null): Card[] => {
  const skills = Object.entries(s.skills ?? {}).sort((a, b) => b[1] - a[1])
  const connectors = Object.entries(s.connectors ?? {}).sort((a, b) => b[1] - a[1])
  const month = usage?.month
  return [
    {
      label: 'SKILLS USED',
      value: String(skills.length),
      note: skills.length ? names(skills, 0, 2) : month ? `${month.skillKinds} this month` : 'none this session',
      accent: 'gold',
    },
    {
      label: 'CONNECTORS',
      value: String(connectors.length),
      note: connectors.length ? names(connectors, 0, 2) : month ? `${month.connectorKinds} this month` : 'none this session',
      accent: 'paper',
    },
  ]
}

/** Week and month, read from every transcript. */
export const usageCards = (u: Usage | null): Card[] => {
  if (!u) return []
  const w: UsageWindow = u.week
  const m: UsageWindow = u.month
  const monthTokens = m.models.reduce((a, [, n]) => a + n, 0)
  const topModel = m.models[0]
  const topSkill = w.skills[0] ?? m.skills[0]
  const topConn = w.connectors[0] ?? m.connectors[0]
  return [
    { label: 'THIS WEEK', value: compact(w.tokens), note: `tokens, ${comma(w.sessions)} sessions, ${comma(w.prompts)} prompts`, accent: 'gold' },
    { label: 'THIS MONTH', value: compact(m.tokens), note: `tokens, ${m.activeDays} days active, ${comma(m.prompts)} prompts`, accent: 'blue' },
    {
      label: 'TOP MODEL',
      value: topModel ? topModel[0].toUpperCase() : 'NONE',
      note: topModel ? `${Math.round((topModel[1] / Math.max(1, monthTokens)) * 100)}% of month, then ${rest(m.models, 1, monthTokens)}` : 'no model calls',
      accent: 'paper',
    },
    {
      label: 'TOP SKILL',
      value: topSkill ? topSkill[0].toUpperCase().slice(0, 14) : 'NONE',
      note: topSkill ? `x${comma(topSkill[1])} this week, ${w.skillKinds} skills used` : 'no skills yet',
      accent: 'gold',
    },
    {
      label: 'TOP CONNECTOR',
      value: topConn ? topConn[0].toUpperCase().slice(0, 14) : 'NONE',
      note: topConn ? `x${comma(topConn[1])} this week, ${w.connectorKinds} in all` : 'no connectors yet',
      accent: 'blue',
    },
  ]
}

/** The plan rate-limit windows from `$.session.usage()`'s `rateLimits`. */
export const limitsOf = (rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Limits => {
  const find = (kind: string) => rateLimits.find(l => l.kind === kind)
  const s = find('five_hour')
  const w = find('seven_day')
  return { week: w ? w.percentUsed : -1, session: s ? s.percentUsed : -1, weekResets: w?.resetsAt ?? '', sessionResets: s?.resetsAt ?? '' }
}

/** `2D 4H`, `3H 12M`, `40M`; '' when unknown. */
export const resetsIn = (iso: string, now: number) => {
  const ms = iso ? Date.parse(iso) - now : NaN
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'now'
  const m = Math.floor(ms / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

/** The weekly plan limit: the share used is the number, the 5-hour window and the reset the note. */
export const limitCard = (s: Stats, now: number): Card => {
  const l = s.limits
  if (!l || l.week < 0) return { label: 'WEEKLY LIMIT', value: '--', note: 'no plan limits on this login', accent: 'blue' }
  const resets = resetsIn(l.weekResets, now)
  const session = l.session >= 0 ? `5h ${Math.round(l.session)}%` : ''
  return {
    label: 'WEEKLY LIMIT',
    value: `${Math.round(l.week)}%`,
    note: [session, resets && `resets ${resets}`].filter(Boolean).join(', ') || 'used this week',
    accent: l.week >= 80 ? 'gold' : 'blue',
  }
}

/** Every card the reveal shows, in order: the weekly limit takes the top-right tile. */
export const allCards = (s: Stats, usage: Usage | null, now: number): Card[] => {
  const session = cards(s, now)
  return [...session.slice(0, 3), limitCard(s, now), ...session.slice(3), ...kitCards(s, usage), ...usageCards(usage)]
}

/** Believable week and month numbers for `/wrapped demo`. */
export const demoUsage = (now: number): Usage => ({
  at: now,
  week: {
    sessions: 41, prompts: 612, tokens: 1_840_000_000, out: 3_100_000, activeDays: 6,
    models: [['Opus 5.5', 1_420_000_000], ['Sonnet 5.5', 380_000_000], ['Haiku 4.5', 40_000_000]],
    tools: [['Bash', 2210], ['Read', 1480], ['Edit', 930]], toolKinds: 38,
    skills: [['write-docs', 9], ['create-image', 7], ['hyperframes', 4]], skillKinds: 14,
    connectors: [['Supabase', 212], ['Slack', 96], ['Gmail', 61]], connectorKinds: 7,
  },
  month: {
    sessions: 168, prompts: 2490, tokens: 7_260_000_000, out: 12_400_000, activeDays: 27,
    models: [['Opus 5.5', 5_610_000_000], ['Sonnet 5.5', 1_390_000_000], ['Haiku 4.5', 260_000_000]],
    tools: [['Bash', 8890], ['Read', 6020], ['Edit', 3710]], toolKinds: 61,
    skills: [['write-docs', 31], ['create-image', 22], ['hyperframes', 17]], skillKinds: 29,
    connectors: [['Supabase', 804], ['Slack', 377], ['Gmail', 240]], connectorKinds: 11,
  },
})

/** A believable busy session for `/wrapped demo`. */
export const demoStats = (now: number): Stats => ({
  startedAt: now - (2 * 60 + 47) * 60000,
  tools: { Edit: 142, Bash: 88, Read: 131, Grep: 54, Write: 19, Agent: 6, WebSearch: 4 },
  files: {
    'src/app/dashboard/page.tsx': 31,
    'src/lib/stripe.ts': 18,
    'supabase/migrations/058_connection.sql': 7,
    'src/components/PricingTable.tsx': 22,
  },
  bash: 88,
  tests: { pass: 23, fail: 9, comebacks: 6, last: 'pass' },
  turns: 37,
  longestTurnMs: 18 * 60000 + 22000,
  usd: 14.62,
  skills: { 'write-docs': 2, 'create-image': 1 },
  connectors: { Supabase: 14, Slack: 3 },
  model: 'Opus 5.5',
  limits: { week: 62, session: 34, weekResets: new Date(now + (2 * 24 + 4) * 3_600_000).toISOString(), sessionResets: '' },
})
