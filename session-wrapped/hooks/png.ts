/** A tiny RGB canvas, a bitmap-font text painter and a store-only PNG encoder. */

import { GLYPH_H, GLYPH_W, lit, printable } from './font'

export type Canvas = { width: number; height: number; px: Uint8Array }

export const canvas = (width: number, height: number, color: number): Canvas => {
  const px = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    px[i * 3] = (color >> 16) & 0xff
    px[i * 3 + 1] = (color >> 8) & 0xff
    px[i * 3 + 2] = color & 0xff
  }
  return { width, height, px }
}

export const rect = (c: Canvas, x: number, y: number, w: number, h: number, color: number) => {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(c.width, Math.floor(x + w))
  const y1 = Math.min(c.height, Math.floor(y + h))
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * c.width + xx) * 3
      c.px[i] = (color >> 16) & 0xff
      c.px[i + 1] = (color >> 8) & 0xff
      c.px[i + 2] = color & 0xff
    }
  }
}

/** Width in pixels of `text` at `scale` (one blank column between glyphs). */
export const textWidth = (text: string, scale: number) =>
  Math.max(0, [...text].length * (GLYPH_W + 1) * scale - scale)

/** Paints `text` with its top-left at (x, y), each font pixel a `scale` square. */
export const text = (c: Canvas, x: number, y: number, value: string, scale: number, color: number) => {
  const chars = [...printable(value)]
  chars.forEach((ch, n) => {
    const ox = x + n * (GLYPH_W + 1) * scale
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (lit(ch, gx, gy)) rect(c, ox + gx * scale, y + gy * scale, scale, scale, color)
      }
    }
  })
}

/** The largest scale up to `max` at which `value` fits in `width`. */
export const fit = (value: string, width: number, max: number) => {
  for (let s = max; s > 1; s--) if (textWidth(value, s) <= width) return s
  return 1
}

// --- PNG -----------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length) => {
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export const adler32 = (bytes: Uint8Array) => {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** zlib around stored (uncompressed) deflate blocks: valid everywhere, no compressor needed. */
export const zlibStore = (raw: Uint8Array) => {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535))
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  out[0] = 0x78
  out[1] = 0x01
  let at = 2
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535
    const len = Math.min(65535, raw.length - start)
    out[at++] = b === blocks - 1 ? 1 : 0
    out[at++] = len & 0xff
    out[at++] = len >> 8
    out[at++] = ~len & 0xff
    out[at++] = (~len >> 8) & 0xff
    out.set(raw.subarray(start, start + len), at)
    at += len
  }
  const sum = adler32(raw)
  out[at++] = sum >>> 24
  out[at++] = (sum >>> 16) & 0xff
  out[at++] = (sum >>> 8) & 0xff
  out[at++] = sum & 0xff
  return out
}

const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

export const encodePng = (c: Canvas) => {
  const stride = c.width * 3
  const raw = new Uint8Array((stride + 1) * c.height)
  for (let y = 0; y < c.height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(c.px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, c.width)
  hv.setUint32(4, c.height)
  header[8] = 8
  header[9] = 2
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', header),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const toBase64 = (bytes: Uint8Array) => {
  const parts: string[] = []
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
    if (out.length >= 8192) {
      parts.push(out)
      out = ''
    }
  }
  parts.push(out)
  return parts.join('')
}
