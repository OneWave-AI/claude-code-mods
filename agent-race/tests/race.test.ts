import { describe, expect, test } from 'claude-code/testing'

import {
  COURSE,
  demoTick,
  isTestCommand,
  mergeLanes,
  newLane,
  parseLane,
  parseTests,
  progressOf,
  rank,
  safeName,
  track,
} from '../hooks/race'

describe('race logic', () => {
  test('progress grows with work and only a finish reaches the line', async () => {
    const lane = newLane('a', 'A', 'r', 0)
    expect(progressOf(lane)).toBe(0)
    expect(progressOf({ ...lane, edits: 100 })).toBe(0.95)
    expect(progressOf({ ...lane, finishedAt: 5 })).toBe(1)
  })

  test('rank puts finishers first by time, then by progress', async () => {
    const a = { ...newLane('a', 'A', 'r', 0), edits: 2 }
    const b = { ...newLane('b', 'B', 'r', 0), edits: 9 }
    const c = { ...newLane('c', 'C', 'r', 0), finishedAt: 50 }
    const d = { ...newLane('d', 'D', 'r', 0), finishedAt: 20 }
    expect(rank([a, b, c, d]).map(l => l.id)).toEqual(['d', 'c', 'b', 'a'])
  })

  test('parses common test runner output', async () => {
    expect(parseTests('Tests:       1 failed, 12 passed, 13 total')).toEqual({ passed: 12, failed: 1 })
    expect(parseTests('===== 42 passed in 0.31s =====')).toEqual({ passed: 42, failed: 0 })
    expect(parseTests(' Test Files  3 passed (3)\n      Tests  27 passed (27)')).toEqual({ passed: 27, failed: 0 })
    expect(parseTests('test result: ok. 8 passed; 0 failed;')).toEqual({ passed: 8, failed: 0 })
    expect(parseTests('ok  \tgithub.com/x/y\t0.2s')).toEqual({ passed: 1, failed: 0 })
    expect(parseTests('compiled successfully')).toBe(null)
    expect(isTestCommand('npm test')).toBe(true)
    expect(isTestCommand('bun test src')).toBe(true)
    expect(isTestCommand('ls -la')).toBe(false)
  })

  test('lane files merge newest-wins and drop strangers and stale lanes', async () => {
    const now = 20 * 60 * 1000
    const fresh = { ...newLane('a', 'A', 'r', 0), updatedAt: now - 1000, tools: 5 }
    const older = { ...fresh, updatedAt: now - 2000, tools: 1 }
    const stale = { ...newLane('b', 'B', 'r', 0), updatedAt: 0 }
    expect(parseLane(JSON.stringify(fresh), 'other')).toBe(null)
    expect(parseLane('garbage', 'r')).toBe(null)
    expect(parseLane(JSON.stringify(fresh), 'r')?.tools).toBe(5)
    const merged = mergeLanes([older, fresh, stale], now)
    expect(merged.length).toBe(1)
    expect(merged[0]?.tools).toBe(5)
  })

  test('track fills to the width and finishes with a block', async () => {
    const half = track(0.5, 21)
    expect((half.run + half.runner + half.rest).length).toBe(20)
    const done = track(1, 21)
    expect(done.runner).toBe('■')
    expect(done.rest).toBe('')
    expect(safeName('Big Refactor!!')).toBe('big-refactor')
  })

  test('demo ticks eventually finish a lane', async () => {
    let lane = newLane('a', 'A', 'demo', 0)
    for (let i = 0; i < COURSE * 4 && lane.finishedAt === null; i++) lane = demoTick(lane, 0, i, 0.1)
    expect(lane.finishedAt).not.toBe(null)
  })
})
