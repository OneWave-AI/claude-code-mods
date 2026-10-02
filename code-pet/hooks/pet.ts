/** The pet's rules: pure, so the tests can drive them with a fake clock. */

import type { Mood, Pet, Stage } from '../types'

export const IDLE_MS = 3 * 60 * 1000
export const HUNGER_PER_HOUR = 4
export const STARVE_HP_PER_HOUR = 3

/** How long an event's mood holds before the pet falls back to its resting mood. */
export const MOOD_MS: Record<Mood, number> = {
  idle: 0,
  sleep: 0,
  sad: 0,
  eating: 1800,
  happy: 2600,
  sick: 4500,
  panic: 4000,
  levelup: 4000,
}

/** A new mood replaces a held one only when it ranks at least as high. */
const RANK: Record<Mood, number> = {
  idle: 0,
  sleep: 0,
  sad: 0,
  eating: 1,
  happy: 2,
  sick: 3,
  panic: 4,
  levelup: 5,
}

export type Live = { mood: Mood; until: number; lastActivityAt: number }

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))

export const levelOf = (xp: number) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 8))
export const xpForLevel = (level: number) => 8 * (level - 1) ** 2

export const stageOf = (level: number): Stage =>
  level >= 10 ? 'crowned' : level >= 5 ? 'critter' : level >= 2 ? 'blob' : 'egg'

export const newPet = (now: number, name = 'Byte'): Pet => ({
  name,
  xp: 0,
  hunger: 80,
  hp: 100,
  bornAt: now,
  lastFedAt: now,
  lastTickAt: now,
  meals: 0,
})

/** A stored value back into a pet, or null when it is not one. */
export const revive = (value: unknown): Pet | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const num = (k: string) => (typeof v[k] === 'number' && Number.isFinite(v[k]) ? (v[k] as number) : null)
  const xp = num('xp')
  const bornAt = num('bornAt')
  if (xp === null || bornAt === null || typeof v.name !== 'string') return null
  return {
    name: v.name,
    xp,
    hunger: clamp(num('hunger') ?? 80),
    hp: clamp(num('hp') ?? 100),
    bornAt,
    lastFedAt: num('lastFedAt') ?? bornAt,
    lastTickAt: num('lastTickAt') ?? bornAt,
    meals: num('meals') ?? 0,
  }
}

/** Time passing: hunger drains, and an empty belly drains HP. */
export const decay = (pet: Pet, now: number): Pet => {
  const hours = Math.max(0, now - pet.lastTickAt) / 3.6e6
  if (hours === 0) return pet
  const hunger = clamp(pet.hunger - hours * HUNGER_PER_HOUR)
  const emptyHours = Math.max(0, hours - pet.hunger / HUNGER_PER_HOUR)
  const hp = clamp(pet.hp - emptyHours * STARVE_HP_PER_HOUR)
  return { ...pet, hunger, hp, lastTickAt: now }
}

export type PetEvent =
  | { kind: 'fed' }
  | { kind: 'snack' }
  | { kind: 'failed' }
  | { kind: 'danger' }
  | { kind: 'turn' }
  | { kind: 'activity' }

export type Applied = { pet: Pet; live: Live; leveledTo?: number }

const hold = (live: Live, mood: Mood, now: number): Live =>
  live.until > now && RANK[live.mood] > RANK[mood]
    ? { ...live, lastActivityAt: now }
    : { mood, until: now + MOOD_MS[mood], lastActivityAt: now }

/** One thing that happened, applied to the pet and its mood. */
export const apply = (pet: Pet, live: Live, ev: PetEvent, now: number): Applied => {
  const before = levelOf(pet.xp)
  let next = pet
  let mood: Mood | null = null
  switch (ev.kind) {
    case 'fed':
      next = { ...pet, xp: pet.xp + 2, hunger: clamp(pet.hunger + 4), hp: clamp(pet.hp + 1), lastFedAt: now, meals: pet.meals + 1 }
      mood = 'eating'
      break
    case 'snack':
      next = { ...pet, xp: pet.xp + 1, hunger: clamp(pet.hunger + 20), lastFedAt: now, meals: pet.meals + 1 }
      mood = 'eating'
      break
    case 'failed':
      next = { ...pet, hp: clamp(pet.hp - 6) }
      mood = 'sick'
      break
    case 'danger':
      mood = 'panic'
      break
    case 'turn':
      next = { ...pet, xp: pet.xp + 3, hp: clamp(pet.hp + 2) }
      mood = 'happy'
      break
    case 'activity':
      return { pet, live: { ...live, lastActivityAt: now } }
  }
  const after = levelOf(next.xp)
  if (after > before) {
    return { pet: next, live: hold(live, 'levelup', now), leveledTo: after }
  }
  return { pet: next, live: hold(live, mood, now) }
}

/** The mood with nothing happening: asleep after a quiet spell, sad when hungry or hurt. */
export const restingMood = (pet: Pet, now: number, lastActivityAt: number): Mood =>
  now - lastActivityAt > IDLE_MS ? 'sleep' : pet.hunger < 25 || pet.hp < 30 ? 'sad' : 'idle'

export const moodAt = (pet: Pet, live: Live, now: number): Mood =>
  live.until > now ? live.mood : restingMood(pet, now, live.lastActivityAt)

const DANGER = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive\s+--force|--force\s+--recursive)\b/i,
  /\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\bmkfs\b|\bdd\s+if=/i,
]

export const isDanger = (command: string) => DANGER.some(re => re.test(command))

/** A Bash result that failed even where the tool did not flag it. */
export const isFailedRun = (isError: boolean | undefined, output: string | undefined) =>
  isError === true || /\bexit code [1-9]\d*\b/i.test(output ?? '')

export const ageText = (bornAt: number, now: number) => {
  const minutes = Math.max(0, Math.floor((now - bornAt) / 60000))
  if (minutes < 60) return `${minutes}m old`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h old`
  return `${Math.floor(hours / 24)}d old`
}

export const MOOD_WORD: Record<Mood, string> = {
  idle: 'chilling',
  happy: 'happy',
  eating: 'eating',
  sick: 'sick',
  panic: 'PANICKING',
  sleep: 'asleep',
  sad: 'sad',
  levelup: 'evolving',
}
