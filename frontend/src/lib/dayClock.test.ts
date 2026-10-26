import { describe, expect, it } from 'vitest'
import { arcPath, CENTER, innerEdge, MAX_BAND, minuteAtPoint, pointAt, R_IN, R_OUT, radiusOf, ringLayout } from './dayClock'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6)

describe('the dial', () => {
  it('puts midnight at the top, six on the right, noon at the bottom', () => {
    const top = pointAt(100, 0)
    close(top.x, CENTER)
    close(top.y, CENTER - 100)
    const six = pointAt(100, 6 * 60)
    close(six.x, CENTER + 100)
    close(six.y, CENTER)
    const noon = pointAt(100, 12 * 60)
    close(noon.x, CENTER)
    close(noon.y, CENTER + 100)
  })

  it('reads the minute back from a point, all the way round', () => {
    for (const min of [0, 1, 90, 359, 720, 1000, 1439]) {
      close(minuteAtPoint(pointAt(250, min)), min)
      close(radiusOf(pointAt(250, min)), 250)
    }
  })

  it('draws the long way round only for more than half a day', () => {
    expect(arcPath(100, 8 * 60, 12 * 60)).toContain(' 0 0 1 ')
    expect(arcPath(100, 6 * 60, 20 * 60)).toContain(' 0 1 1 ')
    // A whole day is two half arcs, since an arc cannot end where it starts.
    expect(arcPath(100, 0, 24 * 60).match(/A /g)).toHaveLength(2)
  })
})

describe('the rings', () => {
  it('are capped in thickness with few cars and start at the outer edge', () => {
    const rings = ringLayout(3, 0)
    expect(rings).toHaveLength(3)
    expect(rings[0].band).toBe(MAX_BAND)
    expect(rings[0].r).toBe(R_OUT - MAX_BAND / 2)
    expect(rings[1].r).toBeLessThan(rings[0].r)
  })

  it('share the room between the outer edge and the readout when there are many', () => {
    const rings = ringLayout(8, 4)
    expect(rings).toHaveLength(12)
    expect(rings[0].band).toBeLessThan(MAX_BAND)
    expect(innerEdge(rings)).toBeCloseTo(R_IN, 6)
  })

  it('leave a gap between the company cars and the own cars', () => {
    const together = ringLayout(0, 2)
    const apart = ringLayout(1, 1)
    expect(together[0].r - together[1].r).toBeCloseTo(together[0].band, 6)
    expect(apart[0].r - apart[1].r).toBeGreaterThan(apart[0].band)
  })

  it('is nothing with no cars', () => {
    expect(ringLayout(0, 0)).toEqual([])
  })
})
