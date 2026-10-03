/**
 * The desktop/editor/mobile view: the whole swarm as one SVG. Loop animations only (no entry animations): the card
 * redraws on every poll, and an entry animation would replay each time.
 * Gotcha: a CSS animation on `transform` replaces a `transform=` attribute on the same element. Position with an
 * outer <g>, animate an inner one.
 */

import type { Agent, Beat, Lead, Msg } from '../types'
import { ago, elapsed, isFailed, isLive, MAIN, nameOf, shortModel, statusWord, summary, tree } from './model'

const W = 400
const PAD = 16
const PANEL = '#101a2f'
const LINE = '#22304d'
const BLUE = '#61A5FA'
const GOLD = '#c2a87e'
const GOLD_HI = '#d4a44a'
const PAPER = '#E8E2D6'
const RED = '#e5484d'
const INK = '#0B1121'

const RH = 42
const IND = 18
const MAX_ROWS = 16

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!)
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
const r1 = (n: number) => Math.round(n * 10) / 10

const CSS = `
text{font-family:-apple-system,BlinkMacSystemFont,Inter,'Segoe UI',sans-serif;fill:${PAPER}}
.m{font-family:'SF Mono',ui-monospace,Menlo,monospace}
.lbl{font-size:9px;font-weight:700;letter-spacing:1.6px;opacity:.5}
.dim{opacity:.5}
.ping{animation:sw-ping 1.8s cubic-bezier(0,0,.2,1) infinite;transform-box:fill-box;transform-origin:center}
@keyframes sw-ping{0%{transform:scale(1);opacity:.75}100%{transform:scale(3);opacity:0}}
.march{animation:sw-march .9s linear infinite}
@keyframes sw-march{to{stroke-dashoffset:-12}}
.shim{animation:sw-shim 1.3s ease-in-out infinite}
@keyframes sw-shim{0%,100%{opacity:.5}50%{opacity:1}}
.breathe{animation:sw-breathe 3.2s ease-in-out infinite}
@keyframes sw-breathe{0%,100%{opacity:.35}50%{opacity:.9}}
.spin{animation:sw-spin 10s linear infinite;transform-box:fill-box;transform-origin:center}
@keyframes sw-spin{to{transform:rotate(360deg)}}
.dot1{animation:sw-dot 1.4s infinite}.dot2{animation:sw-dot 1.4s .2s infinite}.dot3{animation:sw-dot 1.4s .4s infinite}
@keyframes sw-dot{0%,80%,100%{opacity:.2}40%{opacity:1}}
.hl{opacity:0;transition:opacity .15s}.row:hover .hl{opacity:.06}
.arc{transition:opacity .15s}.arc:hover{opacity:1 !important;stroke-width:2.4}
.lane:hover .hl{opacity:.06}
`

export type SwarmView = { now: number; agents: Agent[]; lead: Lead; msgs: Msg[]; beats: Beat[] }

const label = (x: number, y: number, text: string, anchor = 'start') =>
  `<text class="lbl" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`

const colorOf = (a: Agent) => (isFailed(a.status) ? RED : isLive(a.status) ? BLUE : GOLD)

const stat = (x: number, y: number, value: string, name: string, color: string, live = false) =>
  `<g transform="translate(${x} ${y})">` +
  `<text x="0" y="0" font-size="22" font-weight="700" style="fill:${color}" class="m${live ? ' shim' : ''}">${esc(value)}</text>` +
  `<text class="lbl" x="0" y="14">${esc(name)}</text></g>`

