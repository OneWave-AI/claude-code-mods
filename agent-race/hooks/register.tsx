import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lane, RaceView } from '../types'
import {
  clock,
  demoTick,
  isTestCommand,
  mergeLanes,
  newLane,
  ordinal,
  parseLane,
  parseTests,
  progressOf,
  rank,
  safeName,
  track,
} from './race'

const PANE = 'agent-race'
const POLL_MS = 1000
const DEMO_MS = 260

const view = atom({ plugin: 'agent-race', key: 'view' } as const, {
  race: null,
  isDemo: false,
  lanes: [],
  winner: null,
} as RaceView)

const BLUE = '#61A5FA'
const GOLD = '#c2a87e'
const PAPER = '#E8E2D6'
const INK = '#0B1121'
const LANE_COLORS = [BLUE, GOLD, PAPER, '#8FB8E8']

let me: Lane | null = null
let dir = ''
let lastGreen = false
let timer: { cancel: () => void } | null = null
let frame = 0

const stop = () => {
  timer?.cancel()
  timer = null
}

const raceDir = async ($: EngineInterface, race: string) => {
  const home = (await $.env.get('HOME')) ?? '~'
  return `${home}/.claude/agent-race/${race}`
}

const writeMine = async ($: EngineInterface) => {
  if (!me || !dir) return
  me = { ...me, updatedAt: await $.clock.now() }
  await $.fs.write(`${dir}/${me.id}.json`, JSON.stringify(me))
}

/** Every lane file of the race, this session's own taken from memory. */
const readLanes = async ($: EngineInterface, race: string) => {
  const entries = await $.fs.list(dir).catch(() => [])
  const lanes: Lane[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => '')
    const lane = parseLane(text, race)
    if (lane && lane.id !== me?.id) lanes.push(lane)
  }
  if (me) lanes.push(me)
  return mergeLanes(lanes, await $.clock.now())
}

const crown = async ($: EngineInterface, lanes: Lane[]) => {
  const first = rank(lanes)[0]
  const current = await read($, view)
  if (!first || first.finishedAt === null || current.winner) return
  await update($, view, v => ({ ...v, winner: first.name }))
  $.ui.toast(`FINISH. ${first.name} wins in ${clock(first.finishedAt - first.startedAt)}`, { timeoutMs: 12000 })
  void $.audio.speak(`${first.name} wins the race`).catch(() => undefined)
}

const poll = async ($: EngineInterface) => {
  const current = await read($, view)
  if (!current.race || current.isDemo) return
  frame += 1
  const lanes = await readLanes($, current.race)
  await update($, view, v => ({ ...v, lanes }))
  await crown($, lanes)
  const place = rank(lanes).findIndex(l => l.id === me?.id) + 1
  $.ui.status(me && place ? `Race ${current.race}: ${ordinal(place)} of ${lanes.length}` : undefined)
}

const start = async ($: EngineInterface, raw: string, name: string) => {
  stop()
  const race = safeName(raw)
  dir = await raceDir($, race)
  const now = await $.clock.now()
  me = newLane(await $.session.id(), name, race, now)
  lastGreen = false
  await writeMine($)
  await update($, view, () => ({ race, isDemo: false, lanes: [me!], winner: null }))
  timer = $.clock.every(POLL_MS, () => void poll($).catch(() => undefined))
  await $.ui.open({ id: PANE, title: `Race: ${race}` })
  return race
}

const demo = async ($: EngineInterface) => {
  stop()
  me = null
  const now = await $.clock.now()
  const lanes = [newLane('demo-a', 'Opus', 'demo', now), newLane('demo-b', 'Sonnet', 'demo', now)]
  await update($, view, () => ({ race: 'demo', isDemo: true, lanes, winner: null }))
  await $.ui.open({ id: PANE, title: 'Race: demo' })
  timer = $.clock.every(DEMO_MS, () => {
    frame += 1
    void (async () => {
      const at = await $.clock.now()
      const v = await read($, view)
      const next = v.lanes.map((lane, i) => demoTick(lane, i, at, Math.random()))
      await update($, view, x => ({ ...x, lanes: next }))
      await crown($, next)
      if (next.every(l => l.finishedAt !== null)) stop()
    })().catch(() => undefined)
  })
}

const bump = async ($: EngineInterface, change: (lane: Lane) => Lane) => {
  if (!me || me.finishedAt !== null) return
  me = change(me)
  await writeMine($)
}

