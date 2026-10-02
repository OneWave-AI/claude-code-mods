import { describe, expect, test } from 'claude-code/testing'

import { DEMO, duration, fileLabel, narrate, narrateCommand, testNote } from '../hooks/narrate'

describe('narration templates', () => {
  test('files read as plain English', async () => {
    expect(fileLabel('app/pricing/page.tsx')).toBe('the pricing page')
    expect(fileLabel('components/CheckoutForm.tsx')).toBe('the checkout form screen')
    expect(fileLabel('lib/pricing-rules.ts')).toBe('the pricing rules code')
    expect(fileLabel('tests/checkout.test.ts')).toBe('the checkout tests')
    expect(fileLabel('.env.local')).toBe('the private settings')
  })

  test('each tool gets a buyer-readable line', async () => {
    expect(narrate('Read', { file_path: 'app/pricing/page.tsx' }).text).toBe('Reading the pricing page')
    expect(narrate('Edit', { file_path: 'components/CheckoutForm.tsx' }).text).toBe('Saving changes to the checkout form screen')
    expect(narrate('Write', { file_path: 'README.md' }).text).toBe('Creating the readme notes')
    expect(narrate('Grep', { pattern: 'applyDiscount' }).text).toBe('Searching the project for "applyDiscount"')
    expect(narrate('WebFetch', { url: 'https://www.stripe.com/docs' }).text).toBe('Reading stripe.com')
    expect(narrate('WebSearch', { query: 'volume pricing' }).text).toBe('Researching "volume pricing" on the web')
    expect(narrate('Agent', { description: 'Audit the checkout' }).text).toBe('Bringing in a helper to audit the checkout')
    expect(narrate('mcp__claude_ai_Gmail__search_threads', {}).text).toBe('Using Gmail to search threads')
    expect(narrate('mcp__claude_ai_Slack__slack_send_message', {}).text).toBe('Using Slack to send message')
  })

  test('shell commands explained', async () => {
    expect(narrateCommand('npm test').text).toBe('Running the test suite')
    expect(narrateCommand('git commit -m x').text).toBe('Saving a checkpoint of the work')
    expect(narrateCommand('pnpm install').text).toBe('Installing the building blocks it needs')
    expect(narrateCommand('npm run build').text).toBe('Building the app to make sure it all fits together')
    expect(narrateCommand('vercel --prod').text).toBe('Deploying the update live')
    expect(narrateCommand('ls -la').text).toBe('Looking around the project')
    expect(narrateCommand('weird-tool --x').text).toBe('Running a quick command')
  })

  test('test results and durations', async () => {
    expect(testNote('Tests: 2 failed, 40 passed, 42 total')).toBe('40 passed, 2 failed')
    expect(testNote('===== 42 passed in 0.3s')).toBe('42 passed')
    expect(testNote('built fine')).toBe(null)
    expect(duration(42)).toBe('42m')
    expect(duration(185)).toBe('3h 05m')
    expect(DEMO.length).toBeGreaterThan(8)
  })
})
