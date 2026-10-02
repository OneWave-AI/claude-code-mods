import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  title: 'Agent at work',
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 28 },
  view: {},
} as const

const CMD = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('a tool call becomes a narrated line on every surface', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-02T06:00:00Z') })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: { stdout: 'Tests: 42 passed, 42 total', stderr: '' } }))
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'agent-narrator',
      surface,
      component: 'Pane',
      requestId: 'agent-narrator',
      props: PROPS,
      viewport: { columns: 80, rows: 30 },
    })
    expect(await ui.find({ type: 'Text', text: /Running the test suite/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /42 passed/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /TIME SAVED/ })).toBeDefined()
    await ui.unmount()
  }
  await $.command.run({ command: 'narrate', args: 'reset', ...CMD })
})
