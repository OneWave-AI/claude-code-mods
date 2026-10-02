export type Mood = 'idle' | 'happy' | 'eating' | 'sick' | 'panic' | 'sleep' | 'sad' | 'levelup'

export type Stage = 'egg' | 'blob' | 'critter' | 'crowned'

/** What lives across sessions in $.store. Times are epoch ms. */
export type Pet = {
  name: string
  xp: number
  /** 0 starving, 100 full. */
  hunger: number
  /** 0 to 100. */
  hp: number
  bornAt: number
  lastFedAt: number
  /** When decay was last applied. */
  lastTickAt: number
  meals: number
}

/** A scripted look the demo forces, over the real pet. */
export type DemoView = { mood: Mood; stage: Stage; caption: string }

declare module 'claude-code' {
  interface PluginState {
    'code-pet': { pet: Pet | null; mood: Mood; demo: DemoView | null }
  }
}
