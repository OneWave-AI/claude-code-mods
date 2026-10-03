import { expect, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-03T18:00:00Z')
const PROPS = { title: 'Swarm', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} }
const RUN = { command: 'swarm', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }

for (const surface of ['terminal', 'desktop'] as const) {
  test(`swarm shows the tree, status and comms on ${surface}`, async ($, on) => {
    let n = 0
    on('clock.now', () => ({ value: NOW + n++ * 1000 }) as never)
    on('clock.every', () => ({ value: undefined }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    on('ui.status', () => ({ value: undefined }) as never)
    on('ui.toast', () => ({ value: undefined }) as never)
    on('agent.list', () => ({
      value: [
        { id: 'a1', description: 'Research competitors', type: 'Explore', status: 'running', name: 'researcher' },
        { id: 'a2', description: 'Write the report', type: 'general-purpose', status: 'completed', name: 'writer' },
        { id: 'a3', description: 'Check sources', type: 'Explore', status: 'running', parentId: 'a1' },
      ],
    }) as never)
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }) as never)
    on('session.send', () => ({ isDelivered: true }) as never)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }) as never)

    await $.agent.spawn({ prompt: 'go', description: 'Research competitors', subagentType: 'Explore', name: 'researcher' } as never)
    await $.command.run(RUN as never)
    await $.session.send({ to: 'researcher', text: 'focus on pricing pages' } as never)
    const ui = await $.ui.mount({ plugin: 'swarm', surface, component: 'Pane', requestId: 'swarm', props: PROPS, viewport: { columns: 72, rows: 60 } } as never)
    const drawn = JSON.stringify(await ui.drawn())
    if (surface === 'desktop') expect(drawn).toContain('<svg')
    expect(drawn).toContain('researcher')
    expect(drawn).toContain('writer')
    expect(drawn).toContain('Check sources')
    expect(drawn).toContain('focus on pricing pages')
    await ui.press({ key: 'refresh' })
    await ui.press({ key: 'clear' })
    await ui.unmount()
  })
}
