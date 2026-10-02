import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Thought } from '../types'
import { DEMO, Inbox, THINKER, describeCall, isDue, revealed, thinkerPrompt, thoughtLine } from './logic'

const PANE = 'inner-monologue'
const KEEP = 30
const GOLD = '#c2a87e'
const BLUE = '#61A5FA'
const PAPER = '#E8E2D6'
const STONE = '#8A8478'

const thoughts = atom({ plugin: 'inner-monologue', key: 'thoughts' } as const, [] as Thought[])
const isThinking = atom({ plugin: 'inner-monologue', key: 'isThinking' } as const, false)

const inbox = new Inbox()
let lastCallAt = 0
let isBusy = false
let isDemo = false
let typing: { cancel: () => void } | null = null

const clock = (at: number) => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE)

/** Redraws at ~30/s while the newest thought is still being typed, then stops. */
const type = ($: EngineInterface) => {
  if (typing) return
  const timer = $.clock.every(34, () => {
    void (async () => {
      const newest = (await read($, thoughts)).at(-1)
      const now = await $.clock.now()
      $.ui.invalidate('ui.render')
      if (!newest || revealed(newest.text, now - newest.at) >= newest.text.length) {
        timer.cancel()
        if (typing === timer) typing = null
      }
    })()
  })
  typing = timer
}

const think = async ($: EngineInterface, text: string) => {
  const at = await $.clock.now()
  await update($, thoughts, list => [...list, { id: at, text, at }].slice(-KEEP))
  type($)
}

const tick = async ($: EngineInterface) => {
  if (isBusy || isDemo || inbox.size === 0) return
  const now = await $.clock.now()
  if (!isDue(now, lastCallAt) || !(await isOpen($))) return
  isBusy = true
  lastCallAt = now
  await update($, isThinking, () => true)
  try {
    const earlier = (await read($, thoughts)).slice(-4).map(t => t.text)
    const reply = await $.model.complete({
      model: 'haiku',
      system: THINKER,
      prompt: thinkerPrompt(inbox.drain(), earlier),
      maxTokens: 80,
      effort: 'low',
    })
    const line = reply.isAnswered ? thoughtLine(reply.text) : ''
    if (line) await think($, line)
  } finally {
    isBusy = false
    await update($, isThinking, () => false)
  }
}

const runDemo = async ($: EngineInterface) => {
  isDemo = true
  await update($, thoughts, () => [])
  DEMO.forEach((text, i) => {
    $.clock.after(i * 3300, () => {
      void think($, text).then(() => {
        if (i === DEMO.length - 1) isDemo = false
      })
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'monologue',
      description: "Claude's inner monologue pane: /monologue [demo|clear]",
    })
    $.clock.every(500, () => void tick($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'monologue' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    await $.ui.open({ id: PANE, title: 'Inner monologue' })
    if (arg === 'demo') {
      await runDemo($)
      return { text: 'Inner monologue: demo playing.' }
    }
    if (arg === 'clear') {
      await update($, thoughts, () => [])
      return { text: 'Inner monologue cleared.' }
    }
    return { text: 'Inner monologue open. It thinks while the pane is open.' }
  })

  on('prompt.submit', ($, e, next) => {
    if (e.text.trim() && !e.text.trim().startsWith('/')) inbox.push(`the user asks: "${e.text.trim().slice(0, 120)}"`)
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    inbox.push(`${e.agentId ? 'a subagent is ' : ''}${describeCall(String(e.tool), e as unknown as Record<string, unknown>)}`)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, thoughts)
    const busy = await read($, isThinking)
    const now = await $.clock.now()
    const room = Math.max(2, Math.floor(((e.viewport?.rows ?? 24) - 4) / 2))
    const shown = list.slice(-room).reverse()

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text color={GOLD} bold>INNER MONOLOGUE</Text>
          <Text color={STONE}>{busy ? 'thinking...' : isDemo ? 'demo' : `${list.length} thoughts`}</Text>
        </Box>
        {shown.length === 0 && <Text color={STONE}>Quiet in here. Give Claude something to do.</Text>}
        {shown.map((t, i) => {
          const isNewest = i === 0
          const count = isNewest ? revealed(t.text, now - t.at) : t.text.length
          const isTyping = isNewest && count < t.text.length
          return (
            <Box key={`t-${t.id}`} marginBottom={1}>
              <Text color={isNewest ? GOLD : STONE}>{clock(t.at)}  </Text>
              <Text wrap="wrap" color={isNewest ? PAPER : STONE} dimColor={i > 3}>
                {t.text.slice(0, count)}
                {isTyping && <Text color={BLUE}>▌</Text>}
              </Text>
            </Box>
          )
        })}
      </Box>
    )
  })
}
