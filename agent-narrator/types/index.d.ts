export type Step = {
  id: string
  text: string
  note: string | null
  status: 'running' | 'done' | 'failed'
  at: number
  minutes: number
}

export type Run = {
  isRunning: boolean
  startedAt: number | null
  endedAt: number | null
  steps: number
  savedMinutes: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-narrator': { feed: Step[]; run: Run; isSmart: boolean; isDemo: boolean }
  }
}