const finish = async ($: EngineInterface) => {
  if (!me || me.finishedAt !== null) return false
  const at = await $.clock.now()
  await bump($, lane => ({ ...lane, finishedAt: at }))
  await poll($)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'race',
      description: 'Race sessions on a task: /race start <race> [name] | done | demo | leave',
    })
    return next(e)
  })

  on('command.run', { command: 'race' }, async ($, e) => {
    const [verb = '', race = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'start' || verb === 'join') {
      if (!race) return { text: 'Usage: /race start <race> [lane name]' }
      const id = (await $.session.id()).slice(0, 4)
      const name = rest.join(' ') || `Lane ${id}`
      const joined = await start($, race, name)
      return { text: `Joined race "${joined}" as ${name}. Run /race start ${joined} in the other terminal.` }
    }
    if (verb === 'done') return { text: (await finish($)) ? 'Crossed the line.' : 'Not in a race, or already finished.' }
    if (verb === 'demo') {
      await demo($)
      return { text: 'Demo race started.' }
    }
    if (verb === 'leave') {
      stop()
      me = null
      await update($, view, () => ({ race: null, isDemo: false, lanes: [], winner: null }))
      $.ui.status(undefined)
      await $.ui.close({ id: PANE })
      return { text: 'Left the race.' }
    }
    await $.ui.open({ id: PANE, title: 'Race', focus: true })
    return { text: 'Race pane opened. /race start <race> to join one, /race demo to watch one.' }
  })

  on('tool.call', async ($, e, next) => {
    if (!me || me.finishedAt !== null) return next(e)
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const tool = String(e.tool)
    const isEdit = tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit'
    let tests: { passed: number; failed: number } | null = null
    if (tool === 'Bash') {
      const command = String((e as { command?: unknown }).command ?? '')
      const out = ran.result as { stdout?: string; stderr?: string } | undefined
      if (isTestCommand(command)) tests = parseTests(`${out?.stdout ?? ''}\n${out?.stderr ?? ''}`)
    }
    if (tests) lastGreen = tests.failed === 0 && tests.passed > 0
    await bump($, lane => ({
      ...lane,
      tools: lane.tools + 1,
      edits: lane.edits + (isEdit ? 1 : 0),
      testsPassed: tests ? tests.passed : lane.testsPassed,
      testsFailed: lane.testsFailed + (tests?.failed ?? 0),
    }))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (me && me.finishedAt === null) {
      const usage = await $.session.usage()
      await bump($, lane => ({ ...lane, costUsd: usage.cost?.usd ?? lane.costUsd }))
      if (lastGreen) await finish($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, view)
    const now = await $.clock.now()
    const cols = Math.max(40, e.props.bodyColumns || e.viewport?.columns || 80)
    const width = cols - 4

    if (!v.race) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color={BLUE}>AGENT RACE</Text>
          <Text dimColor>/race start {'<race>'} [name] in two terminals to race them.</Text>
          <Text dimColor>/race demo to watch a simulated race.</Text>
        </Box>
      )
    }

    const order = rank(v.lanes)
    const laneRow = (lane: Lane, i: number) => {
      const color = LANE_COLORS[v.lanes.indexOf(lane) % LANE_COLORS.length]!
      const t = track(progressOf(lane), width, frame + i)
      const isDone = lane.finishedAt !== null
      const elapsed = (lane.finishedAt ?? now) - lane.startedAt
      return (
        <Box key={lane.id} flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between">
            <Text>
              <Text backgroundColor={color} color={INK} bold>{` ${ordinal(i + 1)} `}</Text>
              <Text bold color={color}>{`  ${lane.name}`}</Text>
              {lane.id === me?.id && <Text dimColor>  (you)</Text>}
            </Text>
            <Text color={isDone ? color : undefined} dimColor={!isDone} bold={isDone}>
              {isDone ? `FINISHED ${clock(elapsed)}` : clock(elapsed)}
            </Text>
          </Box>
          <Text>
            <Text color={color}>{t.run}</Text>
            <Text color={color} bold>{t.runner}</Text>
            <Text dimColor>{t.rest}</Text>
            <Text color={PAPER}>{t.flag}</Text>
          </Text>
          <Text dimColor>
            {`${lane.tools} tools   ${lane.edits} edits   ${lane.testsPassed} tests passing${lane.testsFailed ? `   ${lane.testsFailed} failed` : ''}   $${lane.costUsd.toFixed(2)}`}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color={BLUE}>{`AGENT RACE  ${v.race.toUpperCase()}`}</Text>
          <Text dimColor>{`${v.lanes.length} lane${v.lanes.length === 1 ? '' : 's'}${v.isDemo ? ' · demo' : ''}`}</Text>
        </Box>
        {order.map(laneRow)}
        {v.lanes.length === 1 && !v.isDemo && (
          <Text dimColor>Waiting for a challenger: /race start {v.race} in another terminal.</Text>
        )}
        {v.winner && (
          <Box justifyContent="center" marginTop={1}>
            <Text backgroundColor={GOLD} color={INK} bold>{`  FINISH  ·  ${v.winner.toUpperCase()} WINS  `}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
