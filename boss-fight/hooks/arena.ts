/** The arena: a pixel boss, its HP bar, hits, KO and the hero's cursor. */

import type { Fight } from '../types'
import { phaseAt } from './fight'
import { canvas, encode, mix, rect, set, sprite, text } from './pixels'

/** Three boss bodies, 16 x 14, picked by `kind % 3`; palette swaps by kind. */
const BODIES: readonly (readonly string[])[] = [
  [
    '..H..........H..',
    '..HH........HH..',
    '...HDDDDDDDDH...',
    '..DBBBBBBBBBBD..',
    '.DBBBBBBBBBBBBD.',
    '.DBWWEBBBBWWEBD.',
    'DBBWEEBBBBWEEBBD',
    'DBBBBBBBBBBBBBBD',
    'DBBBTMTMTMTMBBBD',
    'DBBBMMMMMMMMBBBD',
    '.DBBBBBBBBBBBBD.',
    '.DBBLBBBBBBLBBD.',
    '..DDLD....DLDD..',
    '...DD......DD...',
  ],
  [
    '.....DDDDDD.....',
    '...DDBBBBBBDD...',
    '..DBBBBBBBBBBD..',
    '.DBBWWEBBWWEBBD.',
    '.DBBWEEBBWEEBBD.',
    'DBBBBBBBBBBBBBBD',
    'DBBBBMMMMMMBBBBD',
    'DBBBBMTMTMTBBBBD',
    'DBBBBBBBBBBBBBBD',
    '.DBBBBBBBBBBBBD.',
    '.DBDBBDBBDBBDBD.',
    '.DD.DD.DD.DD.DD.',
    'DD...DD..DD...DD',
    '................',
  ],
  [
    'H..............H',
    'HH....DDDD....HH',
    '.HH.DDBBBBDD.HH.',
    '..HDBBBBBBBBDH..',
    '...DBWEBBWEBD...',
    '..DBBEEBBEEBBD..',
    '..DBBBBBBBBBBD..',
    '.DBBBTMTTMTBBBD.',
    'DBLBBMMMMMMBBLBD',
    'DBLBBBBBBBBBBLBD',
    'DBLDBBBBBBBBDLBD',
    '.D.DBBBBBBBBD.D.',
    '...DBBD..DBBD...',
    '...DDD....DDD...',
  ],
]

const SKINS: readonly { B: number; D: number; L: number; H: number }[] = [
  { B: 0x8a3a3a, D: 0x3d1414, L: 0xb85c4e, H: 0xc2a87e },
  { B: 0x3f5a85, D: 0x16233a, L: 0x61a5fa, H: 0xe8e2d6 },
  { B: 0x7a6248, D: 0x2e2216, L: 0xc2a87e, H: 0xd4a44a },
  { B: 0x4a4f5c, D: 0x1a1c22, L: 0x8a90a0, H: 0xe5484d },
]

const BG = 0x0b1121
const FLOOR = 0x141b2b
const FLOOR_LINE = 0x252e44
const GOLD = 0xc2a87e
const GOLD_HI = 0xd4a44a
const BLUE = 0x61a5fa
const RED = 0xe5484d
const PAPER = 0xe8e2d6
const WHITE = 0xffffff

const CURSOR = ['X...', 'XX..', 'XXX.', 'XXXX', 'XX..', '.X..']

/** Cell rows the arena takes. */
export const ARENA_ROWS = 14

const hash = (n: number) => {
  const x = Math.sin(n * 91.7) * 43758.5453
  return x - Math.floor(x)
}

