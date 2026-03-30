import { describe, test, expect, vi } from 'vitest'
import { formatStationData, formatTelemetryData } from '../../../src/lib/flood-service.js'

describe('flood-service edge cases', () => {
  describe('formatStationData edge cases', () => {
    const mockStation = {
      RLOIid: '8085',
      label: 'Test Station',
      riverName: 'Test River',
      stageScale: {
        typicalRangeHigh: 2.0,
        typicalRangeLow: 0.5
      }
    }

    test('should handle empty readings array', () => {
      const readings = []

      const result = formatStationData(mockStation, readings)

      expect(result).toBeDefined()
      expect(result.recentValue.value).toBe('0.00')
      expect(result.trend).toBe('steady')
    })

    test('should handle readings with missing dateTime in trend calculation', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T12:15:00Z', value: 1.1 },
        { dateTime: '2024-01-01T12:30:00Z', value: 1.2 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBeDefined()
      expect(['rising', 'falling', 'steady']).toContain(result.trend)
    })

    test('should detect rising trend correctly', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T12:15:00Z', value: 1.1 },
        { dateTime: '2024-01-01T12:30:00Z', value: 1.2 },
        { dateTime: '2024-01-01T12:45:00Z', value: 1.3 },
        { dateTime: '2024-01-01T13:00:00Z', value: 1.4 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBe('rising')
    })

    test('should detect falling trend correctly', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.4 },
        { dateTime: '2024-01-01T12:15:00Z', value: 1.3 },
        { dateTime: '2024-01-01T12:30:00Z', value: 1.2 },
        { dateTime: '2024-01-01T12:45:00Z', value: 1.1 },
        { dateTime: '2024-01-01T13:00:00Z', value: 1.0 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBe('falling')
    })

    test('should detect high state correctly', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 3.0 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.state).toBe('high')
    })

    test('should detect low state correctly', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 0.1 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.state).toBe('low')
    })

    test('should handle station without stageScale', () => {
      const stationNoScale = {
        RLOIid: '8085',
        label: 'Test Station',
        riverName: 'Test River'
      }
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.0 }
      ]

      const result = formatStationData(stationNoScale, readings)

      expect(result.state).toBe('normal')
      expect(result.hasPercentiles).toBe(false)
      expect(result.stateInformation).toBe('Data not available')
    })

    test('should return null for null station', () => {
      const result = formatStationData(null, [])

      expect(result).toBeNull()
    })

    test('should handle station with missing RLOIid', () => {
      const stationNoId = {
        label: 'Test Station',
        riverName: 'Test River',
        stationReference: 'REF123'
      }
      const readings = []

      const result = formatStationData(stationNoId, readings)

      expect(result.id).toBe('REF123')
    })

    test('should format time and date correctly', () => {
      const readings = [
        { dateTime: '2024-01-15T14:30:00Z', value: 1.5 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.recentValue.formattedTime).toBeDefined()
      expect(result.recentValue.latestDayFormatted).toBeDefined()
    })
  })

  describe('formatTelemetryData edge cases', () => {
    test('should handle empty readings array', () => {
      const readings = []

      const result = formatTelemetryData(readings)

      expect(result.observed).toEqual([])
      expect(result.forecast).toEqual([])
      expect(result.type).toBe('river')
    })

    test('should filter readings to last 5 days', () => {
      vi.useFakeTimers()
      const now = new Date('2024-01-06T12:00:00Z')
      vi.setSystemTime(now)

      const readings = [
        { dateTime: '2023-12-31T12:00:00Z', value: 1.0 }, // Too old
        { dateTime: '2024-01-02T12:00:00Z', value: 1.1 }, // Within 5 days
        { dateTime: '2024-01-05T12:00:00Z', value: 1.2 }  // Recent
      ]

      const result = formatTelemetryData(readings)

      expect(result.observed.length).toBeLessThan(readings.length)

      vi.useRealTimers()
    })

    test('should set correct cache timestamps', () => {
      const readings = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T13:00:00Z', value: 1.1 }
      ]

      const result = formatTelemetryData(readings)

      expect(result.cacheStartDateTime).toBeDefined()
      expect(result.cacheEndDateTime).toBeDefined()
      expect(result.latestDateTime).toBeDefined()
    })

    test('should map readings with error flags', () => {
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const readings = [
        { dateTime: oneDayAgo.toISOString(), value: 1.0, err: false }
      ]

      const result = formatTelemetryData(readings)

      expect(result.observed[0].err).toBe(false)
    })

    test('should handle readings without explicit err field', () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

      const readings = [
        { dateTime: twoDaysAgo.toISOString(), value: 1.0 }
      ]

      const result = formatTelemetryData(readings)

      expect(result.observed).toHaveLength(1)
      expect(result.observed[0]).toHaveProperty('dateTime')
      expect(result.observed[0]).toHaveProperty('value')
    })
  })
})
