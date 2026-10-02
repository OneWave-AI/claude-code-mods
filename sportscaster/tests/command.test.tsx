import { expect, mock, test } from 'claude-code/testing'

test('/caster toggles on and off; a bare /caster flips it', async ($, on) => {
  mock.clock(on, { now: 1_790_000_000_000 })
  mock.store(on)
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  const run = async (args: string) => (await $.command.run({ command: 'caster', args } as never)).text ?? ''
  expect(await run('on')).toMatch(/on the air/)
  expect(await run('off')).toMatch(/off the air/)
  expect(await run('')).toMatch(/on the air/)
  expect(await run('')).toMatch(/off the air/)
})
