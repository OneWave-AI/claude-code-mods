import type { Alert, CalEvent } from '../types'

type GmailMessage = {
  id: string
  date?: string
  sender?: string
  subject?: string
  snippet?: string
  labelIds?: string[]
  viewUrl?: string
}
type GmailThread = { id: string; viewUrl?: string; messages?: GmailMessage[] }

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const senderName = (sender: string) => {
  const match = sender.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/)
  return (match?.[1] ?? sender).trim()
}

const safeUrl = (url: string | undefined) => {
  if (!url) return undefined
  try {
    const href = new URL(url).href
    return href.startsWith('https:') && !href.includes('@') && href.length <= 2048
      ? href
      : undefined
  } catch {
    return undefined
  }
}

/** Gmail search_threads JSON -> one alert per thread, keyed on its latest message. */
export const parseGmail = (raw: string, me: string): Alert[] => {
  let body: { threads?: GmailThread[] }
  try {
    body = JSON.parse(raw)
  } catch {
    return []
  }
  const alerts: Alert[] = []
  for (const thread of body.threads ?? []) {
    const messages = (thread.messages ?? []).filter(
      m => !(m.sender ?? '').toLowerCase().includes(me.toLowerCase()),
    )
    const last = messages[messages.length - 1]
    if (!last) continue
    alerts.push({
      id: `gmail:${thread.id}:${last.id}`,
      source: 'gmail',
      from: senderName(last.sender ?? 'unknown'),
      where: clip(last.subject ?? '(no subject)', 120),
      text: clip(last.snippet ?? '', 320),
      url: safeUrl(thread.viewUrl ?? last.viewUrl),
      at: last.date ?? new Date(0).toISOString(),
    })
  }
  return alerts
}

const field = (block: string, name: string) =>
  block.match(new RegExp(`^${name}: ?(.*)$`, 'm'))?.[1]?.trim()

/** Slack search (detailed format) -> one alert per message. */
export const parseSlack = (raw: string): Alert[] => {
  let results = raw
  try {
    const body = JSON.parse(raw) as { results?: string }
    results = body.results ?? ''
  } catch {
    // already the results text
  }
  const alerts: Alert[] = []
  for (const block of results.split(/^### Result \d+ of \d+\s*$/m).slice(1)) {
    const ts = field(block, 'Message_ts')
    if (!ts) continue
    const channel = (field(block, 'Channel') ?? 'Slack').replace(/\s*\(ID: [^)]*\)\s*$/, '')
    const from = (field(block, 'From') ?? 'someone').replace(/\s*[<(].*$/, '')
    const link = field(block, 'Permalink')?.match(/\((https:[^)]+)\)/)?.[1]?.replace(/\\\//g, '/')
    const text = block.split(/^Text: ?$/m)[1]?.split(/^---\s*$/m)[0] ?? ''
    alerts.push({
      id: `slack:${ts}`,
      source: 'slack',
      from,
      where: channel,
      text: clip(text.replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1'), 500),
      url: safeUrl(link),
      at: new Date(Math.round(Number(ts) * 1000)).toISOString(),
    })
  }
  return alerts
}

/** Merge lists, dedupe by id, newest first. */
export const mergeAlerts = (...lists: Alert[][]): Alert[] => {
  const byId = new Map<string, Alert>()
  for (const list of lists) for (const alert of list) byId.set(alert.id, alert)
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at))
}

export const age = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

type GcalEvent = {
  id: string
  summary?: string
  status?: string
  eventType?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  htmlLink?: string
  conferenceUrl?: string
  hangoutLink?: string
  location?: string
  attendees?: { self?: boolean; responseStatus?: string }[]
}

const clock12 = (iso: string) => {
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return ''
  const hour = Number(match[1])
  const suffix = hour < 12 ? 'a' : 'p'
  return `${hour % 12 || 12}:${match[2]}${suffix}`
}

/** Google Calendar list_events JSON -> timed, not-declined, not-cancelled events. */
export const parseCalendar = (raw: string): CalEvent[] => {
  let body: { events?: GcalEvent[] }
  try {
    body = JSON.parse(raw)
  } catch {
    return []
  }
  const events: CalEvent[] = []
  for (const ev of body.events ?? []) {
    const start = ev.start?.dateTime
    const end = ev.end?.dateTime
    if (!start || !end || ev.status === 'cancelled') continue
    if (ev.eventType && !['DEFAULT', 'FROM_GMAIL'].includes(ev.eventType)) continue
    const me = ev.attendees?.find(a => a.self)
    if (me?.responseStatus === 'declined') continue
    const zoom = ev.location?.match(/https:\/\/\S*zoom\.us\/\S+/)?.[0]
    events.push({
      id: ev.id,
      title: clip(ev.summary ?? '(untitled)', 80),
      start: new Date(Date.parse(start)).toISOString(),
      end: new Date(Date.parse(end)).toISOString(),
      clock: clock12(start),
      endClock: clock12(end),
      join: safeUrl(ev.conferenceUrl ?? ev.hangoutLink ?? zoom),
      url: safeUrl(ev.htmlLink),
      needsRsvp: me?.responseStatus === 'needsAction',
      people: Math.max(0, (ev.attendees?.length ?? 1) - 1),
    })
  }
  return events.sort((a, b) => a.start.localeCompare(b.start))
}

/** "in 12m", "now", "in 2h 05m". */
export const until = (iso: string, now: number) => {
  const minutes = Math.round((Date.parse(iso) - now) / 60000)
  if (minutes <= 0) return 'now'
  if (minutes < 60) return `in ${minutes}m`
  return `in ${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
