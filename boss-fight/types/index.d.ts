/** One test run as read from a runner's output. */
export type RunResult = { runner: string; failed: number; passed: number }

/** The fight on screen. `phase` drives the animation; times are epoch ms. */
export type Fight = {
  /** The boss's name and look, picked when it spawns. */
  boss: string
  kind: number
  maxHp: number
  hp: number
  runner: string
  phase: 'none' | 'spawn' | 'idle' | 'hit' | 'heal' | 'ko'
  /** When the current phase began. */
  phaseAt: number
  /** The last change: damage dealt (positive) or healed (negative). */
  delta: number
  runs: number
  loot: string | null
  /** A demo fight, not a real one: kills are not counted. */
  isDemo: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'boss-fight': { fight: Fight; kills: number }
  }
}
