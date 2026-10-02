/** Reading test runs and turning them into fight moves: pure, so the tests can drive them. */

import type { Fight, RunResult } from '../types'

const RUNNERS: readonly [string, RegExp][] = [
  ['vitest', /\bvitest\b/],
  ['jest', /\bjest\b/],
  ['pytest', /\bpytest\b|\bpython3?\s+-m\s+pytest\b/],
  ['bun', /\bbun\s+test\b/],
  ['cargo', /\bcargo\s+(test|nextest)\b/],
  ['go', /\bgo\s+test\b/],
  ['claude', /\bclaude\s+plugin\s+test\b/],
  ['npm', /\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bnpx\s+(jest|vitest)\b/],
  ['mocha', /\bmocha\b/],
  ['rspec', /\brspec\b/],
]

/** Which runner a Bash command starts, or null when it runs no tests. */
export const runnerOf = (command: string): string | null => {
  for (const [name, re] of RUNNERS) if (re.test(command)) return name
  return null
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

const sumAll = (text: string, re: RegExp) => {
  let total = 0
  let found = false
  for (const m of text.matchAll(re)) {
    total += Number(m[1])
    found = true
  }
  return found ? total : null
}

/** The last match's number: summaries come last, so it wins over per-file lines. */
const last = (text: string, re: RegExp) => {
  let out: number | null = null
  for (const m of text.matchAll(re)) out = Number(m[1])
  return out
}

/**
 * Failed and passed counts from a runner's output, tolerant of the common
 * summary shapes (jest, vitest, pytest, bun, cargo, go, mocha, rspec).
 * Null when the output carries no summary at all.
 */
export const parseRun = (runner: string, raw: string): RunResult | null => {
  const text = raw.replace(ANSI, '')

  // jest: "Tests:       2 failed, 5 passed, 7 total"
  const jest = /Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:\d+\s+skipped,?\s*)?(?:\d+\s+todo,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:\d+\s+total)/.exec(text)
  if (jest && (jest[1] || jest[2])) {
    return { runner, failed: Number(jest[1] ?? 0), passed: Number(jest[2] ?? 0) }
  }

  // vitest: "Tests  2 failed | 5 passed (7)"
  const vitest = /Tests\s+(?:(\d+)\s+failed)?\s*\|?\s*(?:(\d+)\s+passed)?\s*(?:\|[^(\n]*)?\(\d+\)/.exec(text)
  if (vitest && (vitest[1] || vitest[2])) {
    return { runner, failed: Number(vitest[1] ?? 0), passed: Number(vitest[2] ?? 0) }
  }

  // cargo: "test result: FAILED. 3 passed; 2 failed;" (one per crate: add them)
  const cargoFailed = sumAll(text, /test result: \w+\.\s+\d+ passed;\s+(\d+) failed/g)
  if (cargoFailed !== null) {
    return { runner, failed: cargoFailed, passed: sumAll(text, /test result: \w+\.\s+(\d+) passed/g) ?? 0 }
  }

  // bun / claude plugin test: " 12 pass\n 1 fail"
  const bunPass = last(text, /^\s*(\d+)\s+pass\s*$/gm)
  const bunFail = last(text, /^\s*(\d+)\s+fail\s*$/gm)
  if (bunPass !== null || bunFail !== null) {
    return { runner, failed: bunFail ?? 0, passed: bunPass ?? 0 }
  }

  // pytest: "=== 2 failed, 5 passed in 0.12s ===", "1 error"
  const pyLine = /=+ (.*\bin [\d.]+s.*?) =+/.exec(text)?.[1]
  if (pyLine) {
    const f = Number(/(\d+) failed/.exec(pyLine)?.[1] ?? 0) + Number(/(\d+) errors?/.exec(pyLine)?.[1] ?? 0)
    const p = Number(/(\d+) passed/.exec(pyLine)?.[1] ?? 0)
    if (f || p || /no tests ran/.test(pyLine)) return { runner, failed: f, passed: p }
  }

  // mocha: "5 passing" / "2 failing"; rspec: "7 examples, 2 failures"
  const passing = last(text, /(\d+) passing\b/g)
  const failing = last(text, /(\d+) failing\b/g)
  if (passing !== null || failing !== null) return { runner, failed: failing ?? 0, passed: passing ?? 0 }
  const rspec = /(\d+) examples?, (\d+) failures?/.exec(text)
  if (rspec) return { runner, failed: Number(rspec[2]), passed: Number(rspec[1]) - Number(rspec[2]) }

  // go: one "--- FAIL:" per failing test, "ok"/"PASS" lines otherwise.
  if (runner === 'go') {
    const fails = (text.match(/^\s*--- FAIL:/gm) ?? []).length
    const passes = (text.match(/^\s*--- PASS:/gm) ?? []).length
    if (fails || passes || /^(ok|PASS|FAIL)\b/m.test(text)) {
      return { runner, failed: fails || (/^FAIL\b/m.test(text) ? 1 : 0), passed: passes }
    }
  }

  return null
}

export const BOSSES = [
  'The Flaky Hydra',
  'Null Pointer Wraith',
  'Regression Golem',
  'The Off-By-One Imp',
  'Race Condition Wyrm',
  'Undefined Behemoth',
  'Merge Conflict Ogre',
  'Timeout Specter',
] as const

export const LOOT = [
  'Cloak of Green Checkmarks',
  '+1 Senior Dev',
  'Amulet of Deterministic Builds',
  'Boots of Fast CI',
  'Tome of Readable Stack Traces',
  'Ring of Zero Flakes',
  'Shield of 100% Coverage',
  'Potion of Clean Merges',
  'Sword of Root Cause',
  'Golden Rubber Duck',
] as const

export const NO_FIGHT: Fight = {
  boss: '',
  kind: 0,
  maxHp: 0,
  hp: 0,
  runner: '',
  phase: 'none',
  phaseAt: 0,
  delta: 0,
  runs: 0,
  loot: null,
  isDemo: false,
}

const pick = <T>(list: readonly T[], seed: number) => list[Math.abs(Math.floor(seed)) % list.length]!

export type Move = { fight: Fight; event: 'none' | 'spawn' | 'hit' | 'heal' | 'ko' | 'clean' | 'stalemate' }

/** What one test run does to the fight. `seed` picks a boss or loot. */
export const step = (fight: Fight, run: RunResult, now: number, seed: number): Move => {
  const alive = fight.phase !== 'none' && fight.phase !== 'ko'
  if (!alive) {
    if (run.failed === 0) return { fight, event: fight.phase === 'none' ? 'clean' : 'none' }
    const kind = Math.abs(Math.floor(seed)) % BOSSES.length
    return {
      fight: {
        boss: BOSSES[kind]!,
        kind,
        maxHp: run.failed,
        hp: run.failed,
        runner: run.runner,
        phase: 'spawn',
        phaseAt: now,
        delta: 0,
        runs: 1,
        loot: null,
        isDemo: false,
      },
      event: 'spawn',
    }
  }
  const runs = fight.runs + 1
  if (run.failed === 0) {
    return {
      fight: { ...fight, hp: 0, phase: 'ko', phaseAt: now, delta: fight.hp, runs, loot: pick(LOOT, seed) },
      event: 'ko',
    }
  }
  if (run.failed < fight.hp) {
    return { fight: { ...fight, hp: run.failed, phase: 'hit', phaseAt: now, delta: fight.hp - run.failed, runs }, event: 'hit' }
  }
  if (run.failed > fight.hp) {
    return {
      fight: {
        ...fight,
        hp: run.failed,
        maxHp: Math.max(fight.maxHp, run.failed),
        phase: 'heal',
        phaseAt: now,
        delta: fight.hp - run.failed,
        runs,
      },
      event: 'heal',
    }
  }
  return { fight: { ...fight, runs }, event: 'stalemate' }
}

/** How long each phase animates before the boss settles back to idle. */
export const PHASE_MS = { spawn: 1600, hit: 1300, heal: 1300 } as const

export const phaseAt = (fight: Fight, now: number): Fight['phase'] => {
  if (fight.phase === 'spawn' || fight.phase === 'hit' || fight.phase === 'heal') {
    return now - fight.phaseAt > PHASE_MS[fight.phase] ? 'idle' : fight.phase
  }
  return fight.phase
}
