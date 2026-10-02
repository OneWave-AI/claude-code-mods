export type Phase = 'code' | 'armed' | 'launched' | 'aborted'

export type Alert = {
  command: string
  reason: string
  code: string
  startedAt: number
  expiresAt: number
  phase: Phase
  isDemo: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'launch-codes': { alert: Alert | null }
  }
}
