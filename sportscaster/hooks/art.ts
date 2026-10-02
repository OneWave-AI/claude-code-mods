// The commentator in the booth pane: a headset head whose mouth flaps while a line is read.

export type Mood = 'calm' | 'hype' | 'groan'

export const MOUTHS = ['───', '─o─', ' O ', '─o─'] as const

const EYES: Record<Mood, string> = { calm: '●   ●', hype: '◉   ◉', groan: '✖   ✖' }

/** Rows of the head, each split into [headset, face, headset] so the headset can take its own color. */
export const head = (frame: number, mood: Mood): Array<[string, string, string]> => {
  const mouth = frame < 0 ? MOUTHS[0] : MOUTHS[frame % MOUTHS.length]!
  return [
    [' ╭───────╮', '', ''],
    ['╭┤', '       ', '├╮'],
    ['│', `│ ${EYES[mood]} │`, '│'],
    ['╰┤', '   ▿   ', '├╯'],
    ['', ` │  ${mouth}  │`, '─◉'],
    ['', ' ╰───────╯', ''],
  ]
}

export const moodOf = (fx: string | null): Mood => (fx === 'cheer' ? 'hype' : fx === 'boo' ? 'groan' : 'calm')

const CHAR_MS = 38

/** How much of a line has been read out after `elapsedMs`; the whole line once speech has ended. */
export const revealed = (line: string, elapsedMs: number, isTalking: boolean) =>
  isTalking ? line.slice(0, Math.max(1, Math.floor(elapsedMs / CHAR_MS))) : line

/** A game clock from the start of the broadcast: `03:07`, then `1:03:07` past an hour. */
export const gameClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Splits text into lines no wider than `width`, breaking on spaces where it can. */
export const wrap = (text: string, width: number): string[] => {
  const w = Math.max(8, width)
  const out: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = word
    else if (cur.length + 1 + word.length <= w) cur += ` ${word}`
    else {
      out.push(cur)
      cur = word
    }
    while (cur.length > w) {
      out.push(cur.slice(0, w))
      cur = cur.slice(w)
    }
  }
  if (cur) out.push(cur)
  return out
}
