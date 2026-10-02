import { describe, expect, test } from 'claude-code/testing'

import { arena, ARENA_ROWS } from '../hooks/arena'
import { NO_FIGHT, parseRun, phaseAt, runnerOf, step } from '../hooks/fight'
import type { Fight } from '../types'

const T0 = 1_790_000_000_000

describe('runner detection', () => {
  test('knows the common runners', async () => {
    expect(runnerOf('npx vitest run')).toBe('vitest')
    expect(runnerOf('npm test')).toBe('npm')
    expect(runnerOf('pnpm run test -- --watch=false')).toBe('npm')
    expect(runnerOf('python -m pytest -q')).toBe('pytest')
    expect(runnerOf('bun test')).toBe('bun')
    expect(runnerOf('cargo test --all')).toBe('cargo')
    expect(runnerOf('go test ./...')).toBe('go')
    expect(runnerOf('npx jest src')).toBe('jest')
    expect(runnerOf('claude plugin test .')).toBe('claude')
    expect(runnerOf('ls -la')).toBe(null)
    expect(runnerOf('git commit -m "add tests"')).toBe(null)
  })
})

describe('summary parsing', () => {
  test('jest', async () => {
    expect(parseRun('jest', 'Tests:       2 failed, 5 passed, 7 total')).toEqual({ runner: 'jest', failed: 2, passed: 5 })
    expect(parseRun('jest', 'Tests:       9 passed, 9 total')).toEqual({ runner: 'jest', failed: 0, passed: 9 })
  })

  test('vitest, with ansi codes', async () => {
    const out = '\u001b[2m Tests \u001b[22m \u001b[1m\u001b[31m3 failed\u001b[39m\u001b[22m | \u001b[32m12 passed\u001b[39m (15)'
    expect(parseRun('vitest', out)).toEqual({ runner: 'vitest', failed: 3, passed: 12 })
    expect(parseRun('vitest', ' Tests  15 passed (15)')).toEqual({ runner: 'vitest', failed: 0, passed: 15 })
  })

  test('pytest', async () => {
    expect(parseRun('pytest', '===== 2 failed, 10 passed in 0.42s =====')).toEqual({ runner: 'pytest', failed: 2, passed: 10 })
    expect(parseRun('pytest', '==== 1 failed, 3 passed, 1 error in 1.1s ====')).toEqual({ runner: 'pytest', failed: 2, passed: 3 })
    expect(parseRun('pytest', '======= 8 passed in 0.10s =======')).toEqual({ runner: 'pytest', failed: 0, passed: 8 })
  })

  test('bun and claude plugin test', async () => {
    expect(parseRun('bun', ' 11 pass\n 2 fail\nRan 13 tests')).toEqual({ runner: 'bun', failed: 2, passed: 11 })
    expect(parseRun('claude', ' 12 pass\n 0 fail\n')).toEqual({ runner: 'claude', failed: 0, passed: 12 })
  })

  test('cargo sums each crate', async () => {
    const out = 'test result: FAILED. 3 passed; 2 failed; 0 ignored\ntest result: ok. 4 passed; 0 failed; 0 ignored'
    expect(parseRun('cargo', out)).toEqual({ runner: 'cargo', failed: 2, passed: 7 })
  })

  test('go counts FAIL lines', async () => {
    const out = '--- FAIL: TestA (0.00s)\n--- PASS: TestB (0.00s)\n--- FAIL: TestC (0.00s)\nFAIL\n'
    expect(parseRun('go', out)).toEqual({ runner: 'go', failed: 2, passed: 1 })
    expect(parseRun('go', 'ok  \texample.com/pkg\t0.01s\n')).toEqual({ runner: 'go', failed: 0, passed: 0 })
  })

  test('mocha and rspec', async () => {
    expect(parseRun('mocha', '  5 passing (20ms)\n  2 failing')).toEqual({ runner: 'mocha', failed: 2, passed: 5 })
    expect(parseRun('rspec', '7 examples, 2 failures')).toEqual({ runner: 'rspec', failed: 2, passed: 5 })
  })

  test('no summary is null', async () => {
    expect(parseRun('npm', 'npm ERR! missing script: test')).toBe(null)
  })
})

describe('fight', () => {
  const run = (failed: number) => ({ runner: 'vitest', failed, passed: 10 })

  test('a clean run with no boss summons nothing', async () => {
    expect(step(NO_FIGHT, run(0), T0, 1).event).toBe('clean')
  })

  test('spawn, hit, heal, stalemate, KO', async () => {
    let f: Fight = NO_FIGHT
    const spawn = step(f, run(5), T0, 3)
    expect(spawn.event).toBe('spawn')
    f = spawn.fight
    expect(f.hp).toBe(5)
    expect(f.maxHp).toBe(5)

    const hit = step(f, run(3), T0 + 1000, 0)
    expect(hit.event).toBe('hit')
    expect(hit.fight.delta).toBe(2)
    f = hit.fight

    const heal = step(f, run(7), T0 + 2000, 0)
    expect(heal.event).toBe('heal')
    expect(heal.fight.maxHp).toBe(7)
    expect(heal.fight.delta).toBe(-4)
    f = heal.fight

    const stale = step(f, run(7), T0 + 3000, 0)
    expect(stale.event).toBe("stalemate")
    f = stale.fight

    const ko = step(f, run(0), T0 + 4000, 4)
    expect(ko.event).toBe('ko')
    expect(ko.fight.hp).toBe(0)
    expect(ko.fight.runs).toBe(5)
    expect(typeof ko.fight.loot).toBe('string')

    // After a KO a new failing run summons a fresh boss.
    expect(step(ko.fight, run(2), T0 + 5000, 1).event).toBe('spawn')
  })

  test('phases settle to idle', async () => {
    const f = step(NO_FIGHT, run(4), T0, 0).fight
    expect(phaseAt(f, T0 + 100)).toBe('spawn')
    expect(phaseAt(f, T0 + 5000)).toBe('idle')
  })
})

describe('arena frames', () => {
  test('every phase packs columns x rows printable cells', async () => {
    const spawned = step(NO_FIGHT, { runner: 'jest', failed: 4, passed: 1 }, T0, 0).fight
    const fights: Fight[] = [NO_FIGHT, spawned, { ...spawned, phase: 'hit', delta: 2 }, { ...spawned, phase: 'heal', delta: -1 }, { ...spawned, phase: 'ko', delta: 4, hp: 0 }]
    for (const cols of [40, 68]) {
      for (const f of fights) {
        for (const dt of [0, 200, 900, 2500]) {
          for (let kind = 0; kind < 4; kind++) {
            const b64 = arena(cols, ARENA_ROWS, T0 + dt, { ...f, kind, phaseAt: T0 })
            // base64 of cols * rows * 3 u32 words
            expect(b64.length).toBe(Math.ceil((cols * ARENA_ROWS * 12) / 3) * 4)
          }
        }
      }
    }
  })
})
