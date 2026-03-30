import { describe, test, expect } from 'vitest'
import { simplify, forEach } from '../../../../src/client/javascripts/utils.js'

// Test constants
const TEST_DATETIME = '2024-01-01T00:00:00Z'
const DATETIME_01H = '2024-01-01T01:00:00Z'
const DATETIME_02H = '2024-01-01T02:00:00Z'
const DATETIME_03H = '2024-01-01T03:00:00Z'
const DATETIME_04H = '2024-01-01T04:00:00Z'
const TEST_ARRAY_SIZE = 3
const EXPECTED_DOUBLED_SUM = 6

describe('forEach', () => {
  test('should iterate over array elements', () => {
    const array = [1, 2, TEST_ARRAY_SIZE]
    const result = []

    forEach(array, (item) => result.push(item * 2))

    expect(result).toEqual([2, 4, EXPECTED_DOUBLED_SUM])
  })

  test('should provide index to callback', () => {
    const array = ['a', 'b', 'c']
    const indices = []

    forEach(array, (_item, index) => indices.push(index))

    expect(indices).toEqual([0, 1, 2])
  })

  test('should handle empty arrays', () => {
    const result = []

    forEach([], (item) => result.push(item))

    expect(result).toEqual([])
  })
})

describe('simplify', () => {
  test('should return original points if length <= 2', () => {
    const points = [
      { dateTime: TEST_DATETIME, value: 1 }
    ]

    const result = simplify(points, 0.1)

    expect(result).toEqual(points)
  })

  test('should simplify line with Douglas-Peucker algorithm', () => {
    const points = [
      { dateTime: TEST_DATETIME, value: 1 },
      { dateTime: DATETIME_01H, value: 1.1 },
      { dateTime: DATETIME_02H, value: 1 },
      { dateTime: DATETIME_03H, value: 0.9 },
      { dateTime: DATETIME_04H, value: 1 }
    ]

    const result = simplify(points, 0.5)

    expect(result.length).toBeLessThanOrEqual(points.length)
    expect(result[0]).toEqual({ ...points[0], isSignificant: true })
    expect(result.at(-1)).toEqual({ ...points.at(-1), isSignificant: true })
  })

  test('should mark significant points', () => {
    const points = [
      { dateTime: TEST_DATETIME, value: 1 },
      { dateTime: DATETIME_01H, value: 2 },
      { dateTime: DATETIME_02H, value: 1 }
    ]

    const result = simplify(points, 0.1)

    result.forEach(point => {
      expect(point).toHaveProperty('isSignificant')
      expect(point.isSignificant).toBe(true)
    })
  })

  test('should handle zero tolerance', () => {
    const points = [
      { dateTime: TEST_DATETIME, value: 1 },
      { dateTime: DATETIME_01H, value: 1.1 },
      { dateTime: DATETIME_02H, value: 1.2 }
    ]

    const result = simplify(points, 0)

    expect(result.length).toBeGreaterThan(0)
  })

  test('should preserve first and last points', () => {
    const points = [
      { dateTime: TEST_DATETIME, value: 1 },
      { dateTime: DATETIME_01H, value: 5 },
      { dateTime: DATETIME_02H, value: 1 },
      { dateTime: DATETIME_03H, value: 5 },
      { dateTime: DATETIME_04H, value: 3 }
    ]

    const result = simplify(points, 1)

    expect(result[0]).toEqual({ ...points[0], isSignificant: true })
    expect(result.at(-1)).toEqual({ ...points.at(-1), isSignificant: true })
  })
})