/** One frame at `now` (epoch ms), `columns` wide and `rows` cells tall. */
export const arena = (columns: number, rows: number, now: number, fight: Fight) => {
  const w = Math.max(20, columns)
  const h = rows * 2
  const c = canvas(w, h, BG)
  const t = now / 1000
  const phase = phaseAt(fight, now)
  const since = now - fight.phaseAt

  // Torches on the back wall, the floor in perspective.
  for (const tx of [3, w - 5]) {
    rect(c, tx, 6, 2, 6, 0x2a2018)
    const flick = Math.sin(t * 9 + tx) * 0.5 + 0.5
    rect(c, tx, 3, 2, 3, mix(GOLD, GOLD_HI, flick))
    set(c, tx + (flick > 0.5 ? 1 : 0), 2, mix(RED, GOLD_HI, flick))
  }
  rect(c, 0, h - 5, w, 5, FLOOR)
  rect(c, 0, h - 5, w, 1, FLOOR_LINE)
  for (let x = 0; x < w; x += 6) set(c, x + ((x / 6) % 2) * 3, h - 3, FLOOR_LINE)

  if (fight.phase === 'none') {
    text(c, Math.round((w - 20) / 2), Math.floor(rows / 2) - 1, 'THE ARENA IS QUIET', PAPER)
    text(c, Math.round((w - 26) / 2), Math.floor(rows / 2) + 1, 'run your tests to summon', mix(PAPER, BG, 0.4))
    return encode(c)
  }

  const body = BODIES[fight.kind % BODIES.length]!
  const skin = SKINS[fight.kind % SKINS.length]!
  const scale = w >= 50 ? 2 : 1
  const bw = 16 * scale
  const bh = body.length * scale
  let bx = Math.round((w - bw) / 2) + 4
  let by = h - 4 - bh

  let palette: Record<string, number> = { ...skin, W: PAPER, E: RED, M: 0x1a0c0c, T: PAPER }
  if (phase === 'idle') by += Math.round((Math.sin(t * 2.4) + 1) / 2)
  if (phase === 'spawn') {
    // Rises out of the floor.
    const k = Math.min(1, since / 1200)
    by = h - 4 - Math.round(bh * k)
  }
  if (phase === 'hit') {
    bx += Math.round(Math.sin(since / 25) * 3 * Math.max(0, 1 - since / 700))
    if (since < 450 && Math.floor(since / 75) % 2 === 0) {
      palette = Object.fromEntries(Object.keys(palette).map(k => [k, WHITE]))
    }
  }
  if (phase === 'heal') palette = { ...palette, B: mix(skin.B, RED, 0.4 + 0.3 * Math.sin(since / 80)) }
  if (phase === 'ko') {
    // Sinks and fades into the floor.
    const k = Math.min(1, since / 1600)
    by += Math.round(bh * k * 0.9)
    palette = Object.fromEntries(Object.entries(palette).map(([key, v]) => [key, mix(v, BG, k * 0.8)]))
  }

  if (!(phase === 'ko' && since > 1700)) {
    rect(c, bx + 2, h - 4, bw - 4, 1, mix(FLOOR, 0x000000, 0.5))
    sprite(c, body, palette, bx, by, scale)
    // Clip what sank below the floor line.
    if (phase === 'spawn' || phase === 'ko') {
      rect(c, 0, h - 4, w, 4, FLOOR)
      for (let x = 0; x < w; x += 6) set(c, x + ((x / 6) % 2) * 3, h - 3, FLOOR_LINE)
    }
  }

  // The hero: a cursor that lunges on a hit.
  const lunge = phase === 'hit' ? Math.max(0, 1 - Math.abs(since - 150) / 300) : 0
  const hx = 4 + Math.round(lunge * Math.max(0, bx - 10))
  sprite(c, CURSOR, { X: phase === 'ko' ? GOLD_HI : BLUE }, hx, h - 12, scale)

  // Slash streak on contact.
  if (phase === 'hit' && since > 100 && since < 450) {
    for (let i = 0; i < bh; i++) set(c, bx + i * 0.6 + 2, by + bh - i, mix(WHITE, GOLD, i / bh))
  }

  // Damage number rising off the boss.
  if ((phase === 'hit' || phase === 'heal' || phase === 'ko') && since < 1400 && fight.delta !== 0) {
    const label = fight.delta > 0 ? `-${fight.delta}` : `+${-fight.delta}`
    const row = Math.max(0, Math.floor(by / 2) - 1 - Math.floor(since / 350))
    text(c, bx + bw + 1, row, label, fight.delta > 0 ? GOLD_HI : RED)
  }

  // KO: sparks, then the banner.
  if (phase === 'ko') {
    for (let i = 0; i < 18; i++) {
      const a = hash(i) * Math.PI * 2
      const r = Math.min(1, since / 900) * (8 + hash(i + 9) * 18)
      const life = Math.max(0, 1 - since / 2000)
      if (life > 0) set(c, bx + bw / 2 + Math.cos(a) * r * 1.6, by + bh / 2 + Math.sin(a) * r, mix(BG, i % 2 ? GOLD_HI : BLUE, life))
    }
    if (since > 900) {
      const blink = Math.floor(t * 3) % 2 === 0
      text(c, Math.round((w - 7) / 2), 1, 'VICTORY', blink ? GOLD_HI : GOLD)
    }
  }

  if (phase === 'spawn' && since < 1500 && Math.floor(t * 6) % 2 === 0) {
    text(c, Math.round((w - 15) / 2), 1, 'A BOSS APPEARS', RED)
  }

  return encode(c)
}
