/** The pet's pixel art and one animated frame of its room. */

import type { Mood, Stage } from '../types'
import { canvas, encode, mix, rect, set, sprite, text } from './pixels'
import type { Canvas } from './pixels'

const BODY: Record<Stage, readonly string[]> = {
  egg: [
    '....DDDD....',
    '...DBBBBD...',
    '..DBLLBBBD..',
    '..DBLBBBBD..',
    '.DBBBBBBBBD.',
    '.DBBBBBBBBD.',
    '.DBBBBBBBBD.',
    '.DBBBBBBBBD.',
    '.DBBBBBBBBD.',
    '..DBBBBBBD..',
    '...DBBBBD...',
    '....DDDD....',
  ],
  blob: [
    '............',
    '............',
    '....DDDD....',
    '..DDBBBBDD..',
    '.DBBLLBBBBD.',
    '.DBLBBBBBBD.',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    '.DBBBBBBBBD.',
    '..DDDDDDDD..',
  ],
  critter: [
    '.DD......DD.',
    '.DBD....DBD.',
    '.DBBDDDDBBD.',
    '.DBBBBBBBBD.',
    'DBBLLBBBBBBD',
    'DBLBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    '.DBBBBBBBBD.',
    '..DBD..DBD..',
    '..DD....DD..',
  ],
  crowned: [
    '...G.GG.G...',
    '...GGGGGG...',
    '....DDDD....',
    '..DDBBBBDD..',
    '.DBBLLBBBBD.',
    '.DBLBBBBBBD.',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    'DBBBBBBBBBBD',
    '.DBBBBBBBBD.',
    '..DDDDDDDD..',
  ],
}

/** Where the face sits on each body: eye top row, mouth row. */
const FACE: Record<Stage, { eye: number; mouth: number }> = {
  egg: { eye: 5, mouth: 8 },
  blob: { eye: 6, mouth: 9 },
  critter: { eye: 5, mouth: 8 },
  crowned: { eye: 6, mouth: 9 },
}

type Eyes = { left: readonly string[]; right: readonly string[] }
const both = (rows: readonly string[]): Eyes => ({ left: rows, right: rows })

const EYES: Record<Mood | 'blink', Eyes> = {
  idle: both(['WE', 'EE']),
  blink: both(['..', 'EE']),
  happy: { left: ['EE', 'E.'], right: ['EE', '.E'] },
  eating: { left: ['EE', 'E.'], right: ['EE', '.E'] },
  sleep: both(['..', 'EE']),
  sick: { left: ['E.', '.E'], right: ['.E', 'E.'] },
  panic: both(['WW', 'WE']),
  sad: { left: ['E.', 'EE'], right: ['.E', 'EE'] },
  levelup: both(['WW', 'WW']),
}

const MOUTH: Record<Mood, readonly string[]> = {
  idle: ['.EE.'],
  happy: ['E..E', '.EE.'],
  eating: ['.EE.', '.EE.'],
  sleep: ['.EE.'],
  sick: ['.E.E', 'E.E.'],
  panic: ['EEEE', 'EEEE'],
  sad: ['.EE.', 'E..E'],
  levelup: ['E..E', '.EE.'],
}

const stamp = (rows: string[], patch: readonly string[], top: number, left: number) => {
  patch.forEach((line, r) => {
    const row = rows[top + r]
    if (row === undefined) return
    let out = row
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '.') continue
      out = out.slice(0, left + i) + line[i] + out.slice(left + i + 1)
    }
    rows[top + r] = out
  })
}

/** The body with this mood's face drawn on. `chew` closes an eating mouth. */
export const compose = (stage: Stage, mood: Mood, blink: boolean, chew = false) => {
  const rows = [...BODY[stage]]
  const face = FACE[stage]
  const eyes = blink && (mood === 'idle' || mood === 'sad') ? EYES.blink : EYES[mood]
  stamp(rows, eyes.left, face.eye, 3)
  stamp(rows, eyes.right, face.eye, 7)
  stamp(rows, mood === 'eating' && chew ? ['EEEE'] : MOUTH[mood], face.mouth, 4)
  if (mood === 'happy' || mood === 'levelup') {
    stamp(rows, ['P'], face.eye + 2, 2)
    stamp(rows, ['P'], face.eye + 2, 9)
  }
  if (mood === 'sad') stamp(rows, ['T'], face.eye + 2, 3)
  return rows
}

