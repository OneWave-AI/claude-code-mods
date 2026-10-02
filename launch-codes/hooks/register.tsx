import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Alert, Phase } from '../types'
import { classify, isCode, makeCode } from './classify'
import { hazardCells, launchWav, sirenWav } from './fx'

const PANE = 'launch-codes'
const CODE_TTL_MS = 30_000
const HAZARD_ROWS = 2

const alert = atom({ plugin: 'launch-codes', key: 'alert' } as const, null as Alert | null)

const RED = '#e5484d'
const GOLD = '#c2a87e'
const PAPER = '#E8E2D6'
const INK = '#0a0606'

const SIREN = sirenWav()
const LAUNCH = launchWav()

let hazardTimer: { cancel: () => void } | null = null
let hazardSize = 0

const startHazard = ($: EngineInterface, columns: number) => {
  if (hazardTimer && hazardSize === columns) return
  hazardTimer?.cancel()
  hazardSize = columns
  const timer = $.clock.every(70, () => {
    void Promise.all([$.clock.now(), read($, alert)]).then(([now, a]) =>
      Promise.all(
        ['top', 'bottom'].map(key =>
          $.ui.blit({
            requestId: PANE,
            key,
            cells: hazardCells(columns, HAZARD_ROWS, now / 1000, a?.phase === 'armed' || a?.phase === 'launched'),
          }),
        ),
      ).then(results => {
        if (results.some(r => r.deny) && hazardTimer === timer) {
          timer.cancel()
          hazardTimer = null
        }
      }),
    )
  })
  hazardTimer = timer
}

const random = (n: number) => {
  const box = new Uint32Array(1)
  crypto.getRandomValues(box)
  return box[0]! % n
}

const setPhase = ($: EngineInterface, phase: Phase) =>
  update($, alert, a => (a ? { ...a, phase } : a))

const short = (command: string) => (command.length > 70 ? `${command.slice(0, 67)}...` : command)

/**
 * Runs the whole ceremony for one command and says whether it may fire.
 * Every wait is a `$` call (the ask dialog), so none of it spends the hook's budget.
 */
const ceremony = async ($: EngineInterface, command: string, reason: string, isDemo: boolean) => {
  const now = await $.clock.now()
  const code = makeCode(random)
  await update($, alert, () => ({
    command,
    reason,
    code,
    startedAt: now,
    expiresAt: now + CODE_TTL_MS,
    phase: 'code' as Phase,
    isDemo,
  }))
  await $.ui.open({ id: PANE, title: 'RED ALERT', rows: 16 })
  const siren = new AbortController()
  void $.audio.play({ base64: SIREN, mime: 'audio/wav' }, { shouldLoop: true, signal: siren.signal, gain: 0.6 }).catch(() => undefined)
  // Repaint once a second for the countdown.
  const tick = $.clock.every(1000, () => $.ui.invalidate('ui.render'))

  const finish = async (phase: Phase, verdict: { isLaunch: boolean; why: string }) => {
    siren.abort()
    tick.cancel()
    await setPhase($, phase)
    if (phase === 'launched') void $.audio.play({ base64: LAUNCH, mime: 'audio/wav' }).catch(() => undefined)
    $.clock.after(phase === 'launched' ? 1800 : 2500, () => {
      void $.ui.close({ id: PANE }).then(() => update($, alert, () => null))
    })
    return verdict
  }

  try {
    const typed = await $.ui.ask(
      `Launch codes required: ${short(command)}. Type the 4-character code from the RED ALERT pane under "Other" to arm it.`,
      { header: 'LAUNCH CODE', options: ['ABORT', 'ABORT and find a safer way'] },
    )
    if (!isCode(typed, code)) {
      const why = typed.startsWith('ABORT') ? 'the user pressed ABORT' : 'the launch code was wrong'
      return finish('aborted', { isLaunch: false, why })
    }
    if ((await $.clock.now()) > now + CODE_TTL_MS) {
      return finish('aborted', { isLaunch: false, why: 'the launch code expired before it was entered' })
    }
    siren.abort()
    await setPhase($, 'armed')
    const fire = await $.ui.ask(`ARMED. Fire ${short(command)}?`, {
      header: 'ARMED',
      options: ['LAUNCH', 'ABORT'],
    })
    if (fire !== 'LAUNCH') return finish('aborted', { isLaunch: false, why: 'the user pressed ABORT after arming' })
    return finish('launched', { isLaunch: true, why: 'launched' })
  } catch {
    return finish('aborted', { isLaunch: false, why: 'no one was there to enter the launch code' })
  }
}

