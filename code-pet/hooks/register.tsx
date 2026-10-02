import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DemoView, Mood, Pet, Stage } from '../types'
import {
  ageText,
  apply,
  decay,
  isDanger,
  isFailedRun,
  levelOf,
  MOOD_WORD,
  moodAt,
  newPet,
  revive,
  stageOf,
  xpForLevel,
} from './pet'
import type { Live, PetEvent } from './pet'
import { petFrame, rowsFor } from './scene'

const PANE = 'code-pet'
const STORE_KEY = 'pet'
const FRAME_MS = 90

const petAtom = atom({ plugin: 'code-pet', key: 'pet' } as const, null as Pet | null)
const moodAtom = atom({ plugin: 'code-pet', key: 'mood' } as const, 'idle' as Mood)
const demoAtom = atom({ plugin: 'code-pet', key: 'demo' } as const, null as DemoView | null)

const GOLD = '#c2a87e'
const BLUE = '#61A5FA'
const RED = '#e5484d'
const PAPER = '#E8E2D6'
const INK = '#0B1121'

// The module's live copy; $.store holds the pet across sessions, $.state what the pane draws.
let pet: Pet | null = null
let live: Live = { mood: 'idle', until: 0, lastActivityAt: 0 }
let demo: DemoView | null = null
let shownMood: Mood = 'idle'

let anim: { cancel: () => void } | null = null
let animSize = ''

const viewNow = (now: number) => {
  if (demo) return { stage: demo.stage, mood: demo.mood, caption: demo.caption }
  if (!pet) return { stage: 'egg' as Stage, mood: 'idle' as Mood }
  return { stage: stageOf(levelOf(pet.xp)), mood: moodAt(pet, live, now) }
}

const statusText = (now: number) => {
  if (!pet) return undefined
  const mood = demo ? demo.mood : moodAt(pet, live, now)
  return `${pet.name} Lv${levelOf(pet.xp)} · ${MOOD_WORD[mood]}`
}

/** Pushes the mood to the pane's text and the status line when it changed. */
const publishMood = async ($: EngineInterface, now: number) => {
  const mood = viewNow(now).mood
  if (mood === shownMood) return
  shownMood = mood
  await update($, moodAtom, () => mood)
  $.ui.status(statusText(now))
}

const save = async ($: EngineInterface) => {
  if (!pet) return
  const snapshot = pet
  await $.store.set(STORE_KEY, snapshot)
  await update($, petAtom, () => snapshot)
}

const happen = async ($: EngineInterface, ev: PetEvent) => {
  if (!pet) return
  const now = await $.clock.now()
  const out = apply(decay(pet, now), live, ev, now)
  pet = out.pet
  live = out.live
  if (out.leveledTo !== undefined) {
    const stage = stageOf(out.leveledTo)
    const evolved = stageOf(out.leveledTo - 1) !== stage
    $.ui.toast(
      evolved ? `${pet.name} evolved into a ${stage}! (Lv ${out.leveledTo})` : `${pet.name} reached Lv ${out.leveledTo}`,
      { timeoutMs: 6000 },
    )
  }
  await save($)
  await publishMood($, now)
}

const startAnim = ($: EngineInterface, columns: number, rows: number) => {
  const size = `${columns}x${rows}`
  if (anim && animSize === size) return
  anim?.cancel()
  animSize = size
  const timer = $.clock.every(FRAME_MS, () => {
    void $.clock.now().then(now => {
      void publishMood($, now)
      return $.ui
        .blit({ requestId: PANE, key: 'scene', cells: petFrame(columns, rows, now / 1000, viewNow(now)) })
        .then(r => {
          if (r.deny && anim === timer) {
            timer.cancel()
            anim = null
          }
        })
    })
  })
  anim = timer
}

const DEMO: readonly { mood: Mood; stage: Stage; caption: string; ms: number }[] = [
  { mood: 'idle', stage: 'blob', caption: 'just vibing', ms: 2600 },
  { mood: 'eating', stage: 'blob', caption: 'tool call = snack', ms: 2600 },
  { mood: 'happy', stage: 'blob', caption: 'turn shipped', ms: 2600 },
  { mood: 'sick', stage: 'blob', caption: 'tests failed', ms: 2800 },
  { mood: 'panic', stage: 'blob', caption: 'rm -rf detected', ms: 2800 },
  { mood: 'sad', stage: 'blob', caption: 'not fed in 2 days', ms: 2600 },
  { mood: 'sleep', stage: 'blob', caption: 'idle 3 min', ms: 2800 },
  { mood: 'levelup', stage: 'egg', caption: 'Lv 1 egg', ms: 1600 },
  { mood: 'levelup', stage: 'blob', caption: 'Lv 2 blob', ms: 1600 },
  { mood: 'levelup', stage: 'critter', caption: 'Lv 5 critter', ms: 1600 },
  { mood: 'levelup', stage: 'crowned', caption: 'Lv 10 crowned', ms: 2200 },
  { mood: 'happy', stage: 'crowned', caption: 'ship it', ms: 2600 },
]

let demoRun = 0

