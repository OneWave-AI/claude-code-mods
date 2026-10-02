import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reveal, Stats, Usage } from '../types'
import { cardHeight, renderCard } from './card'
import { GLYPH_H, GLYPH_W, lit, printable } from './font'
import { toBase64 } from './png'
import { addCall, addTurn, allCards, demoStats, demoUsage, empty, limitsOf } from './stats'

const PANE = 'session-wrapped'
const STEP_MS = 650

const stats = atom({ plugin: 'session-wrapped', key: 'stats' } as const, empty(0))
const reveal = atom({ plugin: 'session-wrapped', key: 'reveal' } as const, {
  shown: 0,
  isDemo: false,
  savedPath: null,
  generation: 0,
  stats: null,
  usage: null,
  at: 0,
} as Reveal)

const GOLD = '#c2a87e'
const BLUE = '#61A5FA'
const PAPER = '#E8E2D6'
const INK = '#0e0c0a'
const HEX = { gold: GOLD, blue: BLUE, paper: PAPER } as const
const RGB = { gold: 0xc2a87e, blue: 0x61a5fa, paper: 0xe8e2d6 } as const

let turnStartedAt = 0

/** Week and month usage from `scripts/usage.py`: a cached rollup of every transcript. */
const scanUsage = ($: EngineInterface): Promise<Usage | null> =>
  (async () => {
    const ran = await $.process.run(['python3', `${$.plugin.root}/scripts/usage.py`], { timeoutMs: 120_000 })
    if (ran.exitCode !== 0) return null
    const parsed = JSON.parse(ran.stdout) as Usage
    return parsed.week && parsed.month ? parsed : null
  })().catch(() => null)
let revealTimer: { cancel: () => void } | null = null

