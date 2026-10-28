import { describe, expect, it } from 'vitest'
import { factText } from './carState'

describe('a fact about a shared car', () => {
  it('says what is known and who noted it', () => {
    const line = factText({ value: 12182, at: '2026-03-03T16:40:00Z', by: 'Ana', estimated: false }, (v) => `${v} km`)
    expect(line.value).toBe('12182 km')
    expect(line.sub).toMatch(/^Ana, /)
    expect(line.guessed).toBe(false)
  })
  it('marks a guess', () => {
    const line = factText({ value: 12364, at: '2026-03-03T16:40:00Z', by: 'Ana', estimated: true }, (v) => `${v} km`)
    expect(line.value).toBe('about 12364 km')
    expect(line.guessed).toBe(true)
  })
  it('says when nothing is known', () => {
    expect(factText({ value: null, at: null, by: null, estimated: false }, String)).toEqual({ value: 'Not known', sub: null, guessed: false })
  })
})
