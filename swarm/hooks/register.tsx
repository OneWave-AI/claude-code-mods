import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Beat, Lead, Msg } from '../types'
import { swarmSvg } from './card'
import {
  addBeat,
  addMsg,
  ago,
  elapsed,
  finish,
  isFailed,
  isLive,
  labelOf,
  MAIN,
  nameOf,
  reconcile,
  resolve,
  shortModel,
  statusWord,
  summary,
  toolEnd,
  toolStart,
  tree,
  upsert,
} from './model'

const PANE = 'swarm'
const TITLE = 'Swarm'
const POLL_MS = 2000

const GOLD = '#c2a87e'
const GOLD_HI = '#d4a44a'
const BLUE = '#61A5FA'
const RED = '#e5484d'
const INK = '#0B1121'

const agentsAtom = atom({ plugin: 'swarm', key: 'agents' } as const, [] as Agent[])
const leadAtom = atom({ plugin: 'swarm', key: 'lead' } as const, { busy: false, tools: 0, lastAt: 0, startedAt: 0 } as Lead)
const msgsAtom = atom({ plugin: 'swarm', key: 'msgs' } as const, [] as Msg[])
const beatsAtom = atom({ plugin: 'swarm', key: 'beats' } as const, [] as Beat[])
const tickAtom = atom({ plugin: 'swarm', key: 'tick' } as const, 0)

let lastStatus: string | undefined
let wasLive = 0

const beat = async ($: EngineInterface, who: string, kind: Beat['kind'], text: string) => {
  const at = await $.clock.now()
  await update($, beatsAtom, list => addBeat(list, { at, who, kind, text }))
}