const BG = 0x0b1121
const STAR = 0x2a3550
const GROUND = 0x161d2e
const GROUND_EDGE = 0x2a3348
const BLUE = 0x61a5fa
const GOLD = 0xc2a87e
const GOLD_HI = 0xd4a44a
const RED = 0xe5484d
const PAPER = 0xe8e2d6
const CLOUD = 0x59606e

const BODY_COLORS: Record<Stage, { B: number; L: number; D: number }> = {
  egg: { B: 0xe8e2d6, L: 0xfbf8f1, D: 0x8f8676 },
  blob: { B: 0xc2a87e, L: 0xe3d3b3, D: 0x6e5b3d },
  critter: { B: 0xc9a36a, L: 0xe8d2a6, D: 0x6b5332 },
  crowned: { B: 0x61a5fa, L: 0xa9cdfd, D: 0x2b5a9a },
}

const paletteFor = (stage: Stage, mood: Mood, t: number) => {
  const base = BODY_COLORS[stage]
  let { B, L, D } = base
  if (mood === 'sick') {
    B = mix(B, 0x8f98a3, 0.65)
    L = mix(L, 0xb8bec6, 0.65)
  }
  if (mood === 'sleep') {
    B = mix(B, BG, 0.35)
    L = mix(L, BG, 0.35)
    D = mix(D, BG, 0.25)
  }
  if (mood === 'panic' && Math.floor(t * 8) % 2 === 0) {
    B = RED
    L = 0xf08a8d
    D = 0x7a1f22
  }
  if (mood === 'levelup' && Math.floor(t * 6) % 2 === 0) {
    B = mix(B, 0xffffff, 0.45)
    L = 0xffffff
  }
  return {
    B,
    L,
    D,
    E: 0x1a1410,
    W: 0xfbf8f1,
    T: stage === 'crowned' ? 0xd7e8ff : BLUE,
    P: 0xe08a7a,
    G: GOLD_HI,
  }
}

const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..']
const SPARK = ['.X.', 'XXX', '.X.']

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/** Sprite scale for a scene this wide: double pixels when there is room. */
export const scaleFor = (columns: number) => (columns >= 36 ? 2 : 1)

/** Cell rows the scene takes at this width. */
export const rowsFor = (columns: number) => (scaleFor(columns) === 2 ? 16 : 9)

export type View = { stage: Stage; mood: Mood; caption?: string }

