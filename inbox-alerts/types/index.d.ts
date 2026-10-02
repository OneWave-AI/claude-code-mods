export type AlertSource = 'gmail' | 'slack'

export type Alert = {
  id: string
  source: AlertSource
  from: string
  where: string
  text: string
  url?: string
  at: string
}

export type CalEvent = {
  id: string
  title: string
  start: string
  end: string
  /** HH:MM as the calendar wrote it (its own time zone). */
  clock: string
  endClock: string
  join?: string
  url?: string
  needsRsvp: boolean
  people: number
}

export type Tab = 'mail' | 'slack' | 'calendar'

export type PollStatus = { lastAt: string | null; error: string | null }

declare module 'claude-code' {
  interface PluginState {
    'inbox-alerts': { alerts: Alert[]; events: CalEvent[]; poll: PollStatus; tab: Tab }
  }
}
