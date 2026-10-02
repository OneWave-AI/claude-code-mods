export type Lane = {
  id: string
  name: string
  race: string
  tools: number
  edits: number
  testsPassed: number
  testsFailed: number
  costUsd: number
  startedAt: number
  finishedAt: number | null
  updatedAt: number
}

export type RaceView = {
  race: string | null
  isDemo: boolean
  lanes: Lane[]
  winner: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'agent-race': { view: RaceView }
  }
}
