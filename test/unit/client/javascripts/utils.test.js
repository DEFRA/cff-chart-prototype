import { describe, test, expect } from 'vitest'
import { simplify, forEach } from '../../../../src/client/javascripts/utils.js'

describe('utils', () => {
  describe('forEach', () => {
    test('should iterate over array elements', () => {
      const array = [1, 2, 3]
      const result = []

      forEach(array, (item) => result.push(item * 2))

      expect(result).toEqual([2, 4, 6])
    })

    test('should provide index to callback', () => {
      const array = ['a', 'b', 'c']
      const indices = []

      forEach(array, (item, index) => indices.push(index))

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
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 }
      ]

      const result = simplify(points, 0.1)

      expect(result).toEqual(points)
    })

    test('should simplify line with Douglas-Peucker algorithm', () => {
      const points = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T01:00:00Z', value: 1.1 },
        { dateTime: '2024-01-01T02:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T03:00:00Z', value: 0.9 },
        { dateTime: '2024-01-01T04:00:00Z', value: 1.0 }
      ]

      const result = simplify(points, 0.5)

      expect(result.length).toBeLessThanOrEqual(points.length)
      expect(result[0]).toEqual({ ...points[0], isSignificant: true })
      expect(result[result.length - 1]).toEqual({ ...points[points.length - 1], isSignificant: true })
    })

    test('should mark significant points', () => {
      const points = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T01:00:00Z', value: 2.0 },
        { dateTime: '2024-01-01T02:00:00Z', value: 1.0 }
      ]

      const result = simplify(points, 0.1)

      result.forEach(point => {
        expect(point).toHaveProperty('isSignificant')
        expect(point.isSignificant).toBe(true)
      })
    })

    test('should handle zero tolerance', () => {
      const points = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T01:00:00Z', value: 1.1 },
        { dateTime: '2024-01-01T02:00:00Z', value: 1.2 }
      ]

      const result = simplify(points, 0)

      expect(result.length).toBeGreaterThan(0)
    })

    test('should preserve first and last points', () => {
      const points = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T01:00:00Z', value: 5.0 },
        { dateTime: '2024-01-01T02:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T03:00:00Z', value: 5.0 },
        { dateTime: '2024-01-01T04:00:00Z', value: 3.0 }
      ]

      const result = simplify(points, 1.0)

      expect(result[0]).toEqual({ ...points[0], isSignificant: true })
      expect(result[result.length - 1]).toEqual({ ...points[points.length - 1], isSignificant: true })
    })
  })
})
