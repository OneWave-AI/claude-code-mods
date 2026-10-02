import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  title: 'Race',
  isFocused: false,
  bodyColumns: 90,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 28 },
  view: {},
} as const

test('demo race draws both lanes on every surface', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-02T06:00:00Z') })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({ command: 'race', args: 'demo', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'agent-race',
      surface,
      component: 'Pane',
      requestId: 'agent-race',
      props: PROPS,
      viewport: { columns: 90, rows: 30 },
    })
    expect(await ui.find({ type: 'Text', text: /AGENT RACE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sonnet/ })).toBeDefined()
    await ui.unmount()
  }
})
