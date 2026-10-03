import { expect, test } from 'claude-code/testing'

import { finish, labelOf, peakConcurrency, reconcile, resolve, summary, toolEnd, toolStart, tree, upsert } from '../hooks/model'

const T = 1_000_000

test('tree nests agents under whoever spawned them', async () => {
  let list = upsert([], 'a', T, { label: 'research', type: 'Explore' })
  list = upsert(list, 'b', T + 10, { label: 'build', type: 'general-purpose' })
  list = upsert(list, 'c', T + 20, { label: 'sub', type: 'Explore', parentId: 'b' })
  const rows = tree(list)
  expect(rows.map(r => `${r.depth}:${r.agent.id}`)).toEqual(['0:a', '0:b', '1:c'])
  expect(rows[0]!.last).toBe(false)
  expect(rows[2]!.trail).toEqual([false])
})

test('tool calls set what an agent is doing, unknown loops get a row', async () => {
  let list = toolStart([], 'w1', 'Read', labelOf('Read', { file_path: '/x/y/app.ts' }), T)
  expect(list[0]!.doing).toBe('reading app.ts')
  expect(list[0]!.busy).toBe(true)
  list = toolEnd(list, 'w1', false, T + 5)
  expect(list[0]!.errors).toBe(1)
  expect(list[0]!.busy).toBe(false)
})

test('reconcile marks finished agents once and keeps names', async () => {
  const start = upsert([], 'a', T, { label: 'research' })
  const one = reconcile(start, [{ id: 'a', description: 'research', type: 'Explore', status: 'completed', name: 'scout' }], T + 9000)
  expect(one.finished.length).toBe(1)
  expect(one.agents[0]!.name).toBe('scout')
  expect(one.agents[0]!.endedAt).toBe(T + 9000)
  const two = reconcile(one.agents, [{ id: 'a', description: 'research', type: 'Explore', status: 'completed' }], T + 12000)
  expect(two.finished.length).toBe(0)
})

test('summary counts live/done/failed and peak parallelism', async () => {
  let list = upsert([], 'a', T, {})
  list = upsert(list, 'b', T + 10, {})
  list = upsert(list, 'c', T + 30, {})
  list = finish(list, 'a', 'completed', T + 20)
  list = finish(list, 'c', 'failed', T + 40)
  const s = summary(list, T + 50)
  expect([s.live, s.done, s.failed]).toEqual([1, 1, 1])
  expect(peakConcurrency(list, T + 50)).toBe(2)
})

test('resolve maps names and the lead', async () => {
  const list = upsert([], 'id9', T, { name: 'researcher' })
  expect(resolve(list, 'researcher')).toBe('id9')
  expect(resolve(list, 'team-lead')).toBe('main')
})
