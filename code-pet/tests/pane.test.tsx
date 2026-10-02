import { expect, mock, test } from 'claude-code/testing'

const PET = {
  command: 'pet',
  args: 'rename Moss',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

test('the pane draws the pet and a snack feeds it', async ($, on) => {
  mock.store(on, {})
  mock.clock(on, { now: Date.parse('2026-10-02T06:00:00Z') })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  const renamed = await $.command.run(PET)
  expect(renamed.text).toBe('Your pet is now called Moss.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'code-pet',
      surface,
      component: 'Pane',
      requestId: 'code-pet',
      props: {
        title: 'Code Pet',
        isFocused: true,
        bodyColumns: 60,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 28 },
        view: {},
      },
      viewport: { columns: 60, rows: 30 },
    })
    expect(await ui.find({ type: 'Text', text: 'MOSS' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 meals|1 meals/ })).toBeDefined()
    await ui.press({ key: 'snack' })
    expect(await ui.find({ type: 'Text', text: /meals/ })).toBeDefined()
    await ui.unmount()
  }
})
