/** Pure race logic: scoring, ranking, parsing test output, drawing the track. */

import type { Lane } from '../types'

/** Points that put a lane at the finish line before it is declared done. */
export const COURSE = 60
const STALE_MS = 10 * 60 * 1000

export const newLane = (id: string, name: string, race: string, now: number): Lane => ({
  id,
  name,
  race,
  tools: 0,
  edits: 0,
  testsPassed: 0,
  testsFailed: 0,
  costUsd: 0,
  startedAt: now,
  finishedAt: null,
  updatedAt: now,
})

/** Edits move a lane most, any tool a little, green tests a push; failures hold it back. */
export const scoreOf = (lane: Lane) =>
  lane.edits * 3 + lane.tools + Math.min(lane.testsPassed, 20) - Math.min(lane.testsFailed, 10) * 2

/** 0..1 along the track; only a finished lane reaches 1. */
export const progressOf = (lane: Lane) =>
  lane.finishedAt !== null ? 1 : Math.max(0, Math.min(0.95, scoreOf(lane) / COURSE))

/** Finished lanes first by finish time, then the rest by progress. */
export const rank = (lanes: readonly Lane[]) =>
  [...lanes].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt
    if (a.finishedAt !== null) return -1
    if (b.finishedAt !== null) return 1
    return progressOf(b) - progressOf(a) || a.name.localeCompare(b.name)
  })

/** Counts from common runners: jest/vitest/bun ("12 passed, 1 failed"), pytest, go, cargo, node:test. */
export const parseTests = (output: string): { passed: number; failed: number } | null => {
  // The largest count a runner printed: vitest prints files and tests, jest a summary per suite.
  const sum = (re: RegExp) => {
    let top: number | null = null
    for (const m of output.matchAll(re)) top = Math.max(top ?? 0, Number(m[1]))
    return top
  }
  const passed =
    sum(/(\d+)\s+(?:tests?\s+)?pass(?:ed|ing)?\b/gi) ??
    sum(/^# pass\s+(\d+)/gim) ??
    sum(/test result: ok\. (\d+) passed/g)
  const failed = sum(/(\d+)\s+(?:tests?\s+)?fail(?:ed|ing|ures?)?\b/gi) ?? sum(/^# fail\s+(\d+)/gim)
  if (passed === null && failed === null) {
    if (/^ok\s+\S+/m.test(output) && !/^FAIL/m.test(output)) return { passed: 1, failed: 0 }
    return null
  }
  return { passed: passed ?? 0, failed: failed ?? 0 }
}

export const isTestCommand = (command: string) =>
  /\b(test|tests|jest|vitest|pytest|mocha|go test|cargo test|bun test|npm t\b|pnpm t\b)/i.test(command)

/** A lane file's text, or null when it is not a lane of this race. */
export const parseLane = (text: string, race: string): Lane | null => {
  try {
    const lane = JSON.parse(text) as Partial<Lane>
    if (typeof lane.id !== 'string' || lane.race !== race || typeof lane.name !== 'string') return null
    return { ...newLane(lane.id, lane.name, race, Number(lane.startedAt) || 0), ...lane } as Lane
  } catch {
    return null
  }
}

/** Keeps the newest copy of each lane and drops lanes nobody has touched in ten minutes. */
export const mergeLanes = (lanes: readonly Lane[], now: number) => {
  const byId = new Map<string, Lane>()
  for (const lane of lanes) {
    const had = byId.get(lane.id)
    if (!had || lane.updatedAt > had.updatedAt) byId.set(lane.id, lane)
  }
  return [...byId.values()].filter(lane => lane.finishedAt !== null || now - lane.updatedAt < STALE_MS)
}

export type Track = { run: string; runner: string; rest: string; flag: string }

/** A track `width` cells wide: the ground covered, the runner, the ground left, the flag. */
export const track = (progress: number, width: number, frame = 0): Track => {
  const length = Math.max(4, width - 1)
  const at = Math.round(Math.max(0, Math.min(1, progress)) * (length - 1))
  const isDone = progress >= 1
  const strides = ['▶', '►']
  return {
    run: '━'.repeat(at),
    runner: isDone ? '■' : strides[frame % strides.length]!,
    rest: '·'.repeat(Math.max(0, length - 1 - at)),
    flag: '▌',
  }
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)

export const safeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'race'

/** One simulated tick of the demo: each lane gains a little, the second a touch slower. */
export const demoTick = (lane: Lane, index: number, now: number, roll: number): Lane => {
  if (lane.finishedAt !== null) return lane
  const pace = index === 0 ? 0.62 : 0.55
  const next: Lane = { ...lane, updatedAt: now }
  if (roll < pace) next.tools += 1
  if (roll < pace * 0.5) next.edits += 1
  if (roll > 0.93) next.testsFailed += 1
  if (roll > 0.85 && roll <= 0.93) next.testsPassed += 3
  next.costUsd = Math.round((next.costUsd + roll * 0.02) * 1000) / 1000
  if (scoreOf(next) >= COURSE) next.finishedAt = now
  return next
}
