import { expect, mock, test } from 'claude-code/testing'

test('the pane draws its empty state on every surface', async ($, on) => {
  mock.clock(on, { now: 1_790_000_000_000 })
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'inner-monologue',
      surface,
      component: 'Pane',
      requestId: 'inner-monologue',
      props: { title: 'Inner monologue', isFocused: false, bodyColumns: 60, placement: 'dock' } as never,
      viewport: { columns: 60, rows: 30 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /INNER MONOLOGUE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Quiet in here/ })).toBeDefined()
    await ui.unmount()
  }
})
