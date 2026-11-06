import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { asksApproval } from './errors'

describe('asksApproval', () => {
  it('knows the share refusals', () => {
    expect(asksApproval(new ApiError(409, 'You already have a shared car this week. An admin can approve another'))).toBe(true)
    expect(asksApproval(new ApiError(409, 'You already have a shared car that day. An admin can approve another'))).toBe(true)
    expect(asksApproval(new ApiError(409, 'That keeps a shared car with you for more than 24 hours in a row. An admin can approve it'))).toBe(true)
  })

  it('knows them when a weekly series names the day', () => {
    expect(asksApproval(new ApiError(409, 'You already have a shared car this week. An admin can approve another (2026-12-12)'))).toBe(true)
  })

  it('leaves the other refusals alone', () => {
    expect(asksApproval(new ApiError(409, 'That car is out of service that day'))).toBe(false)
    expect(asksApproval(new Error('You already have a shared car this week. An admin can approve another'))).toBe(false)
  })
})
