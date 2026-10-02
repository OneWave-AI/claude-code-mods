/** A tiny pixel canvas packed into Raster cells: two pixels per cell with the upper half block. */

export const DEFAULT = 0x01000000
const HALF = 0x2580

export type Canvas = {
  w: number
  h: number
  px: Uint32Array
  /** Cell index (row * w + col) to a glyph drawn over the pixels. */
  glyphs: Map<number, { ch: number; fg: number }>
}

export const canvas = (w: number, h: number, bg: number): Canvas => ({
  w,
  h,
  px: new Uint32Array(w * h).fill(bg),
  glyphs: new Map(),
})

export const set = (c: Canvas, x: number, y: number, color: number) => {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= c.w || py >= c.h) return
  c.px[py * c.w + px] = color
}

export const get = (c: Canvas, x: number, y: number) => c.px[y * c.w + x] ?? 0

/** Text over the pixels, in cell coordinates (one cell = one column, two pixel rows). */
export const text = (c: Canvas, col: number, row: number, s: string, fg: number) => {
  const rows = c.h / 2
  for (let i = 0; i < s.length; i++) {
    const x = Math.round(col) + i
    const r = Math.round(row)
    if (x < 0 || x >= c.w || r < 0 || r >= rows) continue
    const ch = s.charCodeAt(i)
    if (ch === 0x20) continue
    c.glyphs.set(r * c.w + x, { ch, fg })
  }
}

/** Draws `rows` (one char per pixel, '.' transparent) at x,y, each pixel `scale` square. */
export const sprite = (
  c: Canvas,
  rows: readonly string[],
  palette: Record<string, number>,
  x: number,
  y: number,
  scale = 1,
  flip = false,
) => {
  const ox = Math.round(x)
  const oy = Math.round(y)
  rows.forEach((line, r) => {
    for (let i = 0; i < line.length; i++) {
      const ch = line[flip ? line.length - 1 - i : i]!
      const color = palette[ch]
      if (ch === '.' || color === undefined) continue
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) set(c, ox + i * scale + sx, oy + r * scale + sy, color)
      }
    }
  })
}

export const rect = (c: Canvas, x: number, y: number, w: number, h: number, color: number) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(c, x + i, y + j, color)
}

export const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const toBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

/** The canvas as RasterProps cells: `w` columns by `h / 2` rows. */
export const words = (c: Canvas) => {
  const rows = Math.floor(c.h / 2)
  const out = new Uint32Array(c.w * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < c.w; x++) {
      const top = get(c, x, r * 2)
      const bottom = get(c, x, r * 2 + 1)
      const i = (r * c.w + x) * 3
      const g = c.glyphs.get(r * c.w + x)
      out[i] = g ? g.ch : HALF
      out[i + 1] = g ? g.fg : top
      out[i + 2] = g ? mix(top, bottom, 0.5) : bottom
    }
  }
  return out
}

export const encode = (c: Canvas) => toBase64(new Uint8Array(words(c).buffer))
