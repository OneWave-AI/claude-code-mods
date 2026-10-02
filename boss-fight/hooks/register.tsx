import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fight, RunResult } from '../types'
import { ARENA_ROWS, arena } from './arena'
import { NO_FIGHT, parseRun, phaseAt, runnerOf, step } from './fight'

const PANE = 'boss-fight'
const FRAME_MS = 60

const fightAtom = atom({ plugin: 'boss-fight', key: 'fight' } as const, NO_FIGHT as Fight)
const killsAtom = atom({ plugin: 'boss-fight', key: 'kills' } as const, 0)

const GOLD = '#c2a87e'
const BLUE = '#61A5FA'
const RED = '#e5484d'
const PAPER = '#E8E2D6'
const INK = '#0B1121'

// The module's copy of the fight, so the animation timer reads it without a dispatch.
let fight: Fight = NO_FIGHT
let anim: { cancel: () => void } | null = null
let animSize = ''

const startAnim = ($: EngineInterface, columns: number) => {
  const size = `${columns}`
  if (anim && animSize === size) return
  anim?.cancel()
  animSize = size
  const timer = $.clock.every(FRAME_MS, () => {
    void $.clock.now().then(now =>
      $.ui.blit({ requestId: PANE, key: 'arena', cells: arena(columns, ARENA_ROWS, now, fight) }).then(r => {
        if (r.deny && anim === timer) {
          timer.cancel()
          anim = null
        }
      }),
    )
  })
  anim = timer
}

const setFight = async ($: EngineInterface, next: Fight) => {
  fight = next
  await update($, fightAtom, () => next)
}

const statusFor = (f: Fight) =>
  f.phase === 'none' || f.phase === 'ko' ? undefined : `Boss: ${f.boss} ${f.hp}/${f.maxHp} HP`

const play = async ($: EngineInterface, run: RunResult, isDemo: boolean) => {
  const now = await $.clock.now()
  const move = step(fight, run, now, Math.floor(now / 7) + run.failed * 31)
  const next = { ...move.fight, isDemo: move.event === 'spawn' ? isDemo : move.fight.isDemo }
  await setFight($, next)
  $.ui.status(statusFor(next))

  if (move.event === 'spawn') {
    $.ui.toast(`A boss appears: ${next.boss} (${next.hp} HP). /boss to fight.`, { timeoutMs: 6000 })
    const panes = await $.ui.panes()
    if (!panes.some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: 'Boss Fight' })
  }
  if (move.event === 'hit') $.ui.toast(`Hit! ${move.fight.delta} damage. ${next.boss} has ${next.hp} HP left.`)
  if (move.event === 'heal') $.ui.toast(`${next.boss} healed ${-move.fight.delta} HP. New failures.`)
  if (move.event === 'ko') {
    let kills = await read($, killsAtom)
    if (!next.isDemo) {
      kills = Number((await $.store.get('kills')) ?? 0) + 1
      await $.store.set('kills', kills)
      await update($, killsAtom, () => kills)
    }
    $.ui.toast(`${next.boss} defeated in ${next.runs} runs. Loot: ${next.loot}`, { timeoutMs: 8000 })
  }
}

const DEMO: readonly { failed: number; ms: number }[] = [
  { failed: 7, ms: 3200 },
  { failed: 5, ms: 2600 },
  { failed: 6, ms: 2400 },
  { failed: 3, ms: 2400 },
  { failed: 1, ms: 2400 },
  { failed: 0, ms: 4000 },
]

let demoRun = 0

const runDemo = async ($: EngineInterface) => {
  const run = ++demoRun
  await setFight($, NO_FIGHT)
  let at = 400
  for (const s of DEMO) {
    $.clock.after(at, () => {
      if (run !== demoRun) return
      void play($, { runner: 'vitest', failed: s.failed, passed: 40 - s.failed }, true)
    })
    at += s.ms
  }
  return Math.round(at / 1000)
}