const deny = (command: string, reason: string, why: string) => ({
  deny:
    `launch-codes: blocked \`${short(command)}\` (${reason}) because ${why}. ` +
    'Do not retry it or work around the check; tell the user what you wanted to do and ask, or find a safer way.',
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'launch-codes',
      description: 'Launch codes for dangerous commands: /launch-codes [demo|test <command>]',
    })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const danger = classify(e.command)
    if (!danger) return next(e)
    const verdict = await ceremony($, e.command, danger.reason, false)
    return verdict.isLaunch ? next(e) : deny(e.command, danger.reason, verdict.why)
  })
    // A hook that fails must not let the command through.
    .catch(($, e) => {
      const danger = classify(e.command)
      return danger ? deny(e.command, danger.reason, 'the launch check failed') : { deny: 'launch-codes: the launch check failed; ask the user before retrying.' }
    })

  on('command.run', { command: 'launch-codes' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg.startsWith('test ')) {
      const danger = classify(arg.slice(5))
      return { text: danger ? `Needs launch codes: ${danger.reason}.` : 'Safe: runs without launch codes.' }
    }
    const command = 'rm -rf ~/Projects/prod-backup && git push --force origin main'
    const verdict = await ceremony($, command, 'rm -rf on ~/Projects/prod-backup', true)
    return { text: verdict.isLaunch ? 'Demo: LAUNCHED. (Nothing ran, it was a demo.)' : `Demo: aborted, ${verdict.why}. Nothing ran.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const a = await read($, alert)
    const now = await $.clock.now()
    const width = Math.max(30, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    if (!a) {
      return (
        <Box paddingX={1}>
          <Text dimColor>All quiet. Dangerous commands will raise the alarm here.</Text>
        </Box>
      )
    }

    const isTerminal = e.surface === 'terminal' && Raster !== null
    if (isTerminal) startHazard($, width)
    const left = Math.max(0, Math.ceil((a.expiresAt - now) / 1000))
    const isFlash = Math.floor(now / 400) % 2 === 0
    const banner: Record<Phase, { text: string; color: string }> = {
      code: { text: 'LAUNCH CODES REQUIRED', color: RED },
      armed: { text: 'ARMED  -  CONFIRM LAUNCH', color: GOLD },
      launched: { text: 'LAUNCHED', color: GOLD },
      aborted: { text: 'ABORTED  -  NOTHING RAN', color: PAPER },
    }
    const head = banner[a.phase]
    const hazard = (key: string) =>
      isTerminal && Raster ? (
        <Raster key={key} columns={width} rows={HAZARD_ROWS} cells={hazardCells(width, HAZARD_ROWS, now / 1000, a.phase !== 'code' && a.phase !== 'aborted')} />
      ) : (
        <Text color={RED}>{'/'.repeat(width)}</Text>
      )

    return (
      <Box flexDirection="column" paddingX={1}>
        {hazard('top')}
        <Box justifyContent="space-between" marginTop={1}>
          <Text bold backgroundColor={head.color} color={INK}>{` ${head.text} `}</Text>
          <Text dimColor>{a.isDemo ? 'DEMO  ' : ''}{a.phase === 'code' ? `code expires in ${left}s` : ''}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>COMMAND</Text>
          <Text bold color={PAPER} wrap="wrap">{a.command}</Text>
          <Text color={RED}>{a.reason}</Text>
        </Box>
        {a.phase === 'code' && (
          <Box marginTop={1} gap={2}>
            <Text dimColor>LAUNCH CODE</Text>
            <Text bold color={isFlash ? GOLD : PAPER}>{a.code.split('').join('  ')}</Text>
          </Box>
        )}
        {a.phase === 'code' && <Text dimColor>Type it under "Other" in the dialog below, then confirm LAUNCH. ABORT blocks it.</Text>}
        {a.phase === 'armed' && <Text color={GOLD} bold>Code accepted. Choose LAUNCH to fire or ABORT to stand down.</Text>}
        <Box marginTop={1}>{hazard('bottom')}</Box>
      </Box>
    )
  })
}
