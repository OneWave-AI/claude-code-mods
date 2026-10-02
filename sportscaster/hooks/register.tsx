import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fx, Mic, Score, Ticker } from '../types'
import { gameClock, head, moodOf, revealed, wrap } from './art'
import { ANNOUNCER, Booth, DEMO, Slot, announcerPrompt, speakable, turnPlay } from './logic'
import type { Play } from './logic'
import { fxClip } from './wav'

const VOICE = 'Daniel'
const GOLD = '#c2a87e'
const INK = '#0B1121'
const PAPER = '#E8E2D6'
const RED = '#e5484d'
const PANE = 'sportscaster'
const FEED_KEEP = 40
const MOUTH_MS = 110

const ticker = atom({ plugin: 'sportscaster', key: 'ticker' } as const, null as Ticker | null)
const isLive = atom({ plugin: 'sportscaster', key: 'isLive' } as const, false)
const feed = atom({ plugin: 'sportscaster', key: 'feed' } as const, [] as Ticker[])
const mic = atom({ plugin: 'sportscaster', key: 'mic' } as const, { isTalking: false, startedAt: 0, frame: -1 } as Mic)
const score = atom({ plugin: 'sportscaster', key: 'score' } as const, { plays: 0, fouls: 0, startedAt: 0 } as Score)

let mouth: { cancel: () => void } | null = null

const openBooth = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'The Booth' })

/** Puts a call on the air: the ticker, the top of the play-by-play, and the scoreboard. */
const post = async ($: EngineInterface, line: string, at: number, fx: Fx) => {
  const now = await $.clock.now()
  await update($, score, s => ({ plays: s.plays + 1, fouls: s.fouls + (fx === 'boo' ? 1 : 0), startedAt: s.startedAt || now }))
  const s = await read($, score)
  const entry: Ticker = { line, at: now - s.startedAt, fx }
  await update($, ticker, () => ({ line, at, fx }))
  await update($, feed, list => [entry, ...list].slice(0, FEED_KEEP))
}

const resetGame = async ($: EngineInterface) => {
  await update($, feed, () => [])
  await update($, score, () => ({ plays: 0, fouls: 0, startedAt: 0 }))
}

const booth = new Booth()
const slot = new Slot()
const recent: string[] = []
let isOnAir = false
let isDemo = false
let voice: string | undefined = VOICE

const fieldsOf = (e: unknown) => e as Record<string, unknown>

const say = async ($: EngineInterface, line: string) => {
  // The mouth flaps for as long as the voice is reading the line.
  mouth?.cancel()
  await update($, mic, () => ({ isTalking: true, startedAt: 0, frame: 0 }))
  const startedAt = await $.clock.now()
  await update($, mic, m => ({ ...m, startedAt }))
  const timer = $.clock.every(MOUTH_MS, () => void update($, mic, m => ({ ...m, frame: m.frame + 1 })).catch(() => undefined))
  mouth = timer
  try {
    await speak($, line)
  } finally {
    timer.cancel()
    if (mouth === timer) {
      mouth = null
      await update($, mic, m => ({ ...m, isTalking: false, frame: -1 }))
    }
  }
}

const speak = async ($: EngineInterface, line: string) => {
  try {
    await $.audio.speak(line, voice ? { voice } : undefined)
  } catch {
    // The voice is not installed here: fall back to the system default once.
    if (!voice) return
    voice = undefined
    try {
      await $.audio.speak(line)
    } catch {
      // no voice at all: stay silent
    }
  }
}

const crowd = async ($: EngineInterface, fx: Fx) => {
  if (!fx) return
  try {
    await $.audio.play({ base64: fxClip(fx), mime: 'audio/wav' }, { gain: fx === 'cheer' ? 0.7 : 0.6 })
  } catch {
    // no audio device: the play-by-play still shows
  }
}

const call = async ($: EngineInterface, play: Play) => {
  let line = ''
  try {
    const reply = await $.model.complete({
      model: 'haiku',
      system: ANNOUNCER,
      prompt: announcerPrompt(play, recent.slice(-4)),
      maxTokens: 60,
      effort: 'low',
    })
    if (reply.isAnswered) line = speakable(reply.text)
  } catch {
    // the model is unavailable: fall back to the scripted line
  }
  return line || play.fallback
}

/** One utterance at a time; the slot holds at most one play behind it. */
const onAir = async ($: EngineInterface) => {
  if (isOnAir || isDemo || slot.isEmpty) return
  isOnAir = true
  try {
    const play = slot.take(await $.clock.now())
    if (!play) return
    const line = await call($, play)
    recent.push(line)
    if (recent.length > 8) recent.shift()
    await post($, line, play.at, play.fx)
    void crowd($, play.fx)
    await say($, line)
  } finally {
    isOnAir = false
  }
}