/** Big text for a Raster: the 5x7 font in half blocks, 4 rows tall. */
const bigCells = (value: string, color: number) => {
  const chars = [...printable(value)]
  const columns = Math.max(1, chars.length * (GLYPH_W + 1) - 1)
  const rows = Math.ceil(GLYPH_H / 2)
  const words = new Uint32Array(columns * rows * 3)
  const on = (x: number, y: number) => {
    const n = Math.floor(x / (GLYPH_W + 1))
    const gx = x % (GLYPH_W + 1)
    return gx < GLYPH_W && y < GLYPH_H && lit(chars[n] ?? ' ', gx, y)
  }
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < columns; x++) {
      const top = on(x, r * 2)
      const bottom = on(x, r * 2 + 1)
      const i = (r * columns + x) * 3
      words[i] = top && bottom ? 0x2588 : top ? 0x2580 : bottom ? 0x2584 : 0x20
      words[i + 1] = top || bottom ? color : 0x01000000
      words[i + 2] = 0x01000000
    }
  }
  return { columns, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

const dateLabel = (now: number) => {
  const d = new Date(now)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`
}

const stamp = (now: number) => {
  const d = new Date(now)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`
}

/** Writes the PNG with the system's base64 decoder (`$.fs.write` takes text alone), or a bundled Python helper where base64 has no -o. */
const savePng = async ($: EngineInterface, s: Stats, usage: Usage | null, now: number, isDemo: boolean) => {
  const home = (await $.env.get('HOME')) ?? '/tmp'
  const path = `${home}/Desktop/claude-wrapped-${stamp(now)}${isDemo ? '-demo' : ''}.png`
  const png = toBase64(renderCard(allCards(s, usage, now), dateLabel(now), isDemo))
  const ran = await $.process.run(['base64', '-D', '-o', path], { stdin: png, timeoutMs: 20_000 })
  if (ran.exitCode !== 0) {
    const fallback = await $.process.run(['python3', `${$.plugin.root}/scripts/write_b64.py`, path], { stdin: png, timeoutMs: 20_000 })
    if (fallback.exitCode !== 0) throw new Error(ran.stderr || fallback.stderr || 'base64 failed')
  }
  return path
}

const startReveal = async ($: EngineInterface, isDemo: boolean) => {
  const now = await $.clock.now()
  const meter = await $.session.usage()
  const usd = meter.cost?.usd ?? 0
  const model = await $.session.model().catch(() => '')
  const live = { ...(await read($, stats)), usd, model, limits: limitsOf(meter.rateLimits) }
  const frozen = isDemo ? demoStats(now) : live
  // Fresh numbers each reveal: the scan reads only transcripts changed since the last one.
  const usage = isDemo ? demoUsage(now) : await scanUsage($)
  await update($, reveal, r => ({ shown: 0, isDemo, savedPath: null, generation: r.generation + 1, stats: frozen, usage, at: now }))
  const opened = await $.ui.open({ id: PANE, title: 'Session Wrapped', focus: true, rows: 36 })
  revealTimer?.cancel()
  const total = allCards(frozen, usage, now).length
  const timer = $.clock.every(STEP_MS, () => {
    void read($, reveal).then(async r => {
      if (r.shown >= total) {
        timer.cancel()
        if (revealTimer === timer) revealTimer = null
        return
      }
      await update($, reveal, x => ({ ...x, shown: x.shown + 1 }))
    })
  })
  revealTimer = timer
  try {
    const path = await savePng($, frozen, usage, now, isDemo)
    await update($, reveal, r => ({ ...r, savedPath: path }))
    return { path, isPlaced: opened.isPlaced }
  } catch (err) {
    return { path: null, isPlaced: opened.isPlaced, error: String(err) }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'wrapped',
      description: 'Session Wrapped: animated stat reveal + a shareable PNG card. /wrapped [demo]',
    })
    const s = await read($, stats)
    if (s.startedAt === 0) {
      const now = await $.clock.now()
      await update($, stats, () => empty(now))
    }
    // Warm the transcript cache in the background so /wrapped answers fast.
    void scanUsage($)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    const input = e as { file_path?: unknown; notebook_path?: unknown; command?: unknown; skill?: unknown }
    const filePath = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : undefined
    const command = typeof input.command === 'string' ? input.command : undefined
    const skill = typeof input.skill === 'string' ? input.skill : undefined
    await update($, stats, s => addCall(s, { tool: String(e.tool), filePath, command, skill, isError: ran.isError === true }))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && turnStartedAt > 0) {
      const ms = (await $.clock.now()) - turnStartedAt
      await update($, stats, s => addTurn(s, ms))
      turnStartedAt = 0
    }
    return done
  })

  on('session.end', async ($, e, next) => {
    $.ui.toast('Session Wrapped is ready: run /wrapped for your recap card', { timeoutMs: 8000 })
    return next(e)
  })

  on('command.run', { command: 'wrapped' }, async ($, e) => {
    const isDemo = e.args.trim().toLowerCase() === 'demo'
    const done = await startReveal($, isDemo)
    if (!done.path) return { text: `Wrapped is revealing in the pane, but the PNG did not save: ${done.error ?? 'unknown error'}` }
    return { text: `Wrapped${isDemo ? ' (demo)' : ''}: card saved to ${done.path}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Raster = 'Raster' in elements ? elements.Raster : null
    const Image = 'Image' in elements ? elements.Image : null
    const r = await read($, reveal)
    if (!r.stats) {
      return (
        <Box paddingX={1}>
          <Text dimColor>Run /wrapped to reveal this session.</Text>
        </Box>
      )
    }
    const list = allCards(r.stats, r.usage, r.at)
    const width = Math.max(40, (e.props.bodyColumns || e.viewport?.columns || 80) - 2)
    const latest = r.shown > 0 ? list[r.shown - 1] : undefined
    const isDone = r.shown >= list.length
    const big = latest ? bigCells(latest.value, RGB[latest.accent]) : null

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text>
            <Text bold color={GOLD}>SESSION WRAPPED</Text>
            <Text dimColor>  {dateLabel(r.at)}{r.isDemo ? '  demo' : ''}</Text>
          </Text>
          <Text dimColor>{Math.min(r.shown, list.length)}/{list.length}</Text>
        </Box>
        <Text color="#2a2520">{'─'.repeat(width)}</Text>

        {latest && big && (
          <Box flexDirection="column" marginY={1}>
            <Text dimColor>{latest.label}</Text>
            {Raster && e.surface === 'terminal' && big.columns <= width ? (
              <Raster key={`big-${r.shown}`} columns={big.columns} rows={big.rows} cells={big.cells} />
            ) : (
              <Text bold color={HEX[latest.accent]}>{latest.value}</Text>
            )}
            <Text color={PAPER}>{latest.note}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          {list.slice(0, Math.max(0, r.shown - 1)).map(card => (
            <Box key={card.label} gap={1}>
              <Box width={1} backgroundColor={HEX[card.accent]} />
              <Box width={15}>
                <Text dimColor>{card.label}</Text>
              </Box>
              <Text bold color={HEX[card.accent]}>{card.value}</Text>
              <Text dimColor wrap="truncate-end">{card.note}</Text>
            </Box>
          ))}
        </Box>

        {isDone && (
          <Box flexDirection="column" marginTop={1}>
            {r.savedPath && Image && e.surface === 'terminal' && (
              <Image
                key="card"
                source={{ file: r.savedPath, format: 'png', generation: r.generation }}
                columns={Math.min(width, 64)}
                rows={Math.round(Math.min(width, 64) * (cardHeight(list.length) / 1200) / 2)}
                alt=" "
              />
            )}
            <Text>
              <Text backgroundColor={GOLD} color={INK} bold> SHARE </Text>
              <Text dimColor> {r.savedPath ? r.savedPath : 'saving the card...'}</Text>
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
