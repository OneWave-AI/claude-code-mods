import { describe, expect, test } from 'claude-code/testing'

import { Booth, DEMO, Slot, speakable, turnPlay } from '../hooks/logic'
import { RATE, boo, cheer, fxClip, wav } from '../hooks/wav'

const bash = (command: string) => ({ tool: 'Bash', input: { command } })

describe('booth', () => {
  test('a run of reads is called once as scouting', async () => {
    const booth = new Booth()
    expect(booth.before({ tool: 'Read', input: {} }, 0)?.weight).toBe(1)
    expect(booth.before({ tool: 'Grep', input: {} }, 1)).toBe(null)
    expect(booth.before({ tool: 'Glob', input: {} }, 2)).toBe(null)
    booth.before(bash('ls'), 3)
    expect(booth.before({ tool: 'Read', input: {} }, 4)?.weight).toBe(1)
  })

  test('tests passing after failing is the big comeback', async () => {
    const booth = new Booth()
    const run = bash('npm test')
    expect(booth.after(run, { isError: true, text: '3 failed' }, 0)?.fx).toBe('boo')
    const comeback = booth.after(run, { isError: false, text: '42 passed' }, 1)
    expect(comeback?.weight).toBe(3)
    expect(comeback?.fx).toBe('cheer')
    expect(booth.after(run, { isError: false, text: '42 passed' }, 2)?.weight).toBe(2)
  })

  test('danger and git moments are big', async () => {
    const booth = new Booth()
    expect(booth.before(bash('rm -rf build'), 0)?.fx).toBe('gasp')
    expect(booth.before(bash('git push --force origin main'), 0)?.weight).toBe(3)
    expect(booth.before(bash('git reset --hard HEAD~1'), 0)?.fx).toBe('boo')
    expect(booth.before(bash('git commit -m x'), 0)?.weight).toBe(2)
  })

  test('long turns and interrupts', async () => {
    expect(turnPlay(5000, false, 0)).toBe(null)
    expect(turnPlay(120000, false, 0)?.weight).toBe(3)
    expect(turnPlay(1000, true, 0)?.fx).toBe('boo')
  })
})

describe('slot', () => {
  const play = (weight: 1 | 2 | 3, at = 0) => ({ text: `w${weight}`, weight, fx: null, fallback: '', at })

  test('holds one play; a smaller one never bumps a bigger one', async () => {
    const slot = new Slot()
    slot.offer(play(3))
    slot.offer(play(1))
    expect(slot.take(0)?.weight).toBe(3)
    expect(slot.take(0)).toBe(null)
    slot.offer(play(1))
    slot.offer(play(2))
    expect(slot.take(0)?.weight).toBe(2)
  })

  test('stale plays expire', async () => {
    const slot = new Slot(1000)
    slot.offer(play(1, 0))
    expect(slot.take(5000)).toBe(null)
  })
})

describe('lines', () => {
  test('replies are cleaned to one short line', async () => {
    expect(speakable('"And he SCORES!"\nextra')).toBe('And he SCORES!')
    expect(speakable('**What** a play')).toBe('What a play')
    expect(speakable(Array(30).fill('word').join(' ')).split(' ').length).toBe(16)
  })

  test('the demo runs about 25 to 40 seconds', async () => {
    const total = DEMO.reduce((sum, [delay]) => sum + delay, 0)
    expect(total > 25000 && total < 40000).toBe(true)
  })
})

describe('wav', () => {
  test('a valid PCM header and length', async () => {
    const bytes = wav(cheer(0.5))
    const text = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4))
    expect(text(0)).toBe('RIFF')
    expect(text(8)).toBe('WAVE')
    expect(text(36)).toBe('data')
    const view = new DataView(bytes.buffer)
    expect(view.getUint32(24, true)).toBe(RATE)
    expect(view.getUint32(40, true)).toBe(Math.floor(RATE * 0.5) * 2)
  })

  test('effects are audible and never clip', async () => {
    for (const samples of [cheer(), boo()]) {
      let peak = 0
      for (const s of samples) peak = Math.max(peak, Math.abs(s))
      expect(peak > 0.1 && peak <= 1).toBe(true)
    }
    expect(fxClip('gasp').startsWith('UklGR')).toBe(true)
  })
})
