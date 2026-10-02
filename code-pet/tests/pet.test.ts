import { describe, expect, test } from 'claude-code/testing'

import { apply, decay, IDLE_MS, isDanger, isFailedRun, levelOf, moodAt, newPet, revive, stageOf } from '../hooks/pet'
import type { Live } from '../hooks/pet'
import { compose, rowsFor, scene } from '../hooks/scene'
import { words } from '../hooks/pixels'

const T0 = 1_790_000_000_000
const calm: Live = { mood: 'idle', until: 0, lastActivityAt: T0 }

describe('mood machine', () => {
  test('a tool call feeds it and it eats, then rests', async () => {
    const out = apply(newPet(T0), calm, { kind: 'fed' }, T0)
    expect(out.pet.xp).toBe(2)
    expect(out.pet.meals).toBe(1)
    expect(moodAt(out.pet, out.live, T0 + 100)).toBe('eating')
    expect(moodAt(out.pet, out.live, T0 + 5000)).toBe('idle')
  })

  test('a failure makes it sick and costs HP', async () => {
    const out = apply(newPet(T0), calm, { kind: 'failed' }, T0)
    expect(out.pet.hp).toBe(94)
    expect(moodAt(out.pet, out.live, T0 + 100)).toBe('sick')
  })

  test('panic outranks the snack that follows the dangerous command', async () => {
    const scared = apply(newPet(T0), calm, { kind: 'danger' }, T0)
    const fed = apply(scared.pet, scared.live, { kind: 'fed' }, T0 + 200)
    expect(moodAt(fed.pet, fed.live, T0 + 300)).toBe('panic')
    expect(fed.pet.xp).toBe(2)
  })

  test('falls asleep after the idle spell, wakes on activity', async () => {
    const pet = newPet(T0)
    expect(moodAt(pet, calm, T0 + IDLE_MS + 1)).toBe('sleep')
    const woke = apply(pet, calm, { kind: 'activity' }, T0 + IDLE_MS + 1)
    expect(moodAt(woke.pet, woke.live, T0 + IDLE_MS + 2)).toBe('idle')
  })

  test('levels up and evolves at the thresholds', async () => {
    expect(levelOf(0)).toBe(1)
    expect(levelOf(8)).toBe(2)
    expect(stageOf(1)).toBe('egg')
    expect(stageOf(2)).toBe('blob')
    expect(stageOf(5)).toBe('critter')
    expect(stageOf(10)).toBe('crowned')
    const out = apply({ ...newPet(T0), xp: 7 }, calm, { kind: 'fed' }, T0)
    expect(out.leveledTo).toBe(2)
    expect(moodAt(out.pet, out.live, T0 + 10)).toBe('levelup')
  })
})

describe('time', () => {
  test('two days unfed: starving, hurt and sad', async () => {
    const later = T0 + 48 * 3.6e6
    const pet = decay(newPet(T0), later)
    expect(pet.hunger).toBe(0)
    expect(pet.hp < 100).toBe(true)
    expect(moodAt(pet, { ...calm, lastActivityAt: later }, later)).toBe('sad')
  })

  test('revive rejects junk and repairs a partial pet', async () => {
    expect(revive(null)).toBe(null)
    expect(revive({ xp: 'x' })).toBe(null)
    expect(revive({ name: 'Moss', xp: 40, bornAt: T0 })?.hunger).toBe(80)
  })
})

describe('detectors', () => {
  test('dangerous commands', async () => {
    expect(isDanger('rm -rf node_modules')).toBe(true)
    expect(isDanger('rm -fr /tmp/x')).toBe(true)
    expect(isDanger('git push --force origin main')).toBe(true)
    expect(isDanger('git push -f')).toBe(true)
    expect(isDanger('psql -c "DROP TABLE users"')).toBe(true)
    expect(isDanger('git reset --hard HEAD~1')).toBe(true)
    expect(isDanger('rm notes.txt')).toBe(false)
    expect(isDanger('git push origin feature')).toBe(false)
  })

  test('failed runs', async () => {
    expect(isFailedRun(true, '')).toBe(true)
    expect(isFailedRun(undefined, 'Exit code 1\nboom')).toBe(true)
    expect(isFailedRun(false, 'all good')).toBe(false)
  })
})

describe('art', () => {
  test('every stage and mood composes a 12-wide sprite', async () => {
    for (const stage of ['egg', 'blob', 'critter', 'crowned'] as const) {
      for (const mood of ['idle', 'happy', 'eating', 'sick', 'panic', 'sleep', 'sad', 'levelup'] as const) {
        const rows = compose(stage, mood, false)
        expect(rows.length).toBe(12)
        expect(rows.every(r => r.length === 12)).toBe(true)
      }
    }
  })

  test('a frame packs columns x rows cells with printable glyphs', async () => {
    for (const cols of [30, 58]) {
      const rows = rowsFor(cols)
      for (const mood of ['idle', 'panic', 'sleep', 'sad', 'happy', 'eating', 'levelup', 'sick'] as const) {
        const cells = words(scene(cols, rows, 1.234, { stage: 'critter', mood }))
        expect(cells.length).toBe(cols * rows * 3)
        for (let i = 0; i < cells.length; i += 3) {
          const ch = cells[i]!
          expect(ch >= 0x21 && ch <= 0xffff).toBe(true)
        }
      }
    }
  })
})
