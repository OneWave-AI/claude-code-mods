/** The shareable card: a title, a 4-wide grid of stat tiles (as many rows as it takes), a footer. */

import type { Card } from './stats'
import { canvas, encodePng, fit, rect, text, textWidth } from './png'

const W = 1200
const TILE_H = 210
const GAP = 18
const PAD = 48

/** The card's height for `count` tiles: 675 for eight, taller per extra row. */
export const cardHeight = (count: number) => {
  const rows = Math.max(1, Math.ceil(count / 4))
  return PAD + 90 + rows * TILE_H + (rows - 1) * GAP + 99
}
const BG = 0x0e0c0a
const TILE = 0x1a1714
const RULE = 0x2a2520
const PAPER = 0xe8e2d6
const MUTED = 0x8a8278
const GOLD = 0xc2a87e
const BLUE = 0x61a5fa

const ACCENT = { gold: GOLD, blue: BLUE, paper: PAPER } as const

export const renderCard = (cards: Card[], dateLabel: string, isDemo: boolean) => {
  const H = cardHeight(cards.length)
  const c = canvas(W, H, BG)
  const pad = PAD

  // Title row.
  rect(c, pad, pad, 10, 42, GOLD)
  text(c, pad + 26, pad, 'CLAUDE CODE', 3, MUTED)
  text(c, pad + 26, pad + 27, 'SESSION WRAPPED', 3, PAPER)
  const right = isDemo ? `${dateLabel}  DEMO` : dateLabel
  text(c, W - pad - textWidth(right, 3), pad + 14, right, 3, GOLD)
  rect(c, pad, pad + 64, W - pad * 2, 2, RULE)

  // Tiles: 4 x 2.
  const top = pad + 90
  const gap = GAP
  const cols = 4
  const tileW = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols)
  const tileH = TILE_H
  cards.forEach((card, i) => {
    const x = pad + (i % cols) * (tileW + gap)
    const y = top + Math.floor(i / cols) * (tileH + gap)
    const accent = ACCENT[card.accent]
    rect(c, x, y, tileW, tileH, TILE)
    rect(c, x, y, tileW, 4, accent)
    text(c, x + 20, y + 24, card.label, 2, MUTED)
    const inner = tileW - 40
    const scale = fit(card.value, inner, 9)
    text(c, x + 20, y + 62 + Math.round((9 - scale) * 3.5), card.value, scale, accent)
    const note = card.note.toUpperCase()
    const noteScale = fit(note, inner, 2)
    text(c, x + 20, y + tileH - 38, note, noteScale, PAPER)
  })

  // Footer.
  const foot = 'MADE WITH A CLAUDE CODE MOD  /WRAPPED'
  text(c, pad, H - pad - 14, foot, 2, MUTED)
  rect(c, W - pad - 120, H - pad - 12, 120, 4, GOLD)
  rect(c, W - pad - 60, H - pad - 4, 60, 4, BLUE)
  return encodePng(c)
}