/** The node glyph for one agent. */
const node = (x: number, y: number, a: Agent) => {
  const c = colorOf(a)
  let s = ''
  if (isLive(a.status)) {
    s += `<g transform="translate(${x} ${y})"><circle class="ping" r="5" fill="none" stroke="${c}" stroke-width="1.5"/></g>`
    s += `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`
  } else if (isFailed(a.status)) {
    s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${INK}" stroke="${RED}" stroke-width="1.5"/>`
    s += `<path d="M${x - 2.4} ${y - 2.4}L${x + 2.4} ${y + 2.4}M${x + 2.4} ${y - 2.4}L${x - 2.4} ${y + 2.4}" stroke="${RED}" stroke-width="1.5" stroke-linecap="round"/>`
  } else {
    s += `<circle cx="${x}" cy="${y}" r="5.5" fill="${INK}" stroke="${GOLD}" stroke-width="1.5"/>`
    s += `<path d="M${x - 2.4} ${y}L${x - 0.6} ${y + 1.9}L${x + 2.6} ${y - 1.9}" fill="none" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  return s
}

const pill = (x: number, y: number, text: string, color: string) => {
  const w = text.length * 5.6 + 10
  return (
    `<rect x="${x}" y="${y - 9}" width="${r1(w)}" height="13" rx="2" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".35"/>` +
    `<text x="${r1(x + w / 2)}" y="${y + 1}" font-size="8.5" font-weight="700" letter-spacing=".6" text-anchor="middle" style="fill:${color}">${esc(text.toUpperCase())}</text>`
  )
}

export const swarmSvg = (v: SwarmView): { source: string; width: number; height: number } => {
  const { now, agents, lead, msgs, beats } = v
  const sum = summary(agents, now)
  const rows = tree(agents)
  const shown = rows.slice(0, MAX_ROWS)
  const out: string[] = []
  let y = PAD

  // Header
  const busy = sum.live > 0
  out.push(label(PAD, y + 8, 'SWARM'))
  out.push(
    `<text x="${PAD + 54}" y="${y + 8}" font-size="9" font-weight="700" letter-spacing="1.4" style="fill:${busy ? BLUE : GOLD}" class="${busy ? 'shim' : ''}">${busy ? 'ORCHESTRATING' : agents.length ? 'STANDING DOWN' : 'IDLE'}</text>`,
  )
  const wall = sum.first !== undefined && sum.last !== undefined ? elapsed(sum.last - sum.first) : '0s'
  out.push(`<text x="${W - PAD}" y="${y + 8}" font-size="10" text-anchor="end" class="m dim">${esc(wall)} wall</text>`)
  y += 34
  const cols = [
    [String(sum.live), 'LIVE', BLUE, sum.live > 0],
    [String(sum.done), 'DONE', GOLD, false],
    [String(sum.failed), 'FAILED', sum.failed ? RED : PAPER, false],
    [String(sum.tools + lead.tools), 'CALLS', PAPER, false],
    [String(sum.peak), 'PARALLEL', GOLD_HI, false],
  ] as const
  const cw = (W - PAD * 2) / cols.length
  cols.forEach(([val, name, color, live], i) => out.push(stat(PAD + i * cw, y, val, name, color, live)))
  y += 28

  // Orchestration tree
  y += 14
  out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" stroke="${LINE}"/>`)
  y += 18
  out.push(label(PAD, y, 'ORCHESTRATION'))
  out.push(label(W - PAD, y, 'who spawned whom', 'end'))
  y += 10

  const LX = PAD + 8
  const col = (d: number) => LX + d * IND
  const GUT = W - PAD - 6 // comms rail x
  const yOf = new Map<string, number>()

  // Lead row
  const leadY = y + 16
  yOf.set(MAIN, leadY)
  out.push(`<g transform="translate(${LX} ${leadY})"><g class="spin"><rect x="-6.5" y="-6.5" width="13" height="13" rx="2" fill="none" stroke="${GOLD}" stroke-opacity=".5"/></g></g>`)
  out.push(`<rect x="${LX - 4}" y="${leadY - 4}" width="8" height="8" rx="1" fill="${GOLD_HI}" transform="rotate(45 ${LX} ${leadY})"/>`)
  out.push(`<text x="${LX + 16}" y="${leadY - 2}" font-size="12.5" font-weight="700">Lead</text>`)
  out.push(pill(LX + 52, leadY - 2, 'orchestrator', GOLD))
  out.push(
    `<text x="${LX + 16}" y="${leadY + 13}" font-size="10.5" class="${lead.busy ? 'shim' : 'dim'}" style="fill:${lead.busy ? BLUE : PAPER}">${esc(clip(lead.doing ?? 'waiting for you', 46))}</text>`,
  )
  out.push(`<text x="${GUT - 20}" y="${leadY - 2}" font-size="10" text-anchor="end" class="m dim">${lead.tools} calls</text>`)
  y = leadY + RH / 2 + 4

  if (!rows.length) {
    out.push(
      `<text x="${LX + 16}" y="${y + 14}" font-size="11" class="dim">No agents yet. Spawn subagents or a team and they</text>` +
        `<text x="${LX + 16}" y="${y + 29}" font-size="11" class="dim">appear here live, wired to whoever launched them</text>` +
        `<g font-size="16" font-weight="700" style="fill:${BLUE}"><text class="dot1" x="${LX + 16}" y="${y + 48}">·</text><text class="dot2" x="${LX + 24}" y="${y + 48}">·</text><text class="dot3" x="${LX + 32}" y="${y + 48}">·</text></g>`,
    )
    y += 60
  }

  for (const r of shown) {
    const a = r.agent
    const cy = y + RH / 2
    yOf.set(a.id, cy)
    const c = colorOf(a)
    const nx = col(r.depth + 1)
    const px = col(r.depth)
    // ancestor rails
    r.trail.forEach((cont, d) => {
      if (cont) out.push(`<line x1="${col(d + 1)}" x2="${col(d + 1)}" y1="${y}" y2="${y + RH}" stroke="${LINE}" stroke-width="1.2"/>`)
    })
    // own elbow
    const live = isLive(a.status)
    const dash = live ? ` stroke-dasharray="4 2" class="march"` : ''
    out.push(`<path d="M${px} ${y - 4} V${cy - 6} Q${px} ${cy} ${px + 6} ${cy} H${nx - 7}" fill="none" stroke="${live ? BLUE : LINE}" stroke-width="1.4"${dash} stroke-opacity="${live ? 0.9 : 1}"/>`)
    if (!r.last) out.push(`<line x1="${px}" x2="${px}" y1="${cy - 6}" y2="${y + RH}" stroke="${LINE}" stroke-width="1.2"/>`)

    const tx = nx + 13
    const room = Math.max(12, Math.floor((GUT - 26 - tx) / 6.3))
    const nm = a.name || a.label
    const tip = [nm, a.type, statusWord(a.status), a.model ? shortModel(a.model) : '', `${a.tools} tool calls`, a.errors ? `${a.errors} errors` : '', a.doing ?? '']
      .filter(Boolean)
      .join(' · ')
    out.push(`<g class="row"><title>${esc(tip)}</title><rect class="hl" x="${PAD - 4}" y="${y + 1}" width="${W - PAD * 2 + 8}" height="${RH - 2}" rx="3" fill="${PAPER}"/>`)
    out.push(node(nx, cy - 5, a))
    const nameText = clip(nm, Math.min(room, 26))
    out.push(`<text x="${tx}" y="${cy - 2}" font-size="12" font-weight="700">${esc(nameText)}</text>`)
    const pillX = tx + nameText.length * 6.6 + 6
    if (pillX < GUT - 90) out.push(pill(pillX, cy - 2, a.type === 'general-purpose' ? 'general' : clip(a.type, 14), c))
    const right = isLive(a.status) ? elapsed(now - a.startedAt) : statusWord(a.status)
    out.push(`<text x="${GUT - 20}" y="${cy - 2}" font-size="10" text-anchor="end" class="m" style="fill:${c}">${esc(right)}</text>`)
    const busyLine = live && a.busy
    const doing = a.doing ? (live ? a.doing : `last: ${a.doing}`) : live ? 'thinking' : a.label !== nm ? a.label : ''
    out.push(
      `<text x="${tx}" y="${cy + 13}" font-size="10.5" class="${busyLine ? 'shim' : 'dim'}" style="fill:${busyLine ? BLUE : PAPER}">${esc(clip(doing, room))}</text>`,
    )
    const meta = [a.tools ? `${a.tools}×` : '', shortModel(a.model)].filter(Boolean).join(' ')
    out.push(`<text x="${GUT - 20}" y="${cy + 13}" font-size="9.5" text-anchor="end" class="m dim">${esc(meta)}${a.errors ? `<tspan style="fill:${RED}"> ${a.errors}!</tspan>` : ''}</text>`)
    out.push('</g>')
    y += RH
  }
  if (rows.length > shown.length) {
    out.push(`<text x="${col(1)}" y="${y + 12}" font-size="10" class="dim">+ ${rows.length - shown.length} more agents</text>`)
    y += 18
  }

  // Comms rail: gold arcs between whoever messaged whom
  const pairs = new Map<string, { m: Msg; n: number }>()
  for (const m of msgs) {
    const k = `${m.from}>${m.to}`
    const p = pairs.get(k)
    pairs.set(k, { m, n: (p?.n ?? 0) + 1 })
  }
  for (const { m, n } of pairs.values()) {
    const y1 = yOf.get(m.from)
    const y2 = yOf.get(m.to)
    if (y1 === undefined || y2 === undefined || y1 === y2) continue
    const fresh = now - m.at < 20000
    const bow = Math.min(18, 6 + Math.abs(y2 - y1) / 10)
    const d = `M${GUT - 8} ${y1 - 5} C${GUT + bow} ${y1 - 5} ${GUT + bow} ${y2 - 5} ${GUT - 8} ${y2 - 5}`
    const tip = `${nameOf(agents, m.from)} → ${nameOf(agents, m.to)} (${n}): ${m.text}`
    out.push(
      `<g><title>${esc(clip(tip, 220))}</title><path class="arc${fresh ? ' march' : ''}" d="${d}" fill="none" stroke="${GOLD_HI}" stroke-width="${Math.min(3, 1 + n * 0.3)}" stroke-linecap="round"${fresh ? ' stroke-dasharray="3 3"' : ''} opacity="${fresh ? 0.95 : 0.45}"/>` +
        `<circle cx="${GUT - 8}" cy="${y2 - 5}" r="2.4" fill="${GOLD_HI}" opacity="${fresh ? 1 : 0.6}"/></g>`,
    )
  }

  // Timeline: how they overlap
  if (rows.length && sum.first !== undefined) {
    y += 10
    out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" stroke="${LINE}"/>`)
    y += 18
    out.push(label(PAD, y, 'TIMELINE'))
    out.push(label(W - PAD, y, 'how they overlap', 'end'))
    y += 10
    const t0 = sum.first
    const t1 = Math.max(now, t0 + 1000)
    const LX0 = PAD + 74
    const LW = W - PAD - LX0
    const xOf = (t: number) => LX0 + ((t - t0) / (t1 - t0)) * LW
    const LH = 11
    const top = y
    // quarter grid
    for (let i = 0; i <= 4; i++) {
      const gx = LX0 + (LW * i) / 4
      out.push(`<line x1="${r1(gx)}" x2="${r1(gx)}" y1="${top}" y2="${top + shown.length * (LH + 4)}" stroke="${LINE}" stroke-dasharray="1 3"/>`)
    }
    for (const r of shown) {
      const a = r.agent
      const c = colorOf(a)
      const x1 = xOf(a.startedAt)
      const x2 = Math.max(x1 + 3, xOf(a.endedAt ?? now))
      out.push(`<g class="lane"><title>${esc(`${a.name || a.label}: ${elapsed((a.endedAt ?? now) - a.startedAt)}, ${a.tools} tool calls`)}</title>`)
      out.push(`<rect class="hl" x="${PAD - 4}" y="${y - 1}" width="${W - PAD * 2 + 8}" height="${LH + 2}" fill="${PAPER}"/>`)
      out.push(`<text x="${PAD + r.depth * 6}" y="${y + 9}" font-size="9.5" class="dim">${esc(clip(a.name || a.label, 12 - r.depth))}</text>`)
      out.push(`<rect x="${r1(x1)}" y="${y + 1}" width="${r1(x2 - x1)}" height="${LH - 2}" rx="2" fill="${c}" fill-opacity="${isLive(a.status) ? 0.85 : 0.55}"${isLive(a.status) ? ' class="shim"' : ''}/>`)
      out.push('</g>')
      y += LH + 4
    }
    const nx = xOf(now)
    out.push(`<line x1="${r1(nx)}" x2="${r1(nx)}" y1="${top - 4}" y2="${y}" stroke="${BLUE}" stroke-width="1.2" class="breathe"/>`)
    out.push(`<text x="${LX0}" y="${y + 10}" font-size="9" class="m dim">${esc(new Date(t0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</text>`)
    out.push(`<text x="${W - PAD}" y="${y + 10}" font-size="9" text-anchor="end" class="m" style="fill:${BLUE}">now</text>`)
    y += 14
  }

  // Comms feed
  const recentMsgs = msgs.slice(-4).reverse()
  if (recentMsgs.length) {
    y += 10
    out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" stroke="${LINE}"/>`)
    y += 18
    out.push(label(PAD, y, 'COMMS'))
    out.push(label(W - PAD, y, `${msgs.length} messages`, 'end'))
    y += 6
    for (const m of recentMsgs) {
      y += 16
      const route = `${nameOf(agents, m.from)} → ${nameOf(agents, m.to)}`
      out.push(`<text x="${PAD}" y="${y}" font-size="10.5"><tspan font-weight="700" style="fill:${GOLD_HI}">${esc(clip(route, 30))}</tspan><tspan class="dim">  ${esc(clip(m.text.replace(/\s+/g, ' '), Math.max(8, 52 - route.length)))}</tspan></text>`)
      out.push(`<text x="${W - PAD}" y="${y}" font-size="9" text-anchor="end" class="m dim">${ago(now - m.at)}</text>`)
    }
  }

  // Activity
  const recent = beats.slice(-7).reverse()
  if (recent.length) {
    y += 14
    out.push(`<line x1="${PAD}" x2="${W - PAD}" y1="${y}" y2="${y}" stroke="${LINE}"/>`)
    y += 18
    out.push(label(PAD, y, 'ACTIVITY'))
    y += 4
    for (const b of recent) {
      y += 15
      const c = b.kind === 'fail' || b.kind === 'deny' ? RED : b.kind === 'done' ? GOLD : b.kind === 'msg' ? GOLD_HI : b.kind === 'spawn' ? BLUE : PAPER
      out.push(`<rect x="${PAD}" y="${y - 7}" width="3" height="9" rx="1" fill="${c}"/>`)
      out.push(`<text x="${PAD + 10}" y="${y}" font-size="10.5"><tspan font-weight="700">${esc(clip(b.who, 18))}</tspan><tspan class="dim"> ${esc(clip(b.text, Math.max(10, 50 - b.who.length)))}</tspan></text>`)
      out.push(`<text x="${W - PAD}" y="${y}" font-size="9" text-anchor="end" class="m dim">${ago(now - b.at)}</text>`)
    }
  }

  const H = y + PAD
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<style>${CSS}</style>` +
    `<defs><linearGradient id="sw-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PANEL}"/><stop offset="1" stop-color="${INK}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" rx="4" fill="url(#sw-bg)"/>` +
    `<rect x="0" y="0" width="${W}" height="2" fill="${busy ? BLUE : GOLD}" opacity=".8"${busy ? ' class="shim"' : ''}/>` +
    out.join('') +
    `</svg>`
  return { source, width: W, height: H }
}