/** One frame of the room at time `t` (seconds), as a canvas. */
export const scene = (columns: number, rows: number, t: number, view: View): Canvas => {
  const w = Math.max(12, columns)
  const h = rows * 2
  const c = canvas(w, h, BG)
  const scale = scaleFor(w)
  const { mood, stage } = view

  // A slow starfield, then the floor.
  for (let i = 0; i < Math.floor(w / 3); i++) {
    const sx = Math.floor(hash(i + 1) * w)
    const sy = Math.floor(hash(i + 50) * (h - 6))
    const twinkle = (Math.sin(t * 1.5 + i) + 1) / 2
    set(c, sx, sy, mix(BG, STAR, 0.3 + twinkle * 0.7))
  }
  rect(c, 0, h - 2, w, 2, GROUND)
  rect(c, 0, h - 2, w, 1, GROUND_EDGE)

  const blink = t % 4.2 < 0.16
  const chew = Math.floor(t * 6) % 2 === 0
  const body = compose(stage, mood, blink, chew)
  const sw = 12 * scale
  const sh = body.length * scale

  const roam = mood === 'idle' || mood === 'happy' || mood === 'sad' || mood === 'eating'
  const room = Math.max(0, w - sw - 4)
  const drift = roam ? Math.sin(t * 0.32) * (room / 2) * 0.8 : 0
  const facingLeft = roam && Math.cos(t * 0.32) < 0
  let x = Math.round((w - sw) / 2 + drift)
  let lift = 0
  if (mood === 'idle' || mood === 'sad') lift = Math.round((Math.sin(t * 3.2) + 1) / 2) * (scale === 2 ? 1 : 0)
  if (mood === 'happy' || mood === 'levelup') lift = Math.round(Math.abs(Math.sin(t * 6.5)) * 4 * scale)
  if (mood === 'eating') lift = chew ? 1 : 0
  if (mood === 'panic') {
    x += Math.floor(t * 20) % 2 === 0 ? -scale : scale
    lift = Math.floor(t * 13) % 3 === 0 ? scale : 0
  }
  if (mood === 'sick') x += Math.round(Math.sin(t * 2) * scale)
  if (mood === 'sleep') lift = 0

  const y = h - 2 - sh - lift
  // Shadow under the pet, smaller as it hops.
  const shadow = Math.max(2, sw - 4 - lift)
  rect(c, x + Math.round((sw - shadow) / 2), h - 2, shadow, 1, mix(GROUND, 0x000000, 0.5))
  sprite(c, body, paletteFor(stage, mood, t), x, y, scale, facingLeft)

  const headX = x + sw / 2
  const top = y

  if (mood === 'sleep') {
    for (let k = 0; k < 3; k++) {
      const phase = (t * 0.45 + k / 3) % 1
      const col = Math.round(headX + sw / 2 - 2 + phase * 6)
      const row = Math.floor((top - phase * 10) / 2)
      text(c, col, row, phase < 0.5 ? 'z' : 'Z', mix(BLUE, BG, phase * 0.8))
    }
  }

  if (mood === 'panic') {
    const on = Math.floor(t * 6) % 2 === 0
    text(c, Math.round(x - 3), Math.floor((top + 2) / 2), on ? '!' : ' ', RED)
    text(c, Math.round(x + sw + 2), Math.floor((top + 4) / 2), on ? ' ' : '!', RED)
    text(c, Math.round(headX - 1), Math.max(0, Math.floor(top / 2) - 2), '!!', RED)
  }

  if (mood === 'sick') {
    const drop = (t * 0.9) % 1
    set(c, x + sw + 1, top + 4 + drop * 8, BLUE)
    set(c, x + sw + 1, top + 5 + drop * 8, mix(BLUE, BG, 0.4))
  }

  if (mood === 'sad') {
    const cx = Math.round(headX - 7)
    const cy = Math.max(0, top - 9)
    rect(c, cx + 2, cy, 10, 2, CLOUD)
    rect(c, cx, cy + 2, 14, 2, CLOUD)
    for (let k = 0; k < 4; k++) {
      const fall = (t * 1.6 + k * 0.27) % 1
      set(c, cx + 2 + k * 3, cy + 4 + fall * 5, BLUE)
    }
  }

  if (mood === 'happy') {
    for (let k = 0; k < 2; k++) {
      const phase = (t * 0.6 + k * 0.5) % 1
      const hx = Math.round(headX + (k === 0 ? -sw / 2 - 5 : sw / 2 + 1) + Math.sin(t * 3 + k) * 1)
      const hy = Math.round(top + 6 - phase * 12)
      sprite(c, HEART, { X: mix(0xe08a7a, BG, phase * 0.7) }, hx, hy)
    }
  }

  if (mood === 'eating') {
    const phase = (t * 1.4) % 1
    const fromX = w - 3
    const mouthX = facingLeft ? x + 2 : x + sw - 4
    const mouthY = y + FACE[stage].mouth * scale
    const px = fromX + (mouthX - fromX) * phase
    const py = mouthY - Math.sin(phase * Math.PI) * 8
    rect(c, Math.round(px), Math.round(py), 2, 2, GOLD)
    text(c, Math.round(headX - 1), Math.max(0, Math.floor(top / 2) - 1), chew ? 'nom' : '', PAPER)
  }

  if (mood === 'levelup') {
    for (let k = 0; k < 5; k++) {
      const a = t * 2.2 + (k * Math.PI * 2) / 5
      const r = sw / 2 + 3 + Math.sin(t * 4 + k) * 2
      sprite(c, SPARK, { X: k % 2 ? GOLD_HI : BLUE }, headX + Math.cos(a) * r - 1, top + sh / 2 + Math.sin(a) * (sh / 2 + 2) - 1)
    }
  }

  const caption = view.caption ?? (mood === 'levelup' ? 'LEVEL UP' : '')
  if (caption) text(c, Math.round((w - caption.length) / 2), 0, caption.toUpperCase(), mood === 'panic' ? RED : GOLD)

  return c
}

/** One frame as Raster cells. */
export const petFrame = (columns: number, rows: number, t: number, view: View) =>
  encode(scene(columns, rows, t, view))
