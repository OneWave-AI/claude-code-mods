export type Fx = 'cheer' | 'boo' | 'gasp' | null

export type Ticker = { line: string; at: number; fx: Fx }

/** The booth pane: who is talking, since when, and the frame of the mouth. */
export type Mic = { isTalking: boolean; startedAt: number; frame: number }

export type Score = { plays: number; fouls: number; startedAt: number }

declare module 'claude-code' {
  interface PluginState {
    sportscaster: { ticker: Ticker | null; isLive: boolean; feed: Ticker[]; mic: Mic; score: Score }
  }
}