const runDemo = async ($: EngineInterface) => {
  isDemo = true
  await resetGame($)
  let wait = 0
  DEMO.forEach(([delay, line, fx], i) => {
    wait += delay
    $.clock.after(wait, () => {
      void (async () => {
        await post($, line, wait, fx)
        void crowd($, fx)
        await say($, line)
        if (i === DEMO.length - 1) isDemo = false
      })()
    })
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'caster',
      description: 'Live sportscaster commentary: /caster on | off | demo | booth',
    })
    const wasLive = (await $.store.get('isLive')) === true
    await update($, isLive, () => wasLive)
    $.clock.every(350, () => void onAir($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'caster' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'booth' || arg === 'pane') {
      await openBooth($)
      return { text: 'Sportscaster: the booth is open.' }
    }
    if (arg === 'demo') {
      void openBooth($)
      await runDemo($)
      return { text: 'Sportscaster: demo broadcast starting. Sound on.' }
    }
    const turnOn = arg === 'on' || (arg === '' && !(await read($, isLive)))
    await $.store.set('isLive', turnOn)
    await update($, isLive, () => turnOn)
    if (!turnOn) {
      await update($, ticker, () => null)
      return { text: 'Sportscaster off the air.' }
    }
    await resetGame($)
    void openBooth($)
    slot.offer({ text: 'The broadcast begins, Claude takes the field', weight: 3, fx: 'cheer', fallback: 'Welcome to the terminal! Claude takes the field!', at: await $.clock.now() })
    return { text: 'Sportscaster on the air. /caster off to stop.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (await read($, isLive)) {
      booth.scoutStreak = 0
      slot.offer({ text: 'A new play is called in from the sideline', weight: 1, fx: null, fallback: 'New play from the sideline. Here we go.', at: await $.clock.now() })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's own calls are its game, not this one.
    if (e.agentId || !(await read($, isLive))) return next(e)
    const info = { tool: String(e.tool), input: fieldsOf(e) }
    slot.offer(booth.before(info, await $.clock.now()))
    const ran = await next(e)
    if (ran.deny === undefined) {
      slot.offer(booth.after(info, { isError: ran.isError === true, text: ran.text ?? '' }, await $.clock.now()))
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && (await read($, isLive))) slot.offer(turnPlay(e.durationMs, e.isAborted, await $.clock.now()))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, ticker)
    if (e.props.hasSurvey || !now || (!(await read($, isLive)) && !isDemo)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, (e.props.bodyColumns || e.viewport?.columns || 80) - 12)
    const line = now.line.length > width ? `${now.line.slice(0, width - 3)}...` : now.line

    return (
      <Box gap={1}>
        <Text backgroundColor={GOLD} color={INK} bold> LIVE </Text>
        <Text color={now.fx === 'cheer' ? GOLD : PAPER} bold={now.fx === 'cheer'}>{line}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [now, list, m, sc, live] = await Promise.all([read($, ticker), read($, feed), read($, mic), read($, score), read($, isLive)])
    const clockNow = await $.clock.now()
    const width = Math.max(24, (e.props.bodyColumns || e.viewport?.columns || 40) - 2)
    const rows = e.viewport?.rows ?? 30
    const mood = moodOf(now?.fx ?? null)
    const isOn = live || isDemo
    const current = now ? revealed(now.line, clockNow - m.startedAt, m.isTalking) : 'Waiting for kickoff. /caster on to go live.'
    const caption = wrap(current, width - 2)
    const captionBg = now?.fx === 'boo' ? RED : GOLD
    const clockLine = sc.startedAt ? gameClock(clockNow - sc.startedAt) : '00:00'
    // Head (6) + header + score + caption + gaps take about 14 rows; each call gets up to 3.
    const room = Math.max(1, Math.floor((rows - 14 - caption.length) / 3))

    return (
      <Box flexDirection="column" gap={1}>
        <Box justifyContent="space-between">
          <Text color={isOn ? RED : PAPER} bold>{isOn ? '● ON AIR' : '○ OFF AIR'}</Text>
          <Text dimColor>{clockLine}</Text>
        </Box>
        <Box gap={2} alignItems="center">
          <Box flexDirection="column">
            {head(m.isTalking ? m.frame : -1, mood).map(([l, face, r]) => (
              <Text>
                <Text color={GOLD}>{l}</Text>
                <Text color={PAPER}>{face}</Text>
                <Text color={GOLD}>{r}</Text>
              </Text>
            ))}
          </Box>
          <Box flexDirection="column">
            <Text color={PAPER} bold>THE BOOTH</Text>
            <Text dimColor>{m.isTalking ? 'on the mic' : 'listening'}</Text>
            <Text>
              <Text dimColor>plays </Text>
              <Text color={PAPER} bold>{String(sc.plays)}</Text>
              <Text dimColor>  fouls </Text>
              <Text color={sc.fouls ? RED : PAPER} bold>{String(sc.fouls)}</Text>
            </Text>
          </Box>
        </Box>
        <Box flexDirection="column" backgroundColor={captionBg} paddingX={1}>
          {caption.map(row => (
            <Text color={INK} bold>{row}</Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text dimColor bold>PLAY-BY-PLAY</Text>
          {list.length === 0 && <Text dimColor>No plays yet.</Text>}
          {list.slice(0, room).map(item => (
            <Box gap={1}>
              <Text dimColor>{gameClock(item.at)}</Text>
              <Box flexDirection="column" flexShrink={1}>
                <Text color={item.fx === 'cheer' ? GOLD : item.fx === 'boo' ? RED : PAPER} bold={item.fx === 'cheer'} wrap="wrap">
                  {item.line}
                </Text>
                {item.fx && item.fx !== 'gasp' && <Text dimColor>{item.fx === 'cheer' ? 'crowd: cheering' : 'crowd: booing'}</Text>}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
