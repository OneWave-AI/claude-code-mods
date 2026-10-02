import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Run, Step } from '../types'
import { DEMO, duration, elapsed, narrate, testNote } from './narrate'

const PANE = 'agent-narrator'
const TICK_MS = 120
const KEEP = 120

const feed = atom({ plugin: 'agent-narrator', key: 'feed' } as const, [] as Step[])
const run = atom({ plugin: 'agent-narrator', key: 'run' } as const, {
  isRunning: false,
  startedAt: null,
  endedAt: null,
  steps: 0,
  savedMinutes: 0,
} as Run)
const isSmart = atom({ plugin: 'agent-narrator', key: 'isSmart' } as const, false)
const isDemo = atom({ plugin: 'agent-narrator', key: 'isDemo' } as const, false)

const NAVY = '#0B1121'
const BLUE = '#61A5FA'
const GOLD = '#c2a87e'
const PAPER = '#E8E2D6'
const RING = ['◜', '◝', '◞', '◟']

let frame = 0
let shown = 0
let demoTimer: { cancel: () => void } | null = null

const open = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Agent at work' })

const startRun = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await update($, run, r => ({ ...r, isRunning: true, startedAt: r.isRunning ? r.startedAt : now, endedAt: null }))
}

const endRun = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await update($, run, r => ({ ...r, isRunning: false, endedAt: now }))
  $.ui.status(undefined)
}

/** Turns one model rewrite into a warmer line; the template line stays if the call fails. */
/** The short fields of a tool input, never file bodies or edit text, capped for the model call. */
const brief = (input: Record<string, unknown>) => {
  const keep = ['file_path', 'path', 'pattern', 'command', 'url', 'query', 'description']
  const picked = Object.fromEntries(
    keep.filter(k => typeof input[k] === 'string').map(k => [k, String(input[k]).slice(0, 120)]),
  )
  return JSON.stringify(picked).slice(0, 400)
}

