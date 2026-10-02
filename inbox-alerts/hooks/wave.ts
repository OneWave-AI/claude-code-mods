/** An animated ocean band for a Raster: block glyphs, blue body, gold foam. */

const DEFAULT = 0x01000000
const BLOCKS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

const BLUE = 0x61a5fa
const DEEP = 0x1e3a6e
const GOLD = 0xc2a87e

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array) => {
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

/** One frame: `columns` x `rows` cells at time `t` (seconds). `energy` 0..1 lifts the swell. */
export const waveFrame = (columns: number, rows: number, t: number, energy = 0) => {
  const words = new Uint32Array(columns * rows * 3)
  const levels = rows * 8
  for (let x = 0; x < columns; x++) {
    const swell =
      Math.sin(x * 0.11 + t * 1.3) * 0.45 +
      Math.sin(x * 0.27 - t * 2.1) * 0.25 +
      Math.sin(x * 0.05 + t * 0.6) * 0.3
    const height = Math.max(1, Math.min(levels, Math.round(((swell + 1) / 2) * levels * (0.55 + 0.4 * energy) + 2)))
    const foam = swell > 0.55
    for (let r = 0; r < rows; r++) {
      const fromBottom = rows - 1 - r
      const fill = Math.max(0, Math.min(8, height - fromBottom * 8))
      const isTop = fill > 0 && fill < 8 ? true : fill === 8 && height - (fromBottom + 1) * 8 <= 0
      const depth = fromBottom / Math.max(1, rows - 1)
      const body = mix(BLUE, DEEP, 1 - depth * 0.8 - 0.1)
      const fg = isTop && foam ? GOLD : body
      const i = (r * columns + x) * 3
      words[i] = BLOCKS[fill]!
      words[i + 1] = fill === 0 ? DEFAULT : fg
      words[i + 2] = DEFAULT
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}