/** "◇ swarm 3 live · 5 done" while anything has run this session. */
const pushStatus = async ($: EngineInterface) => {
  const agents = await read($, agentsAtom)
  const now = await $.clock.now()
  const s = summary(agents, now)
  const text = agents.length
    ? `◇ swarm ${s.live ? `${s.live} live · ` : ''}${s.done} done${s.failed ? ` · ${s.failed} failed` : ''}`
    : undefined
  if (s.live === 0 && wasLive > 0 && agents.length > 1) {
    $.ui.toast(`Swarm stood down: ${agents.length} agents, ${s.tools} tool calls, ${s.first !== undefined && s.last !== undefined ? elapsed(s.last - s.first) : ''} wall. /swarm`, {
      timeoutMs: 7000,
    })
  }
  wasLive = s.live
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

/** One read of `$.agent.list()` folded into the tree; redraws only when something moved. */
const poll = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const listed = await $.agent.list().catch(() => [])
  const prev = await read($, agentsAtom)
  const { agents, finished } = reconcile(prev, listed, now)
  if (JSON.stringify(agents) !== JSON.stringify(prev)) await update($, agentsAtom, () => agents)
  for (const a of finished) await beat($, a.name || a.label, isFailed(a.status) ? 'fail' : 'done', `${statusWord(a.status)} in ${elapsed(now - a.startedAt)}, ${a.tools} tool calls`)
  if (agents.some(a => isLive(a.status))) await update($, tickAtom, n => n + 1)
  await pushStatus($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'swarm', description: 'Swarm: live map of subagents and agent teams, who is doing what, who spawned whom, who is talking' })
    const now = await $.clock.now()
    await update($, leadAtom, l => (l.startedAt ? l : { ...l, startedAt: now, lastAt: now }))
    $.clock.every(POLL_MS, () => void poll($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'swarm' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await poll($).catch(() => undefined)
    const agents = await read($, agentsAtom)
    const s = summary(agents, await $.clock.now())
    return { text: agents.length ? `Swarm open: ${s.live} live, ${s.done} done, ${s.failed} failed.` : 'Swarm open. No agents yet this session.' }
  })

  // A spawn: who launched it, what it runs as, on which model.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const now = await $.clock.now()
    if (r.deny !== undefined) {
      await beat($, e.name || e.description, 'deny', `spawn refused: ${r.deny}`)
      return r
    }
    if (r.agentId) {
      const id = r.agentId
      await update($, agentsAtom, list =>
        upsert(list, id, now, {
          label: e.description,
          type: e.fork ? 'fork' : e.subagentType,
          ...(e.name ? { name: e.name } : {}),
          ...(e.parentAgentId ? { parentId: e.parentAgentId } : {}),
          model: r.model,
          bg: e.background,
          toolUseId: e.tool_use_id,
          status: 'running',
          startedAt: now,
        }),
      )
      const agents = await read($, agentsAtom)
      const by = e.parentAgentId ? nameOf(agents, e.parentAgentId) : 'lead'
      await beat($, e.name || e.description, 'spawn', `spawned by ${by} as ${e.fork ? 'fork' : e.subagentType}${r.model ? ` on ${shortModel(r.model)}` : ''}`)
      await pushStatus($)
    }
    return r
  })

  // Every tool call, in whichever loop: what each agent is doing right now.
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const who = e.agentId
    const now = await $.clock.now()
    const doing = labelOf(e.tool, input)
    if (who) await update($, agentsAtom, list => toolStart(list, who, e.tool, doing, now))
    else await update($, leadAtom, l => ({ ...l, doing, doingTool: e.tool, busy: true, tools: l.tools + 1, lastAt: now }))
    let ok = false
    try {
      const ran = await next(e)
      ok = ran.deny === undefined && ran.isError !== true
      return ran
    } finally {
      const end = await $.clock.now()
      if (who) {
        await update($, agentsAtom, list => toolEnd(list, who, ok, end))
        if (!ok) {
          const agents = await read($, agentsAtom)
          await beat($, nameOf(agents, who), 'fail', `${doing} failed`)
        }
      } else await update($, leadAtom, l => ({ ...l, busy: false, lastAt: end }))
      // A foreground Agent call returning means that agent is finished.
      if (e.tool === 'Agent') {
        const agents = await read($, agentsAtom)
        const a = agents.find(x => x.toolUseId === e.tool_use_id)
        if (a && !a.bg && isLive(a.status)) {
          await update($, agentsAtom, list => finish(list, a.id, ok ? 'completed' : 'failed', end))
          await beat($, a.name || a.label, ok ? 'done' : 'fail', `${ok ? 'done' : 'failed'} in ${elapsed(end - a.startedAt)}, ${a.tools} tool calls`)
          await pushStatus($)
        }
      }
    }
  })

  // Messages between agents, as they leave.
  on('session.send', async ($, e, next) => {
    const r = await next(e)
    if (r.isDelivered) {
      const at = await $.clock.now()
      const agents = await read($, agentsAtom)
      const from = e.agentId ?? MAIN
      const to = resolve(agents, e.to)
      await update($, msgsAtom, list => addMsg(list, { at, from, to, text: e.text }))
      await beat($, nameOf(agents, from), 'msg', `→ ${nameOf(agents, to)}: ${e.text.replace(/\s+/g, ' ')}`)
    }
    return r
  })

  // Teammates in their own panes write to the team inbox; this process never saw them send.
  on('session.receive', async ($, e, next) => {
    const r = await next(e)
    const o = e.origin as { teammate?: string; isVerified?: boolean }
    if (typeof o.teammate === 'string' && o.isVerified === false) {
      const at = await $.clock.now()
      const agents = await read($, agentsAtom)
      const from = resolve(agents, o.teammate)
      const to = e.agentId ?? MAIN
      await update($, msgsAtom, list => addMsg(list, { at, from, to, text: e.text }))
      await beat($, o.teammate, 'msg', `→ ${nameOf(agents, to)}: ${e.text.replace(/\s+/g, ' ')}`)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    const out = e.usage?.output_tokens ?? 0
    if (id && out) {
      const now = await $.clock.now()
      await update($, agentsAtom, list => {
        const a = list.find(x => x.id === id)
        return a ? upsert(list, id, now, { outTokens: a.outTokens + out }) : list
      })
    }
    if (!id) await update($, leadAtom, l => ({ ...l, busy: false, doing: undefined }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await read($, tickAtom)
    const now = await $.clock.now()
    const agents = await read($, agentsAtom)
    const lead = await read($, leadAtom)
    const msgs = await read($, msgsAtom)
    const beats = await read($, beatsAtom)
    const clear = () => {
      void (async () => {
        const live = (await read($, agentsAtom)).filter(a => isLive(a.status))
        await update($, agentsAtom, () => live)
        await update($, msgsAtom, () => [])
        await update($, beatsAtom, () => [])
        await pushStatus($)
      })()
    }
    const controls = (
      <Box key="controls" gap={2} flexWrap="wrap">
        <Button key="refresh" label="refresh" hotkey="r" onPress={() => void poll($).catch(() => undefined)} />
        <Button key="clear" label="clear finished" hotkey="c" onPress={clear} />
      </Box>
    )
    const s = summary(agents, now)

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      const card = swarmSvg({ now, agents, lead, msgs, beats })
      const alt = `Swarm: ${s.live} live, ${s.done} done, ${s.failed} failed agents. ${tree(agents)
        .slice(0, 8)
        .map(r => `${r.agent.name || r.agent.label} (${statusWord(r.agent.status)}${r.agent.doing ? `, ${r.agent.doing}` : ''})`)
        .join('; ')}`
      return (
        <Box flexDirection="column" gap={1}>
          <Svg key="swarm" source={card.source} alt={alt} width={card.width} height={card.height} />
          {controls}
        </Box>
      )
    }

    // Terminal: the same tree in cells.
    const width = Math.max(36, (e.props.bodyColumns || 60) - 2)
    const rows = tree(agents)
    const glyph = (a: Agent) => (isLive(a.status) ? (a.busy ? '●' : '◉') : isFailed(a.status) ? '×' : '✓')
    const tone = (a: Agent) => (isLive(a.status) ? BLUE : isFailed(a.status) ? RED : GOLD)
    const t0 = s.first ?? now
    const span = Math.max(1000, now - t0)
    const laneW = Math.max(10, Math.min(40, width - 18))
    const lane = (a: Agent) => {
      const x1 = Math.floor(((a.startedAt - t0) / span) * laneW)
      const x2 = Math.max(x1 + 1, Math.ceil((((a.endedAt ?? now) - t0) / span) * laneW))
      return ' '.repeat(x1) + '━'.repeat(Math.min(laneW, x2) - x1) + ' '.repeat(Math.max(0, laneW - Math.min(laneW, x2)))
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box justifyContent="space-between">
          <Text>
            <Text bold color={GOLD}>SWARM</Text>
            <Text dimColor>{`  ${agents.length} agents · ${s.tools + lead.tools} tool calls · peak ${s.peak} parallel`}</Text>
          </Text>
          {s.live ? <Text backgroundColor={BLUE} color={INK} bold>{` ${s.live} LIVE `}</Text> : <Text dimColor>{agents.length ? 'STOOD DOWN' : 'IDLE'}</Text>}
        </Box>

        <Box flexDirection="column">
          <Text dimColor bold>ORCHESTRATION</Text>
          <Text>
            <Text color={GOLD_HI}>◆ </Text>
            <Text bold>Lead</Text>
            <Text color={lead.busy ? BLUE : undefined} dimColor={!lead.busy}>{`  ${(lead.doing ?? 'waiting for you').slice(0, width - 12)}`}</Text>
          </Text>
          {rows.length === 0 && <Text dimColor>  No agents yet. Spawn subagents or a team and they appear here live.</Text>}
          {rows.slice(0, 20).map(r => {
            const a = r.agent
            const prefix = r.trail.map(t => (t ? '│ ' : '  ')).join('') + (r.last ? '└─' : '├─')
            const nm = a.name || a.label
            const right = isLive(a.status) ? elapsed(now - a.startedAt) : statusWord(a.status)
            const doing = a.doing ?? (isLive(a.status) ? 'thinking' : '')
            const room = Math.max(8, width - prefix.length - nm.length - right.length - 8)
            return (
              <Box key={a.id} justifyContent="space-between">
                <Text>
                  <Text dimColor>{prefix}</Text>
                  <Text color={tone(a)}>{` ${glyph(a)} `}</Text>
                  <Text bold>{nm.slice(0, 24)}</Text>
                  <Text dimColor>{` ${a.type === 'general-purpose' ? 'general' : a.type}`}</Text>
                  <Text color={isLive(a.status) && a.busy ? BLUE : undefined} dimColor={!(isLive(a.status) && a.busy)}>{`  ${doing.slice(0, room)}`}</Text>
                </Text>
                <Text color={tone(a)}>{`${a.tools}× ${right}`}</Text>
              </Box>
            )
          })}
        </Box>

        {rows.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor bold>TIMELINE</Text>
            {rows.slice(0, 12).map(r => (
              <Text key={r.agent.id}>
                <Text dimColor>{(r.agent.name || r.agent.label).slice(0, 12).padEnd(13)}</Text>
                <Text color={tone(r.agent)}>{lane(r.agent)}</Text>
              </Text>
            ))}
          </Box>
        )}

        {msgs.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor bold>{`COMMS  ${msgs.length}`}</Text>
            {msgs
              .slice(-4)
              .reverse()
              .map((m, i) => (
                <Text key={`m${i}`}>
                  <Text color={GOLD_HI} bold>{`${nameOf(agents, m.from)} → ${nameOf(agents, m.to)}`}</Text>
                  <Text dimColor>{`  ${m.text.replace(/\s+/g, ' ').slice(0, Math.max(10, width - 30))}  ${ago(now - m.at)}`}</Text>
                </Text>
              ))}
          </Box>
        )}

        {beats.length > 0 && (
          <Box flexDirection="column">
            <Text dimColor bold>ACTIVITY</Text>
            {beats
              .slice(-6)
              .reverse()
              .map((b, i) => (
                <Text key={`b${i}`}>
                  <Text color={b.kind === 'fail' || b.kind === 'deny' ? RED : b.kind === 'spawn' ? BLUE : b.kind === 'msg' ? GOLD_HI : GOLD}>{'▍'}</Text>
                  <Text bold>{` ${b.who.slice(0, 18)}`}</Text>
                  <Text dimColor>{` ${b.text.slice(0, Math.max(10, width - b.who.length - 10))}  ${ago(now - b.at)}`}</Text>
                </Text>
              ))}
          </Box>
        )}
        {controls}
      </Box>
    )
  })
}
