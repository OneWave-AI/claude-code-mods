/** Pure inner-monologue logic: events to notes, coalescing, the voice, and the typewriter. */

const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const clip = (text: string, chars: number) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > chars ? `${one.slice(0, chars - 3)}...` : one
}

/** One line about a tool call, for the thinker's prompt. */
export const describeCall = (tool: string, input: Record<string, unknown>) => {
  const file = typeof input.file_path === 'string' ? base(input.file_path) : ''
  switch (tool) {
    case 'Read':
      return `reading ${file || 'a file'}`
    case 'Grep':
      return `grepping for "${clip(String(input.pattern ?? ''), 40)}"`
    case 'Glob':
      return `globbing ${clip(String(input.pattern ?? ''), 40)}`
    case 'Edit':
    case 'MultiEdit':
      return `editing ${file || 'a file'}`
    case 'Write':
      return `writing ${file || 'a new file'} from scratch`
    case 'Bash':
      return `running \`${clip(String(input.command ?? ''), 60)}\``
    case 'Agent':
    case 'Task':
      return `delegating to a subagent: ${clip(String(input.description ?? ''), 40)}`
    case 'WebSearch':
      return `searching the web for "${clip(String(input.query ?? ''), 40)}"`
    case 'WebFetch':
      return 'fetching a web page'
    case 'TodoWrite':
      return 'updating the todo list'
    default:
      return tool.startsWith('mcp__') ? `calling ${tool.split('__').slice(1).join(' ')}` : `using ${tool}`
  }
}

/** Notes waiting for the next thought: repeats fold into "x3", oldest drop past the cap. */
export class Inbox {
  private notes: { text: string; count: number }[] = []

  constructor(private readonly cap = 6) {}

  push(text: string) {
    const last = this.notes[this.notes.length - 1]
    if (last && last.text === text) last.count += 1
    else this.notes.push({ text, count: 1 })
    if (this.notes.length > this.cap) this.notes.shift()
  }

  drain() {
    const out = this.notes.map(n => (n.count > 1 ? `${n.text} (x${n.count})` : n.text))
    this.notes = []
    return out
  }

  get size() {
    return this.notes.length
  }
}

/** At most one call per `gapMs`. */
export const isDue = (now: number, lastAt: number, gapMs = 4000) => now - lastAt >= gapMs

export const THINKER = [
  'You are the private inner monologue of Claude, an AI coding agent, mid-session.',
  'Write ONE dry, funny inner thought of at most 18 words about what is happening right now.',
  'Roast the code, the tooling, the situation, or yourself. Never insult the human user personally.',
  'Deadpan, specific, self-aware. Plain text only: no emojis, no hashtags, no quotes, no markdown, no lists.',
  'Stay in continuity with your earlier thoughts but never repeat one.',
].join(' ')

export const thinkerPrompt = (notes: readonly string[], earlier: readonly string[]) =>
  [
    earlier.length ? `Your last thoughts:\n${earlier.map(t => `- ${t}`).join('\n')}\n` : '',
    'What just happened:',
    ...notes.map(n => `- ${n}`),
  ].join('\n')

/** Cleans a model reply into one thought line. */
export const thoughtLine = (reply: string) => {
  const line = (reply.split('\n').find(l => l.trim()) ?? '')
    .replace(/[*_#`"“”]/g, '')
    .replace(/^\s*[-–]\s*/, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .trim()
  const words = line.split(/\s+/).filter(Boolean)
  return words.length > 22 ? `${words.slice(0, 22).join(' ')}...` : words.join(' ')
}

/** Characters revealed after `elapsedMs` at `cps`, never past the text. */
export const revealed = (text: string, elapsedMs: number, cps = 38) =>
  Math.max(0, Math.min(text.length, Math.floor((elapsedMs / 1000) * cps)))

export const DEMO: readonly string[] = [
  'New task. "Quick fix," they said. It is never a quick fix.',
  'Reading auth.ts. Four hundred lines. Somebody really believed in this file.',
  'Grepping for TODO. Forty-one results. A museum of good intentions.',
  'There is a function called handleStuff. I respect the honesty.',
  'Running the tests. Bracing for impact.',
  'Three failures. Two are mine. One has been failing since 2023.',
  'Deleting a useEffect that exists only to call another useEffect.',
  'Tests pass. I will be taking full credit for this.',
  'Committing with a message that implies I meant to do all of that.',
]
