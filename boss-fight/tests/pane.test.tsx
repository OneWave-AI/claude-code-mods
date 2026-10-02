import { expect, mock, test } from 'claude-code/testing'

test('a failing then passing run is a spawn then a KO in the pane', async ($, on) => {
  mock.store(on, { kills: 2 })
  mock.clock(on, { now: Date.parse('2026-10-02T06:00:00Z') })
  const toasts: string[] = []
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  let output = 'Tests:       3 failed, 4 passed, 7 total'
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: output, stderr: '', interrupted: false }, text: output }))

  await $.tool.call({ tool: 'Bash', command: 'npx jest', tool_use_id: 't1' })
  expect(toasts.some(t => t.startsWith('A boss appears'))).toBe(true)

  output = 'Tests:       7 passed, 7 total'
  await $.tool.call({ tool: 'Bash', command: 'npx jest', tool_use_id: 't2' })
  expect(toasts.some(t => /defeated in 2 runs/.test(t))).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'boss-fight',
      surface,
      component: 'Pane',
      requestId: 'boss-fight',
      props: {
        title: 'Boss Fight',
        isFocused: true,
        bodyColumns: 70,
        placement: 'dock',
        scroll: { offset: 0, bodyRows: 28 },
        view: {},
      },
      viewport: { columns: 70, rows: 30 },
    })
    expect(await ui.find({ type: 'Text', text: /VICTORY/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /loot drop/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '3' })).toBeDefined()
    await ui.unmount()
  }
})
