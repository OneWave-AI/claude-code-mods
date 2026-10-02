export type Stats = {
  startedAt: number
  tools: Record<string, number>
  files: Record<string, number>
  bash: number
  tests: { pass: number; fail: number; comebacks: number; last: 'pass' | 'fail' | null }
  turns: number
  longestTurnMs: number
  usd: number
  /** Skills run this session (Skill tool calls), by name. */
  skills: Record<string, number>
  /** MCP connectors called this session, by server. */
  connectors: Record<string, number>
  /** The main loop's model when the reveal froze. */
  model: string
  /** Plan rate-limit windows when the reveal froze: percent used (-1 unknown) and ISO reset times. */
  limits?: Limits
}

export type Limits = { week: number; session: number; weekResets: string; sessionResets: string }

/** One window of `scripts/usage.py`'s rollup: [name, count] pairs, most first. */
export type UsageWindow = {
  sessions: number
  prompts: number
  tokens: number
  out: number
  activeDays: number
  models: [string, number][]
  tools: [string, number][]
  toolKinds: number
  skills: [string, number][]
  skillKinds: number
  connectors: [string, number][]
  connectorKinds: number
}

export type Usage = { week: UsageWindow; month: UsageWindow; at: number }

export type Reveal = {
  /** How many cards are showing. */
  shown: number
  isDemo: boolean
  /** The PNG written for this reveal, once it is on disk. */
  savedPath: string | null
  generation: number
  /** Frozen stats the reveal draws (demo or a snapshot of the live ones). */
  stats: Stats | null
  /** Week and month usage from the transcripts, or null when the scan failed. */
  usage: Usage | null
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-wrapped': { stats: Stats; reveal: Reveal }
  }
}
