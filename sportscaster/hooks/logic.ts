/** Pure play-by-play logic: what happened, how big it was, and what to say when the model is out. */

import type { Fx } from '../types'

/** 0 skip, 1 routine, 2 notable, 3 big moment. */
export type Weight = 0 | 1 | 2 | 3

export type Play = {
  /** What happened, plainly, for the announcer prompt. */
  text: string
  weight: Weight
  fx: Fx
  /** Said when the model call fails. */
  fallback: string
  at: number
}

const SCOUTING = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const TEST_RUN = /\b(npm (run )?test|pnpm (run )?test|yarn test|bun test|vitest|jest|pytest|go test|cargo test|claude plugin test|playwright test|rspec|phpunit)\b/

const base = (path: string) => path.split('/').filter(Boolean).pop() ?? path

const clip = (text: string, words: number) => {
  const list = text.trim().split(/\s+/).filter(Boolean)
  return list.length > words ? `${list.slice(0, words).join(' ')}...` : list.join(' ')
}

const pick = <T>(list: readonly T[], seed: number) => list[Math.abs(Math.floor(seed)) % list.length]!

const countLines = (text: unknown) => (typeof text === 'string' && text ? text.split('\n').length : 0)

export type CallInfo = { tool: string; input: Record<string, unknown> }

/** Tracks streaks and test state across calls; one per session. */
export class Booth {
  scoutStreak = 0
  hasFailingTests = false

  /** Called as a tool call starts. Big outcomes come from `after`. */
  before(call: CallInfo, at: number): Play | null {
    const { tool, input } = call
    if (SCOUTING.has(tool)) {
      this.scoutStreak += 1
      return this.scoutStreak === 1
        ? { text: `Claude starts reading through the codebase (${tool})`, weight: 1, fx: null, fallback: pick(SCOUT_LINES, at), at }
        : null
    }
    this.scoutStreak = 0

    if (tool === 'Edit' || tool === 'MultiEdit') {
      const file = base(String(input.file_path ?? 'a file'))
      const size = countLines(input.new_string)
      return {
        text: `Claude edits ${file}, ${size} line${size === 1 ? '' : 's'} going in`,
        weight: size > 40 ? 2 : 1,
        fx: null,
        fallback: size > 40 ? `A massive ${size}-line edit to ${file}! Bold play!` : `Quick edit on ${file}. Clean footwork.`,
        at,
      }
    }
    if (tool === 'Write') {
      const file = base(String(input.file_path ?? 'a file'))
      const size = countLines(input.content)
      return {
        text: `Claude writes a whole file from scratch: ${file}, ${size} lines`,
        weight: 2,
        fx: null,
        fallback: `Brand new file, ${file}, ${size} lines! From scratch!`,
        at,
      }
    }
    if (tool === 'Agent' || tool === 'Task') {
      return {
        text: `Claude sends a subagent off the bench: ${clip(String(input.description ?? 'a helper'), 8)}`,
        weight: 2,
        fx: 'cheer',
        fallback: 'Substitution! A fresh subagent comes off the bench!',
        at,
      }
    }
    if (tool === 'Bash') {
      const command = String(input.command ?? '')
      if (/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/.test(command)) {
        return { text: `Claude goes for rm -rf: ${clip(command, 6)}`, weight: 3, fx: 'gasp', fallback: 'Oh no. He is going for rm dash r f. Hide the children!', at }
      }
      if (/\bgit (revert|reset --hard)|\bgit checkout -- |\bgit restore\b/.test(command)) {
        return { text: 'Claude throws the play away and reverts the changes', weight: 3, fx: 'boo', fallback: 'He is reverting! The whole play, wiped off the board!', at }
      }
      if (/\bgit push\b/.test(command)) {
        return { text: `Claude pushes to the remote${/--force|-f\b/.test(command) ? ' WITH FORCE' : ''}`, weight: 3, fx: /--force|-f\b/.test(command) ? 'gasp' : null, fallback: /--force/.test(command) ? 'A FORCE PUSH! The crowd cannot believe it!' : 'He pushes! It is heading to the remote!', at }
      }
      if (/\bgit commit\b/.test(command)) {
        return { text: 'Claude commits the work', weight: 2, fx: null, fallback: 'And he commits! That one is on the record!', at }
      }
      if (TEST_RUN.test(command)) {
        return { text: 'Claude runs the test suite. Everyone holds their breath', weight: 2, fx: null, fallback: 'Here come the tests. You could hear a pin drop.', at }
      }
      return { text: `Claude runs a shell command: ${clip(command, 6)}`, weight: 1, fx: null, fallback: pick(SHELL_LINES, at), at }
    }
    if (tool === 'WebSearch' || tool === 'WebFetch') {
      return { text: 'Claude goes to the web for research', weight: 1, fx: null, fallback: 'He is checking the scouting report online.', at }
    }
    if (tool.startsWith('mcp__')) {
      const server = tool.split('__')[1] ?? 'a server'
      return { text: `Claude calls in a play from ${server.replace(/_/g, ' ')}`, weight: 1, fx: null, fallback: `Calling in help from ${server.replace(/_/g, ' ')}.`, at }
    }
    return null
  }

