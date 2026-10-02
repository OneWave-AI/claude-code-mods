import { describe, expect, test } from 'claude-code/testing'

import { FIRE_ROWS, barText, bracket, burnt, compare, crossed, fireCells, heat, lifetimeDelta, modelName, modelsLine, money, pct, resetsIn, tallyTurn, tokenCount, tween, windows } from '../hooks/burn'

describe('burn math', () => {
  test('money formats cents and fractions of a cent', async () => {
    expect(money(0)).toBe('$0.00')
    expect(money(12.345)).toBe('$12.35')
    expect(money(0.0042)).toBe('$0.0042')
  })

  test('comparisons pick a thing and pluralize', async () => {
    expect(compare(22, 0)).toBe('= 2.0 burritos')
    expect(compare(11, 0)).toBe('= 1.0 burrito')
    expect(compare(3.19, 1)).toBe('= 1.0 McDouble')
    expect(compare(31.9, 1)).toBe('= 10 McDoubles')
    expect(compare(11, 2)).toBe('= 1.0 burrito')
  })

  test('thresholds fire once each, in order', async () => {
    expect(crossed(0, 0.5, [])).toEqual([])
    expect(crossed(0.5, 1, [])).toEqual([1])
    expect(crossed(0.5, 12, [])).toEqual([1, 5, 10])
    expect(crossed(0.5, 12, [1, 5])).toEqual([10])
    expect(crossed(12, 11, [])).toEqual([])
  })

  test('the fuse burns bracket to bracket', async () => {
    expect(bracket(0.5)).toEqual({ low: 0, high: 1 })
    expect(bracket(7)).toEqual({ low: 5, high: 10 })
    expect(burnt(7.5)).toBe(0.5)
    expect(bracket(60).low).toBe(50)
    expect(bracket(60).high).toBeGreaterThan(60)
    expect(heat(0)).toBe(0)
    expect(heat(99)).toBe(1)
  })

  test('tween eases toward the target and lands exactly', async () => {
    let x = 0
    for (let i = 0; i < 400 && x !== 3; i++) x = tween(x, 3)
    expect(x).toBe(3)
  })

  test('lifetime counts only new spend', async () => {
    expect(lifetimeDelta(null, 's1', 2)).toBe(2)
    expect(lifetimeDelta({ sessionId: 's1', usd: 2 }, 's1', 2.5)).toBe(0.5)
    expect(lifetimeDelta({ sessionId: 's1', usd: 2 }, 's2', 1)).toBe(1)
    expect(lifetimeDelta({ sessionId: 's1', usd: 5 }, 's1', 1)).toBe(1)
  })

  test('fire cells are columns * rows * 3 words of base64', async () => {
    const cells = fireCells(20, 0.5, 0.3, 1.2)
    expect(cells.length).toBe(Math.ceil((20 * FIRE_ROWS * 12) / 3) * 4)
  })

  test('the bar grows with spend', async () => {
    expect(barText(10, heat(0))).toBe('█░░░░░░░░░')
    expect(barText(10, heat(99))).toBe('██████████')
    expect(heat(30)).toBeGreaterThan(heat(5))
  })

  test('subscription windows read out of rateLimits', async () => {
    const w = windows([
      { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-10-02T20:00:00Z' },
      { kind: 'seven_day', percentUsed: 41 },
    ])
    expect(w.session).toBe(23.5)
    expect(w.week).toBe(41)
    expect(windows([]).session).toBe(-1)
    expect(pct(-1)).toBe('--')
    expect(pct(23.5)).toBe('24%')
    const now = Date.parse('2026-10-02T17:46:00Z')
    expect(resetsIn('2026-10-02T20:00:00Z', now)).toBe('in 2h 14m')
    expect(resetsIn('2026-10-05T21:46:00Z', now)).toBe('in 3d 4h')
    expect(resetsIn('', now)).toBe('')
  })

  test('model usage tallies per model, busiest first', async () => {
    const turn = (model: string, out: number) => ({
      model,
      input_tokens: 100,
      output_tokens: out,
      cache_read_input_tokens: 50_000,
      cache_creation_input_tokens: 900,
    })
    let m = tallyTurn({}, turn('claude-opus-5-5', 2000))
    m = tallyTurn(m, turn('claude-opus-5-5', 3000))
    m = tallyTurn(m, turn('claude-haiku-4-5-20251001', 500))
    expect(m['claude-opus-5-5']).toEqual({ input: 102_000, output: 5000, turns: 2 })
    expect(modelName('claude-opus-5-5')).toBe('opus 5.5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('haiku 4.5')
    expect(modelName('gpt-x')).toBe('gpt-x')
    expect(modelsLine(m)).toBe('opus 5.5 102k in 5k out · haiku 4.5 51k in 500 out')
    expect(tokenCount(1_200_000)).toBe('1.2M')
  })
})
