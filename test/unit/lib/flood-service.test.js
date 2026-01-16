import { describe, it, expect, beforeEach, vi } from 'vitest'
import { formatStationData, formatTelemetryData } from '../../../src/lib/flood-service.js'

describe('flood-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Note: getStation and getStationReadings are tested in integration tests
  // since they depend on the external API

  describe('formatStationData', () => {
    const mockStation = {
      RLOIid: 8085,
      label: 'Teme at Knightsford Bridge',
      riverName: 'River Teme',
      stationType: 'S',
      stageScale: {
        typicalRangeHigh: 1.5,
        typicalRangeLow: 0.2
      }
    }

    it('should format station data with readings', () => {
      const readings = [
        { dateTime: '2026-01-16T12:00:00Z', value: 0.5 },
        { dateTime: '2026-01-16T12:15:00Z', value: 0.52 },
        { dateTime: '2026-01-16T12:30:00Z', value: 0.54 },
        { dateTime: '2026-01-16T12:45:00Z', value: 0.56 },
        { dateTime: '2026-01-16T13:00:00Z', value: 0.58 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result).toMatchObject({
        id: 8085,
        name: 'Teme at Knightsford Bridge',
        river: 'River Teme',
        type: 'S',
        recentValue: {
          value: '0.58'
        }
      })
      expect(result.trend).toBe('rising')
      expect(result.state).toBe('normal')
    })

    it('should detect falling trend', () => {
      const readings = [
        { dateTime: '2026-01-16T12:00:00Z', value: 1.0 },
        { dateTime: '2026-01-16T12:15:00Z', value: 0.95 },
        { dateTime: '2026-01-16T12:30:00Z', value: 0.90 },
        { dateTime: '2026-01-16T12:45:00Z', value: 0.85 },
        { dateTime: '2026-01-16T13:00:00Z', value: 0.80 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBe('falling')
    })

    it('should detect steady trend', () => {
      const readings = [
        { dateTime: '2026-01-16T12:00:00Z', value: 0.5 },
        { dateTime: '2026-01-16T12:15:00Z', value: 0.51 },
        { dateTime: '2026-01-16T12:30:00Z', value: 0.50 },
        { dateTime: '2026-01-16T12:45:00Z', value: 0.51 },
        { dateTime: '2026-01-16T13:00:00Z', value: 0.50 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBe('steady')
    })

    it('should detect high state', () => {
      const readings = [
        { dateTime: '2026-01-16T13:00:00Z', value: 2.0 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.state).toBe('high')
    })

    it('should handle empty readings', () => {
      const result = formatStationData(mockStation, [])

      expect(result.recentValue.value).toBe('0.00')
      expect(result.trend).toBe('steady')
    })

    it('should return null for null station', () => {
      const result = formatStationData(null, [])

      expect(result).toBeNull()
    })
  })

  describe('formatTelemetryData', () => {
    it('should format telemetry data with 5-day filter', () => {
      const now = new Date('2026-01-16T13:00:00Z')
      const readings = [
        { dateTime: '2026-01-10T12:00:00Z', value: 0.4 }, // 6 days ago - should be filtered
        { dateTime: '2026-01-12T12:00:00Z', value: 0.5 }, // 4 days ago - included
        { dateTime: '2026-01-15T12:00:00Z', value: 0.6 }, // 1 day ago - included
        { dateTime: '2026-01-16T12:00:00Z', value: 0.7 } // today - included
      ]

      vi.setSystemTime(now)

      const result = formatTelemetryData(readings)

      expect(result.observed).toHaveLength(3)
      expect(result.observed[0].value).toBe(0.5)
      expect(result.forecast).toHaveLength(0)
      expect(result.type).toBe('river')
      expect(result.latestDateTime).toBe('2026-01-16T12:00:00Z')

      vi.useRealTimers()
    })

    it('should handle empty readings', () => {
      const result = formatTelemetryData([])

      expect(result.observed).toHaveLength(0)
      expect(result.forecast).toHaveLength(0)
    })

    it('should mark all readings as not errors', () => {
      const readings = [
        { dateTime: '2026-01-16T12:00:00Z', value: 0.5 }
      ]

      const result = formatTelemetryData(readings)

      expect(result.observed[0].err).toBe(false)
    })
  })
})