const runDemo = async ($: EngineInterface) => {
  const run = ++demoRun
  let at = 0
  for (const step of DEMO) {
    $.clock.after(at, () => {
      if (run !== demoRun) return
      demo = { mood: step.mood, stage: step.stage, caption: step.caption }
      void update($, demoAtom, () => demo)
      void $.clock.now().then(now => publishMood($, now))
    })
    at += step.ms
  }
  $.clock.after(at, () => {
    if (run !== demoRun) return
    demo = null
    void update($, demoAtom, () => null)
    void $.clock.now().then(now => publishMood($, now))
  })
  return Math.round(at / 1000)
}

const bar = (fraction: number, size: number) => {
  const filled = Math.max(0, Math.min(size, Math.round(fraction * size)))
  return '█'.repeat(filled) + '░'.repeat(size - filled)
}

const hatch = async ($: EngineInterface) => {
  const now = await $.clock.now()
  const stored = revive(await $.store.get(STORE_KEY))
  pet = decay(stored ?? newPet(now), now)
  live = { mood: 'idle', until: 0, lastActivityAt: now }
  await save($)
  if (!stored) $.ui.toast(`${pet.name} hatched. Feed it by working. /pet to visit.`, { timeoutMs: 6000 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pet',
      description: 'Your Claude pet: /pet [demo|rename <name>|snack]',
    })
    await hatch($)
    $.ui.status(statusText(await $.clock.now()))
    // Time passes even with the pane shut.
    $.clock.every(60 * 1000, () => {
      void $.clock.now().then(async now => {
        if (!pet) return
        pet = decay(pet, now)
        await save($)
        await publishMood($, now)
      })
    })

    return next(e)
  })

  on('command.run', { command: 'pet' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = verb.toLowerCase()
    if (!pet) await hatch($)
    if (arg === 'rename') {
      const name = rest.join(' ').trim().slice(0, 16)
      if (!name || !pet) return { text: 'Usage: /pet rename <name>' }
      pet = { ...pet, name }
      await save($)
      $.ui.status(statusText(await $.clock.now()))
      return { text: `Your pet is now called ${name}.` }
    }
    if (arg === 'snack') {
      await happen($, { kind: 'snack' })
      return { text: `${pet?.name ?? 'Your pet'} ate a snack.` }
    }
    await $.ui.open({ id: PANE, title: 'Code Pet' })
    if (arg === 'demo') {
      const seconds = await runDemo($)
      return { text: `Demo running (${seconds}s). Hit record.` }
    }
    return { text: 'Pet pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await happen($, { kind: 'activity' })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'Bash' && isDanger(e.command)) await happen($, { kind: 'danger' })
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const failed = e.tool === 'Bash' ? isFailedRun(ran.isError, ran.text) : ran.isError === true
    await happen($, failed ? { kind: 'failed' } : { kind: 'fed' })
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await happen($, { kind: 'turn' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const now = await $.clock.now()
    const stats = (await read($, petAtom)) ?? pet
    const mood = await read($, moodAtom)
    const shown = await read($, demoAtom)
    const cols = Math.max(24, e.props.bodyColumns || e.viewport?.columns || 60)
    const width = cols - 2
    const rows = rowsFor(width)

    if (Raster && e.surface === 'terminal') startAnim($, width, rows)

    if (!stats) {
      return (
        <Box paddingX={1}>
          <Text dimColor>Hatching...</Text>
        </Box>
      )
    }

    const level = levelOf(stats.xp)
    const stage = shown?.stage ?? stageOf(level)
    const from = xpForLevel(level)
    const to = xpForLevel(level + 1)
    const meter = Math.max(6, Math.min(14, Math.floor((width - 30) / 3)))
    const moodColor = mood === 'panic' || mood === 'sick' ? RED : mood === 'sleep' || mood === 'sad' ? BLUE : GOLD

    return (
      <Box flexDirection="column" paddingX={1}>
        {Raster && e.surface === 'terminal' && (
          <Raster key="scene" columns={width} rows={rows} cells={petFrame(width, rows, now / 1000, viewNow(now))} />
        )}
        <Box justifyContent="space-between" marginTop={1}>
          <Text>
            <Text bold color={PAPER}>{stats.name.toUpperCase()}</Text>
            <Text dimColor>  Lv {level} {stage} · {ageText(stats.bornAt, now)} · {stats.meals} meals</Text>
          </Text>
          <Text backgroundColor={moodColor} color={INK} bold>{` ${MOOD_WORD[mood].toUpperCase()} `}</Text>
        </Box>
        <Box gap={2}>
          <Text>
            <Text dimColor>HP </Text>
            <Text color={stats.hp < 30 ? RED : GOLD}>{bar(stats.hp / 100, meter)}</Text>
          </Text>
          <Text>
            <Text dimColor>FOOD </Text>
            <Text color={stats.hunger < 25 ? RED : BLUE}>{bar(stats.hunger / 100, meter)}</Text>
          </Text>
          <Text>
            <Text dimColor>XP </Text>
            <Text color={PAPER}>{bar((stats.xp - from) / Math.max(1, to - from), meter)}</Text>
          </Text>
        </Box>
        {shown && (
          <Text dimColor>demo · {shown.caption}</Text>
        )}
        <Box gap={3} marginTop={1}>
          <Button key="snack" label="snack" hotkey="f" plain onPress={() => void happen($, { kind: 'snack' })} />
          <Button key="demo" label="demo" hotkey="d" plain onPress={() => void runDemo($)} />
        </Box>
      </Box>
    )
  })
}
