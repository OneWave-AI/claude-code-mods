/** Pure swarm logic: no engine, so the tests can drive it directly. */

import type { Agent, Beat, Msg } from '../types'

export const MAIN = 'main'
const MAX_AGENTS = 60
const MAX_MSGS = 30
const MAX_BEATS = 40

export type ListedAgent = { id: string; description: string; type: string; status: string; parentId?: string; spawnedBy?: string; name?: string }

export const isLive = (status: string) => status === 'running' || status === 'pending' || status === 'starting'
export const isFailed = (status: string) => status === 'failed' || status === 'killed' || status === 'error'

const cap = <T>(list: T[], n: number) => (list.length > n ? list.slice(list.length - n) : list)

export const blank = (id: string, now: number, over: Partial<Agent> = {}): Agent => ({
  id,
  label: over.label ?? 'worker',
  type: over.type ?? 'worker',
  status: 'running',
  startedAt: now,
  tools: 0,
  errors: 0,
  busy: false,
  lastAt: now,
  mix: {},
  outTokens: 0,
  ...over,
})

/** Insert or merge one agent by id. */
export const upsert = (list: Agent[], id: string, now: number, patch: Partial<Agent>): Agent[] => {
  const i = list.findIndex(a => a.id === id)
  if (i < 0) return cap([...list, blank(id, now, patch)], MAX_AGENTS)
  const next = list.slice()
  next[i] = { ...next[i]!, ...patch }
  return next
}

/** A tool call opened inside an agent's loop. Unknown ids (workflow workers) get a row of their own. */
export const toolStart = (list: Agent[], id: string, tool: string, doing: string, now: number): Agent[] => {
  const base = list.find(a => a.id === id) ?? blank(id, now, { type: 'worker', label: 'worker' })
  const mix = { ...base.mix, [shortTool(tool)]: (base.mix[shortTool(tool)] ?? 0) + 1 }
  return upsert(list, id, now, {
    tools: base.tools + 1,
    doing,
    doingTool: tool,
    busy: true,
    lastAt: now,
    mix,
  })
}

export const toolEnd = (list: Agent[], id: string, ok: boolean, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  if (!a) return list
  return upsert(list, id, now, { busy: false, errors: a.errors + (ok ? 0 : 1), lastAt: now })
}

/** Close an agent: status moves off running, the clock stops. */
export const finish = (list: Agent[], id: string, status: string, now: number): Agent[] => {
  const a = list.find(x => x.id === id)
  if (!a || !isLive(a.status)) return list
  return upsert(list, id, now, { status, endedAt: now, busy: false })
}

/**
 * Fold `$.agent.list()` into what we track. Returns the new list and which ids just finished
 * (so the caller can toast / log them). An agent missing from the listing keeps its last state.
 */
export const reconcile = (list: Agent[], listed: ListedAgent[], now: number): { agents: Agent[]; finished: Agent[] } => {
  let agents = list
  const finished: Agent[] = []
  for (const l of listed) {
    const had = agents.find(a => a.id === l.id)
    const teammate = l.type === 'teammate'
    const patch: Partial<Agent> = {
      label: l.description || had?.label || l.name || l.type,
      type: l.type || had?.type || 'worker',
      status: l.status,
      ...(l.name ? { name: l.name } : {}),
      ...(l.parentId ? { parentId: l.parentId } : {}),
      ...(l.spawnedBy ? { viaPlugin: l.spawnedBy } : {}),
    }
    if (had && isLive(had.status) && !isLive(l.status) && !(teammate && l.status === 'idle')) {
      patch.endedAt = now
      patch.busy = false
      finished.push({ ...had, ...patch } as Agent)
    }
    if (!had && !isLive(l.status)) patch.endedAt = now
    agents = upsert(agents, l.id, now, patch)
  }
  return { agents, finished }
}

/** Resolve a SendMessage recipient (a name, an id, "main", "team-lead") to an id we draw. */
export const resolve = (list: Agent[], to: string): string => {
  const t = to.trim()
  if (!t || t === MAIN || t === 'team-lead' || t === 'lead') return MAIN
  const hit = list.find(a => a.id === t || a.name === t) ?? list.find(a => a.label === t)
  return hit ? hit.id : t
}

export const addMsg = (msgs: Msg[], m: Msg) => cap([...msgs, m], MAX_MSGS)
export const addBeat = (beats: Beat[], b: Beat) => cap([...beats, b], MAX_BEATS)

