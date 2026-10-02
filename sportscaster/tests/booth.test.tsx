import { expect, mock, test } from 'claude-code/testing'

import { gameClock, head, revealed, wrap } from '../hooks/art'

test('the mouth flaps while talking and rests closed otherwise', async () => {
  expect(head(-1, 'calm')[4]![1]).toContain('───')
  expect(head(2, 'calm')[4]![1]).toContain(' O ')
  expect(head(0, 'groan')[2]![1]).toContain('✖')
})

test('a line types out while spoken and shows whole once done', async () => {
  expect(revealed('Touchdown Claude', 0, true)).toBe('T')
  expect(revealed('Touchdown Claude', 38 * 5, true)).toBe('Touch')
  expect(revealed('Touchdown Claude', 0, false)).toBe('Touchdown Claude')
})

test('game clock and wrapping', async () => {
  expect(gameClock(187_000)).toBe('03:07')
  expect(gameClock(3_787_000)).toBe('1:03:07')
  expect(wrap('He commits he pushes that is game', 12)).toEqual(['He commits', 'he pushes', 'that is game'])
})

test('/caster booth opens the booth pane', async ($, on) => {
  mock.clock(on, { now: 1_790_000_000_000 })
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const out = await $.command.run({ command: 'caster', args: 'booth' } as never)
  expect(out.text ?? '').toMatch(/booth is open/)
})
