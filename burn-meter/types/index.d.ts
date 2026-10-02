export type Burn = {
  /** What the odometer shows right now (tweens toward `target`). */
  shown: number
  /** The session's real cost, or the demo ramp while a demo runs. */
  target: number
  isDemo: boolean
  lifetime: number
  /** Subscription windows, 0..100, or -1 with no reading (API key, before the first response). */
  session: number
  week: number
  /** When each window resets, ISO 8601, or '' unknown. */
  sessionResets: string
  weekResets: string
}

/** One model's tokens this session: input counts cached reads and writes too. */
export type ModelTally = { input: number; output: number; turns: number }

declare module 'claude-code' {
  interface PluginState {
    'burn-meter': { burn: Burn; isHidden: boolean; fired: number[]; turns: number[]; turnStart: number; models: Record<string, ModelTally> }
  }
}