  /** Called with the call's outcome. */
  after(call: CallInfo, outcome: { isError: boolean; text: string }, at: number): Play | null {
    if (call.tool !== 'Bash') {
      return outcome.isError && (call.tool === 'Edit' || call.tool === 'Write')
        ? { text: `Claude's ${call.tool} on ${base(String(call.input.file_path ?? 'the file'))} bounces off`, weight: 2, fx: 'boo', fallback: 'Off the post! The edit does not land!', at }
        : null
    }
    const command = String(call.input.command ?? '')
    if (!TEST_RUN.test(command)) {
      return outcome.isError ? { text: 'The shell command fails', weight: 1, fx: null, fallback: 'Fumble! The command comes back red.', at } : null
    }
    const isFailing = outcome.isError || /\b[1-9]\d* (failed|failing|failures?)\b|\bFAIL\b/.test(outcome.text)
    const wasFailing = this.hasFailingTests
    this.hasFailingTests = isFailing
    if (isFailing) {
      return { text: 'The tests FAIL', weight: 2, fx: 'boo', fallback: pick(FAIL_LINES, at), at }
    }
    return wasFailing
      ? { text: 'COMEBACK: the tests were failing and now they ALL PASS', weight: 3, fx: 'cheer', fallback: 'THE TESTS PASS! WHAT A COMEBACK! UNBELIEVABLE!', at }
      : { text: 'The tests pass, all green', weight: 2, fx: 'cheer', fallback: 'All green! The tests pass!', at }
  }
}

/** The end of a turn: long ones are the headline. */
export const turnPlay = (durationMs: number, isAborted: boolean, at: number): Play | null => {
  const seconds = Math.round(durationMs / 1000)
  if (isAborted) {
    return { text: 'The user interrupts and blows the whistle', weight: 3, fx: 'boo', fallback: 'Whistle! The user stops play!', at }
  }
  if (seconds >= 90) {
    const minutes = Math.round(seconds / 60)
    return { text: `Claude finishes a marathon ${minutes}-minute turn`, weight: 3, fx: 'cheer', fallback: `${minutes} minutes! He goes the distance! What a performance!`, at }
  }
  if (seconds >= 20) {
    return { text: `Claude wraps the turn after ${seconds} seconds`, weight: 1, fx: null, fallback: 'And that is the end of the drive.', at }
  }
  return null
}

/**
 * One pending play at a time: a newer play takes the slot unless the one waiting
 * is bigger. Stale plays expire so commentary never lags the action.
 */
export class Slot {
  private play: Play | null = null

  constructor(private readonly maxAgeMs = 8000) {}

  offer(play: Play | null) {
    if (!play || play.weight === 0) return
    if (this.play && this.play.weight > play.weight) return
    this.play = play
  }

  take(now: number): Play | null {
    const play = this.play
    this.play = null
    if (!play) return null
    const maxAge = play.weight >= 3 ? this.maxAgeMs * 2 : this.maxAgeMs
    return now - play.at > maxAge ? null : play
  }

  get isEmpty() {
    return this.play === null
  }
}

export const ANNOUNCER = [
  'You are a hyped, witty TV sports play-by-play announcer calling a live coding session as if it were a championship game.',
  'The player is Claude, an AI coding agent. Call the play you are given in ONE line of at most 14 words.',
  'Plain spoken text only: no emojis, no hashtags, no quotes, no stage directions, no markdown.',
  'Match the energy to the moment: routine plays are dry, big moments are explosive.',
  'Never insult the human user. Do not repeat your earlier lines.',
].join(' ')

export const announcerPrompt = (play: Play, recent: readonly string[]) =>
  [
    recent.length ? `Your last calls (do not repeat them):\n${recent.map(l => `- ${l}`).join('\n')}\n` : '',
    `Moment size: ${['', 'routine', 'notable', 'BIG MOMENT'][play.weight]}`,
    `The play: ${play.text}`,
  ].join('\n')

/** Cleans a model reply into one speakable line. */
export const speakable = (reply: string) => {
  const line = (reply.split('\n').find(l => l.trim()) ?? '')
    .replace(/[*_#`"“”]/g, '')
    .replace(/^\s*[-–]\s*/, '')
    .replace(/[^\x20-\x7E’']/g, '')
    .trim()
  return clip(line, 16)
}

const SCOUT_LINES = [
  'He is scouting the codebase. Studying the tape.',
  'Reading the defense. Looking for an opening.',
  'Claude is in the film room right now.',
]
const SHELL_LINES = ['Down to the terminal he goes.', 'A quick shell command. Keeping it moving.', 'Straight to the command line.']
const FAIL_LINES = ['The tests come back red! That is going to sting.', 'Failures on the board! The crowd groans!', 'Red across the board. He needs a new game plan.']

/** The scripted broadcast for /caster demo: [delay after the previous line, line, fx]. */
export const DEMO: ReadonlyArray<readonly [number, string, Fx]> = [
  [0, 'Good evening and welcome to the terminal. Claude takes the field.', 'cheer'],
  [4200, 'He is scouting the codebase. Studying the tape.', null],
  [3600, 'Edit on auth dot t s. Four hundred lines. Bold play.', null],
  [4200, 'Here come the tests. You could hear a pin drop.', null],
  [3400, 'Red across the board! Three failures! The crowd groans!', 'boo'],
  [4300, 'He is back in the file. Something is cooking.', null],
  [3400, 'Tests again. This is it.', null],
  [2600, 'THEY PASS! ALL GREEN! WHAT A COMEBACK!', 'cheer'],
  [4400, 'He commits! He pushes! That is game!', 'cheer'],
]
