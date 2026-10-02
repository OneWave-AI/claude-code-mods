import { describe, expect, test } from 'claude-code/testing'

import { DEMO, Inbox, describeCall, isDue, revealed, thinkerPrompt, thoughtLine } from '../hooks/logic'

describe('events', () => {
  test('tool calls read as short notes', async () => {
    expect(describeCall('Read', { file_path: '/a/b/auth.ts' })).toBe('reading auth.ts')
    expect(describeCall('Bash', { command: 'npm test' })).toBe('running `npm test`')
    expect(describeCall('mcp__claude_ai_Slack__slack_send_message', {})).toBe('calling claude_ai_Slack slack_send_message')
  })

  test('the inbox folds repeats and caps its size', async () => {
    const inbox = new Inbox(3)
    inbox.push('reading a.ts')
    inbox.push('reading a.ts')
    inbox.push('b')
    inbox.push('c')
    inbox.push('d')
    expect(inbox.drain()).toEqual(['b', 'c', 'd'])
    inbox.push('x')
    inbox.push('x')
    expect(inbox.drain()).toEqual(['x (x2)'])
    expect(inbox.size).toBe(0)
  })

  test('one call per four seconds', async () => {
    expect(isDue(3999, 0)).toBe(false)
    expect(isDue(4000, 0)).toBe(true)
  })
})

describe('thoughts', () => {
  test('replies clean to one plain line', async () => {
    expect(thoughtLine('"Another useEffect. Wonderful."\nsecond line')).toBe('Another useEffect. Wonderful.')
    expect(thoughtLine('- **bold** move')).toBe('bold move')
    expect(thoughtLine(Array(40).fill('w').join(' ')).endsWith('...')).toBe(true)
  })

  test('the prompt carries the notes and earlier thoughts', async () => {
    const p = thinkerPrompt(['reading a.ts'], ['first thought'])
    expect(p.includes('- first thought')).toBe(true)
    expect(p.includes('- reading a.ts')).toBe(true)
  })

  test('the typewriter reveals over time and stops at the end', async () => {
    expect(revealed('hello world', 0)).toBe(0)
    expect(revealed('hello world', 100, 40)).toBe(4)
    expect(revealed('hello world', 99999)).toBe(11)
  })

  test('demo lines are short and emoji-free', async () => {
    for (const line of DEMO) {
      expect(line.split(' ').length <= 18).toBe(true)
      expect(/\p{Extended_Pictographic}/u.test(line)).toBe(false)
    }
  })
})
