/** Crowd effects synthesized in code: 16-bit mono PCM WAVs, base64 for $.audio.play. */

import type { Fx } from '../types'

export const RATE = 22050

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

/** Wraps samples in -1..1 as a WAV file. */
export const wav = (samples: Float32Array) => {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(44 + i * 2, Math.round(s * 32767), true)
  }
  return bytes
}

/** A seeded generator so the effects are the same every time. */
const noise = (seed: number) => {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) / 0xffffffff) * 2 - 1
  }
}

/** Stadium roar: band-limited noise that swells and fades, with scattered claps. */
export const cheer = (seconds = 2.6) => {
  const n = Math.floor(RATE * seconds)
  const out = new Float32Array(n)
  const rand = noise(7)
  let low = 0
  let lower = 0
  let clap = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env = Math.min(1, t / 0.18) * Math.pow(1 - t, 1.4)
    const r = rand()
    low += (r - low) * 0.35 // lowpass ~ 2.5 kHz
    lower += (low - lower) * 0.04 // strip the rumble below
    if (rand() > 0.9993) clap = 1
    clap *= 0.992
    const wobble = 0.75 + 0.25 * Math.sin(i * 0.0021) * Math.sin(i * 0.00057)
    out[i] = ((low - lower) * 1.6 * wobble + r * clap * 0.35) * env * 0.8
  }
  return out
}

/** A crowd boo: detuned low voices on "oo", gliding down. */
export const boo = (seconds = 2.0) => {
  const n = Math.floor(RATE * seconds)
  const out = new Float32Array(n)
  const rand = noise(11)
  const voices = [98, 103, 110, 117, 124, 131]
  const phase = voices.map(() => 0)
  let breath = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env = Math.min(1, t / 0.12) * Math.pow(1 - t, 0.9)
    let s = 0
    voices.forEach((f, v) => {
      const freq = f * (1 - 0.12 * t) * (1 + 0.004 * Math.sin(i * 0.0007 * (v + 1)))
      phase[v] = (phase[v]! + freq / RATE) % 1
      const p = phase[v]!
      s += Math.sin(2 * Math.PI * p) + 0.35 * Math.sin(4 * Math.PI * p) + 0.12 * Math.sin(6 * Math.PI * p)
    })
    breath += (rand() - breath) * 0.08
    out[i] = (s / voices.length * 0.7 + breath * 0.25) * env * 0.75
  }
  return out
}

/** A sharp crowd intake of breath: a fast noise rise that cuts off. */
export const gasp = (seconds = 0.9) => {
  const n = Math.floor(RATE * seconds)
  const out = new Float32Array(n)
  const rand = noise(23)
  let low = 0
  let lower = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    const env = Math.pow(Math.min(1, t / 0.55), 2) * (t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1)
    const r = rand()
    low += (r - low) * 0.5
    lower += (low - lower) * 0.08
    out[i] = (low - lower) * env * 1.4
  }
  return out
}

const cache = new Map<Exclude<Fx, null>, string>()

/** The effect as base64 WAV, synthesized once. */
export const fxClip = (fx: Exclude<Fx, null>) => {
  let clip = cache.get(fx)
  if (!clip) {
    clip = toBase64(wav(fx === 'cheer' ? cheer() : fx === 'boo' ? boo() : gasp()))
    cache.set(fx, clip)
  }
  return clip
}
