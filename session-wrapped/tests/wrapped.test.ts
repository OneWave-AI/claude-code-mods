import { describe, expect, test } from 'claude-code/testing'

import { cardHeight, renderCard } from '../hooks/card'
import { adler32, crc32, encodePng, canvas, fit, textWidth } from '../hooks/png'
import { addCall, addTurn, allCards, cards, compact, connectorOf, limitCard, limitsOf, demoStats, demoUsage, empty, isTestRun, mvp, prettyModel, span, topFile, totalCalls, usageCards } from '../hooks/stats'

describe('stats', () => {
  test('tool calls, edits and test transitions fold in', async () => {
    let s = empty(0)
    s = addCall(s, { tool: 'Edit', filePath: '/a/x.ts', isError: false })
    s = addCall(s, { tool: 'Edit', filePath: '/a/x.ts', isError: false })
    s = addCall(s, { tool: 'Write', filePath: '/a/y.ts', isError: false })
    s = addCall(s, { tool: 'Bash', command: 'npm test', isError: true })
    s = addCall(s, { tool: 'Bash', command: 'npm test', isError: false })
    s = addCall(s, { tool: 'Bash', command: 'ls', isError: true })
    s = addCall(s, { tool: 'Read', isError: false })
    expect(totalCalls(s)).toBe(7)
    expect(s.bash).toBe(3)
    expect(s.tests).toEqual({ pass: 1, fail: 1, comebacks: 1, last: 'pass' })
    expect(topFile(s)).toEqual(['/a/x.ts', 2])
    expect(mvp(s)?.[0]).toBe('Bash')
  })

  test('skills and connectors fold in from tool calls', async () => {
    let s = empty(0)
    s = addCall(s, { tool: 'Skill', skill: 'write-docs', isError: false })
    s = addCall(s, { tool: 'Skill', skill: 'write-docs', isError: false })
    s = addCall(s, { tool: 'mcp__claude_ai_Gmail__search_threads', isError: false })
    s = addCall(s, { tool: 'mcp__plugin_design_slack__send', isError: false })
    s = addCall(s, { tool: 'Read', isError: false })
    expect(s.skills).toEqual({ 'write-docs': 2 })
    expect(s.connectors).toEqual({ Gmail: 1, slack: 1 })
  })

  test('connector, model and number labels', async () => {
    expect(connectorOf('mcp__claude_ai_Supabase__execute_sql')).toBe('Supabase')
    expect(connectorOf('mcp__acme-crm__list_deals')).toBe('acme crm')
    expect(connectorOf('mcp__80ea6c3a-9ab7-4642__x')).toBe(null)
    expect(connectorOf('Bash')).toBe(null)
    expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(prettyModel('Opus 5.5')).toBe('Opus 5.5')
    expect(compact(3_513_928_841)).toBe('3.5B')
    expect(compact(840_000_000)).toBe('840M')
    expect(compact(12_000)).toBe('12K')
    expect(compact(950)).toBe('950')
  })

  test('week and month cards read the rollup, none without one', async () => {
    const u = usageCards(demoUsage(0))
    expect(u.map(c => c.label)).toEqual(['THIS WEEK', 'THIS MONTH', 'TOP MODEL', 'TOP SKILL', 'TOP CONNECTOR'])
    expect(u[0]?.value).toBe('1.8B')
    expect(u[2]?.value).toBe('OPUS 5.5')
    expect(u[2]?.note).toContain('77% of month')
    expect(usageCards(null)).toEqual([])
  })

  test('the weekly limit is the top-right tile', async () => {
    const now = Date.parse('2026-10-02T06:00:00Z')
    const list = allCards(demoStats(now), demoUsage(now), now)
    expect(list[3]?.label).toBe('WEEKLY LIMIT')
    expect(list[3]?.value).toBe('62%')
    expect(list[3]?.note).toBe('5h 34%, resets 2d 4h')
    expect(list.some(c => c.label === 'TOP TOOL')).toBe(false)
    const limits = limitsOf([{ kind: 'seven_day', percentUsed: 41.6 }, { kind: 'five_hour', percentUsed: 12 }])
    expect(limitCard({ ...empty(0), limits }, now).value).toBe('42%')
    expect(limitCard(empty(0), now).value).toBe('--')
  })

  test('turns keep the longest', async () => {
    const s = addTurn(addTurn(empty(0), 5000), 2000)
    expect(s.turns).toBe(2)
    expect(s.longestTurnMs).toBe(5000)
  })

  test('test runs are recognized, other commands are not', async () => {
    for (const c of ['npm test', 'pnpm run test', 'npx vitest run', 'pytest -q', 'go test ./...', 'claude plugin test .', 'bun test'])
      expect(isTestRun(c)).toBe(true)
    for (const c of ['npm run build', 'git status', 'cat test.txt', 'ls tests'])
      expect(isTestRun(c)).toBe(false)
  })

  test('span formats hours, minutes, seconds', async () => {
    expect(span(45_000)).toBe('45S')
    expect(span(14 * 60_000)).toBe('14M')
    expect(span(83 * 60_000)).toBe('1H 23M')
  })

  test('eight cards, demo first card is the session length', async () => {
    const now = 10_000_000_000
    const list = cards(demoStats(now), now)
    expect(list.length).toBe(8)
    expect(list[0]?.value).toBe('2H 47M')
    expect(list[2]?.value).toBe('EDIT')
    expect(list[7]?.value).toBe('$14.62')
    expect(list[0]?.note).toBe('37 turns on Opus 5.5')
  })

  test('the full reveal is sixteen cards with usage, ten without', async () => {
    const now = 10_000_000_000
    expect(allCards(demoStats(now), demoUsage(now), now).length).toBe(16)
    expect(allCards(demoStats(now), null, now).length).toBe(11)
  })
})

describe('png', () => {
  test('crc32 and adler32 match known values', async () => {
    const abc = new TextEncoder().encode('123456789')
    expect(crc32(abc)).toBe(0xcbf43926)
    expect(adler32(new TextEncoder().encode('Wikipedia'))).toBe(0x11e60398)
  })

  test('encodes a valid PNG signature and IHDR', async () => {
    const png = encodePng(canvas(3, 2, 0x112233))
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(String.fromCharCode(...png.slice(12, 16))).toBe('IHDR')
    expect(String.fromCharCode(...png.slice(png.length - 8, png.length - 4))).toBe('IEND')
  })

  test('the card renders at 1200x675 and values fit their tiles', async () => {
    const now = 10_000_000_000
    const png = renderCard(cards(demoStats(now), now), 'OCT 2 2026', true)
    const view = new DataView(png.buffer)
    expect(view.getUint32(16)).toBe(1200)
    expect(view.getUint32(20)).toBe(675)
    expect(textWidth('$14.62', fit('$14.62', 236, 9))).toBeLessThan(237)
  })

  test('the card grows a row per four extra tiles', async () => {
    const now = 10_000_000_000
    expect(cardHeight(8)).toBe(675)
    expect(cardHeight(16)).toBe(1131)
    const png = renderCard(allCards(demoStats(now), demoUsage(now), now), 'OCT 2 2026', true)
    expect(new DataView(png.buffer).getUint32(20)).toBe(1131)
  })
})
