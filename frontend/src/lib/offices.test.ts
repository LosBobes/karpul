import { describe, expect, it } from 'vitest'
import { officeDistance, officeOf } from './offices'

describe('the road between the offices', () => {
  it('knows both directions', () => {
    expect(officeDistance('Beograd', 'Novi Sad')).toBe(90)
    expect(officeDistance('Novi Sad', 'Beograd')).toBe(92)
    expect(officeDistance('belgrade', 'NS')).toBe(90)
  })
  it('knows nothing about other roads', () => {
    expect(officeDistance('Novi Sad', 'Niš')).toBeNull()
    expect(officeDistance('Office', 'Novi Sad')).toBeNull()
    expect(officeOf('Zrenjanin')).toBeNull()
  })
})