/** Display name for an id: name, else label, else a short id. */
export const nameOf = (list: Agent[], id: string): string => {
  if (id === MAIN) return 'lead'
  const a = list.find(x => x.id === id)
  if (!a) return id.length > 10 ? id.slice(0, 8) : id
  return a.name || a.label
}

export type Row = { agent: Agent; depth: number; last: boolean; trail: boolean[] }

/**
 * The orchestration tree, depth-first, children by start time. `trail[d]` says whether the ancestor at depth d
 * still has siblings below it (so the connector rail keeps going).
 */
export const tree = (list: Agent[]): Row[] => {
  const ids = new Set(list.map(a => a.id))
  const kids = new Map<string, Agent[]>()
  for (const a of list) {
    const p = a.parentId && ids.has(a.parentId) ? a.parentId : MAIN
    kids.set(p, [...(kids.get(p) ?? []), a])
  }
  for (const v of kids.values()) v.sort((x, y) => x.startedAt - y.startedAt)
  const rows: Row[] = []
  const walk = (parent: string, depth: number, trail: boolean[]) => {
    const list = kids.get(parent) ?? []
    list.forEach((a, i) => {
      const last = i === list.length - 1
      rows.push({ agent: a, depth, last, trail })
      walk(a.id, depth + 1, [...trail, !last])
    })
  }
  walk(MAIN, 0, [])
  return rows
}

export type Summary = { live: number; done: number; failed: number; tools: number; peak: number; first?: number; last?: number }

export const summary = (list: Agent[], now: number): Summary => {
  let live = 0
  let done = 0
  let failed = 0
  let tools = 0
  for (const a of list) {
    tools += a.tools
    if (isLive(a.status)) live++
    else if (isFailed(a.status)) failed++
    else done++
  }
  const first = list.length ? Math.min(...list.map(a => a.startedAt)) : undefined
  const last = list.length ? Math.max(...list.map(a => a.endedAt ?? now)) : undefined
  return { live, done, failed, tools, peak: peakConcurrency(list, now), first, last }
}

/** Most agents running at the same moment. */
export const peakConcurrency = (list: Agent[], now: number): number => {
  const edges: [number, number][] = []
  for (const a of list) {
    edges.push([a.startedAt, 1])
    edges.push([a.endedAt ?? now, -1])
  }
  edges.sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let cur = 0
  let peak = 0
  for (const [, d] of edges) {
    cur += d
    peak = Math.max(peak, cur)
  }
  return peak
}

export const shortTool = (tool: string) => {
  if (tool.startsWith('mcp__')) {
    const parts = tool.split('__')
    return parts[parts.length - 1] || tool
  }
  return tool
}

const base = (p: unknown) => (typeof p === 'string' ? p.split('/').filter(Boolean).pop() ?? p : '')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const host = (u: unknown) => {
  if (typeof u !== 'string') return ''
  const m = /^https?:\/\/([^/]+)/.exec(u)
  return m ? m[1]! : clip(u, 40)
}

/** A tool call in plain English. */
export const labelOf = (tool: string, input: Record<string, unknown>): string => {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (tool) {
    case 'Bash':
      return `running ${clip(s('description') || s('command').split('\n')[0]!, 60)}`
    case 'Read':
      return `reading ${base(input.file_path)}`
    case 'Write':
      return `writing ${base(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `editing ${base(input.file_path)}`
    case 'NotebookEdit':
      return `editing ${base(input.notebook_path)}`
    case 'Grep':
      return `searching for "${clip(s('pattern'), 36)}"`
    case 'Glob':
      return `finding ${clip(s('pattern'), 40)}`
    case 'WebFetch':
      return `fetching ${host(input.url)}`
    case 'WebSearch':
      return `searching the web: ${clip(s('query'), 40)}`
    case 'Agent':
    case 'Task':
      return `delegating "${clip(s('description') || 'a task', 40)}"`
    case 'SendMessage':
      return `messaging ${clip(s('to') || s('recipient'), 24)}`
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'updating the plan'
    case 'Skill':
      return `using skill ${clip(s('skill'), 30)}`
    default:
      return `calling ${clip(shortTool(tool), 40)}`
  }
}

export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 5) return 'now'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

export const shortModel = (m?: string) => {
  if (!m) return ''
  const hit = /(opus|sonnet|haiku|fable)[-\s]?(\d+(?:[-.]\d+)?)?/i.exec(m)
  if (!hit) return clip(m, 14)
  return `${hit[1]!.toLowerCase()}${hit[2] ? ` ${hit[2].replace('-', '.')}` : ''}`
}

export const statusWord = (status: string) => (isLive(status) ? 'live' : isFailed(status) ? status : status === 'completed' ? 'done' : status)
