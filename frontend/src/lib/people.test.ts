import { describe, expect, it } from 'vitest'
import { aRide } from '../test/render'
import { addable, fold } from './people'

const people = [
  { id: 1, display_name: 'Ana Petrović' },
  { id: 2, display_name: 'Marko Jović' },
  { id: 3, display_name: 'Mila Ilić' },
  { id: 4, display_name: 'Zoran Kos' },
]

describe('addable', () => {
  const ride = aRide({
    driver_id: 1,
    driver_name: 'Ana Petrović',
    bookings: [
      { id: 10, passenger_id: 2, passenger_name: 'Marko Jović', pickup: '', created_at: '' },
      // A seat from before accounts, by name only.
      { id: 11, passenger_id: null, passenger_name: 'mila ilić', pickup: '', created_at: '' },
    ],
  })

  it('leaves out the driver and whoever already has a seat', () => {
    expect(addable(people, ride, '').map((p) => p.id)).toEqual([4])
  })

  it('finds a name without its accents, anywhere in it', () => {
    const free = aRide({ driver_id: 99, driver_name: 'Someone Else', bookings: [] })
    expect(addable(people, free, 'jovic').map((p) => p.id)).toEqual([2])
    expect(addable(people, free, ' IC ').map((p) => p.id)).toEqual([1, 2, 3])
  })

  it('folds case and diacritics', () => {
    expect(fold('Đorđe Šćekić')).toBe('đorđe scekic')
  })
})