const hpBar = (hp: number, max: number, size: number) => {
  const filled = max === 0 ? 0 : Math.max(0, Math.min(size, Math.round((hp / max) * size)))
  return { full: '█'.repeat(filled), empty: '░'.repeat(size - filled) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'boss',
      description: 'Failing tests become a boss: /boss [demo|reset]',
    })
    const kills = Number((await $.store.get('kills')) ?? 0)
    await update($, killsAtom, () => kills)
    fight = await read($, fightAtom)

    return next(e)
  })

  on('command.run', { command: 'boss' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'reset') {
      demoRun++
      await setFight($, NO_FIGHT)
      $.ui.status(undefined)
      return { text: 'Arena cleared.' }
    }
    await $.ui.open({ id: PANE, title: 'Boss Fight' })
    if (arg === 'demo') {
      const seconds = await runDemo($)
      return { text: `Demo fight running (${seconds}s). Hit record.` }
    }
    return { text: 'Boss pane opened.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const runner = runnerOf(e.command)
    if (!runner || ran.deny !== undefined) return ran
    const result = parseRun(runner, ran.text ?? '')
    if (result) await play($, result, false)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const now = await $.clock.now()
    const f = await read($, fightAtom)
    const kills = await read($, killsAtom)
    const cols = Math.max(30, e.props.bodyColumns || e.viewport?.columns || 70)
    const width = cols - 2
    fight = f

    if (Raster && e.surface === 'terminal') startAnim($, width)

    const phase = phaseAt(f, now)
    const isLive = f.phase !== 'none' && f.phase !== 'ko'
    const meter = Math.max(10, Math.min(40, width - 24))
    const bar = hpBar(f.hp, f.maxHp, meter)

    return (
      <Box flexDirection="column" paddingX={1}>
        {Raster && e.surface === 'terminal' && (
          <Raster key="arena" columns={width} rows={ARENA_ROWS} cells={arena(width, ARENA_ROWS, now, f)} />
        )}
        {f.phase === 'none' ? (
          <Box marginTop={1}>
            <Text dimColor>No boss. Run a test suite with failures to summon one.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            <Box justifyContent="space-between">
              <Text bold color={f.phase === 'ko' ? GOLD : RED}>{f.boss.toUpperCase()}</Text>
              <Text dimColor>{f.runner} · run {f.runs}</Text>
            </Box>
            <Text>
              <Text color={phase === 'hit' ? PAPER : RED}>{bar.full}</Text>
              <Text dimColor>{bar.empty}</Text>
              <Text bold color={PAPER}>  {f.hp}/{f.maxHp} HP</Text>
            </Text>
            {f.phase === 'ko' && (
              <Box flexDirection="column" marginTop={1}>
                <Text backgroundColor={GOLD} color={INK} bold>{` VICTORY · ${f.runs} runs `}</Text>
                <Text>
                  <Text dimColor>loot drop  </Text>
                  <Text bold color={GOLD}>{f.loot ?? ''}</Text>
                </Text>
              </Box>
            )}
            {isLive && phase === 'heal' && <Text color={RED}>New failures. The boss grows stronger.</Text>}
            {isLive && phase === 'hit' && <Text color={GOLD}>{f.delta} test{f.delta === 1 ? '' : 's'} fixed. Critical hit.</Text>}
          </Box>
        )}
        <Box justifyContent="space-between" marginTop={1}>
          <Box gap={3}>
            <Button key="demo" label="demo fight" hotkey="d" plain onPress={() => void runDemo($)} />
            <Button
              key="reset"
              label="reset"
              hotkey="r"
              plain
              onPress={() => {
                demoRun++
                void setFight($, NO_FIGHT)
                $.ui.status(undefined)
              }}
            />
          </Box>
          <Text>
            <Text dimColor>bosses slain </Text>
            <Text bold color={BLUE}>{kills}</Text>
          </Text>
        </Box>
      </Box>
    )
  })
}