const polish = async ($: EngineInterface, id: string, text: string, detail: string) => {
  const r = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 60,
    system:
      'You narrate an AI agent working, for a non-technical business owner watching. Rewrite the step as one short present-tense sentence, under 12 words, no jargon, no file extensions, no emojis, no quotes.',
    prompt: `Step: ${text}\nTechnical detail: ${detail.slice(0, 400)}`,
  })
  if (!r.isAnswered) return
  const line = r.text.trim().split('\n')[0]?.replace(/^["']|["']$/g, '')
  if (!line) return
  await update($, feed, list => list.map(s => (s.id === id ? { ...s, text: line } : s)))
}

const begin = async ($: EngineInterface, id: string, tool: string, input: Record<string, unknown>) => {
  const n = narrate(tool, input)
  const step: Step = { id, text: n.text, note: null, status: 'running', at: await $.clock.now(), minutes: n.minutes }
  await update($, feed, list => [...list, step].slice(-KEEP))
  await update($, run, r => ({ ...r, steps: r.steps + 1 }))
  $.ui.status(`Agent: ${n.text}`)
  if (await read($, isSmart)) void polish($, id, n.text, `${tool} ${brief(input)}`).catch(() => undefined)
  return step
}

const settle = async ($: EngineInterface, step: Step, isFailed: boolean, stdout: string) => {
  const tests = testNote(stdout)
  const note = tests ?? (isFailed ? 'did not work, trying another way' : null)
  const status: Step['status'] = isFailed ? 'failed' : 'done'
  await update($, feed, list => list.map(s => (s.id === step.id ? { ...s, status, note } : s)))
  if (!isFailed || tests) await update($, run, r => ({ ...r, savedMinutes: r.savedMinutes + step.minutes }))
}

const reset = async ($: EngineInterface) => {
  demoTimer?.cancel()
  demoTimer = null
  shown = 0
  await update($, feed, () => [])
  await update($, run, () => ({ isRunning: false, startedAt: null, endedAt: null, steps: 0, savedMinutes: 0 }))
}

const demo = async ($: EngineInterface) => {
  await reset($)
  await update($, isDemo, () => true)
  await open($)
  await startRun($)
  let i = 0
  let pending: Step | null = null
  const advance = async () => {
    if (pending) {
      const was = DEMO[i - 1]!
      await settle($, pending, was.isError === true, was.stdout ?? '')
      pending = null
    }
    const next = DEMO[i]
    if (!next) {
      await endRun($)
      await update($, isDemo, () => false)
      $.ui.toast('Done. Changes tested and saved, ready for your review.', { timeoutMs: 8000 })
      return
    }
    i += 1
    pending = await begin($, `demo-${i}`, next.tool, next.input)
    demoTimer = $.clock.after(next.ms, () => void advance().catch(() => undefined))
  }
  await advance()
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'narrate',
      description: 'Watch the agent work in plain English: /narrate [smart|demo|reset]',
    })
    $.clock.every(TICK_MS, () => {
      void (async () => {
        const r = await read($, run)
        const isCounting = Math.abs(r.savedMinutes - shown) > 0.05
        if (isCounting) shown += Math.max(0.2, (r.savedMinutes - shown) * 0.12) * Math.sign(r.savedMinutes - shown)
        if (Math.abs(r.savedMinutes - shown) < 0.2) shown = r.savedMinutes
        if (!r.isRunning && !isCounting) return
        frame += 1
        $.ui.invalidate('ui.render')
      })().catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'narrate' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'smart') {
      const isOn = !(await read($, isSmart))
      await update($, isSmart, () => isOn)
      return { text: isOn ? 'Smart narration on: each step is rewritten by a small model.' : 'Smart narration off.' }
    }
    if (arg === 'demo') {
      await demo($)
      return { text: 'Playing the demo.' }
    }
    if (arg === 'reset') {
      await reset($)
      return { text: 'Narration cleared.' }
    }
    await $.ui.open({ id: PANE, title: 'Agent at work', focus: true })
    return { text: 'Narrator open.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, isDemo))) await startRun($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isDemo)) return next(e)
    const tool = String(e.tool)
    const step = await begin($, e.tool_use_id, tool, e as unknown as Record<string, unknown>)
    const ran = await next(e)
    const out = ran.result as { stdout?: unknown; stderr?: unknown } | undefined
    const stdout = typeof out?.stdout === 'string' ? `${out.stdout}\n${String(out.stderr ?? '')}` : ''
    await settle($, step, ran.deny !== undefined || ran.isError === true, stdout)
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!(await read($, isDemo))) await endRun($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, run)
    const list = await read($, feed)
    const smart = await read($, isSmart)
    const now = await $.clock.now()
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 12)
    const time = r.startedAt ? elapsed((r.isRunning ? now : (r.endedAt ?? now)) - r.startedAt) : '0:00'

    const row = (s: Step) => {
      const isLive = s.status === 'running'
      const mark = isLive ? RING[frame % RING.length]! : s.status === 'failed' ? '×' : '✓'
      const color = isLive ? BLUE : s.status === 'failed' ? GOLD : PAPER
      return (
        <Box key={s.id}>
          <Box width={3} flexShrink={0}>
            <Text color={color} bold={isLive}>{mark}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            <Text bold={isLive} dimColor={!isLive && s.status === 'done'} wrap="wrap">
              {s.text}
              {s.note && <Text color={s.status === 'failed' ? GOLD : BLUE}>{`  ·  ${s.note}`}</Text>}
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text>
            {r.isRunning ? (
              <Text color={BLUE} bold>{`${RING[frame % RING.length]} WORKING`}</Text>
            ) : (
              <Text backgroundColor={GOLD} color={NAVY} bold>{r.steps ? ' DONE ' : ' READY '}</Text>
            )}
            <Text dimColor>{`   step ${r.steps}   ${time}`}</Text>
          </Text>
          {smart && <Text dimColor>smart</Text>}
        </Box>
        <Box marginTop={1} marginBottom={1} flexDirection="column">
          <Text dimColor>ESTIMATED HUMAN TIME SAVED</Text>
          <Text bold color={GOLD}>{duration(shown)}</Text>
        </Box>
        {list.length === 0 && <Text dimColor>Waiting for the agent to start. Ask it to do something, or /narrate demo.</Text>}
        {list.slice(-room).map(row)}
        <Box marginTop={1}>
          <Text dimColor>
            <Text color={BLUE}>Claude</Text> · working for you
          </Text>
        </Box>
      </Box>
    )
  })
}
