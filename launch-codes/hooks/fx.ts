/** The red alert's sound and pixels: a synthesized siren WAV and hazard-stripe Raster frames. */

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

const RATE = 11025

/** A mono 8-bit WAV around `samples` (each -1..1). */
export const wav = (samples: Float32Array) => {
  const bytes = new Uint8Array(44 + samples.length)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  text(36, 'data')
  view.setUint32(40, samples.length, true)
  for (let i = 0; i < samples.length; i++) {
    bytes[44 + i] = Math.max(0, Math.min(255, Math.round(128 + samples[i]! * 110)))
  }
  return bytes
}

/** One wail of a siren: a sweep up and back down, 1.4 s, square-ish so it cuts through. */
export const sirenWav = () => {
  const seconds = 1.4
  const n = Math.round(RATE * seconds)
  const out = new Float32Array(n)
  let phase = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    const sweep = t < 0.5 ? t * 2 : (1 - t) * 2
    const freq = 620 + 760 * sweep
    phase += (2 * Math.PI * freq) / RATE
    const tone = Math.tanh(Math.sin(phase) * 3) * 0.7 + Math.sin(phase * 2) * 0.15
    out[i] = tone * 0.8
  }
  return toBase64(wav(out))
}

/** A short rising confirm chirp: three steps, for LAUNCH. */
export const launchWav = () => {
  const steps = [523, 784, 1046]
  const each = Math.round(RATE * 0.12)
  const out = new Float32Array(each * steps.length)
  steps.forEach((freq, s) => {
    for (let i = 0; i < each; i++) {
      const env = Math.min(1, i / 60) * Math.min(1, (each - i) / 200)
      out[s * each + i] = Math.sin((2 * Math.PI * freq * i) / RATE) * 0.7 * env
    }
  })
  return toBase64(wav(out))
}

const DEFAULT = 0x01000000
const RED = 0xe5484d
const DEEP = 0x5a0f12
const BLACK = 0x0a0606
const GOLD = 0xc2a87e

/**
 * A hazard band `columns` x `rows`: diagonal red/black stripes marching at
 * time `t` (seconds), the whole band flashing between bright and deep red.
 */
export const hazardCells = (columns: number, rows: number, t: number, isArmed = false) => {
  const words = new Uint32Array(columns * rows * 3)
  const flash = Math.floor(t * 2.5) % 2 === 0
  const hot = isArmed ? GOLD : flash ? RED : DEEP
  const shift = Math.floor(t * 10)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < columns; x++) {
      const i = (r * columns + x) * 3
      const stripe = Math.floor((x + r + shift) / 3) % 2 === 0
      words[i] = 0x2588
      words[i + 1] = stripe ? hot : BLACK
      words[i + 2] = DEFAULT
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}
