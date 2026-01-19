import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { formatStationData, formatTelemetryData, getStation, getStationReadings, searchStations } from '../../../src/lib/flood-service.js'

// Mock global fetch
global.fetch = vi.fn()

describe('flood-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStation', () => {
    it('should return station data for valid station ID', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            RLOIid: '8085',
            label: 'Test Station',
            riverName: 'Test River'
          }]
        })
      })

      const result = await getStation('8085')

      expect(result).toMatchObject({
        RLOIid: '8085',
        label: 'Test Station'
      })
    })

    it('should return null when API response is not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await getStation('99999')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should return null when no items in response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await getStation('99999')

      expect(result).toBeNull()
    })

    it('should return null on fetch error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await getStation('8085')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('getStationReadings', () => {
    it('should return readings for valid station', async () => {
      // First call for station data
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': 'http://example.com/measures/123',
              parameterName: 'Water Level'
            }]
          }]
        })
      })

      // Second call for readings
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { dateTime: '2026-01-16T12:00:00Z', value: 0.5 }
          ]
        })
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const result = await getStationReadings('8085')

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(0.5)
      consoleSpy.mockRestore()
    })

    it('should return empty array when station not found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await getStationReadings('99999')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array when station has no items', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await getStationReadings('99999')

      expect(result).toEqual([])
    })

    it('should return empty array when station has no measures', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ measures: [] }]
        })
      })

      const result = await getStationReadings('8085')

      expect(result).toEqual([])
    })

    it('should return empty array when no level measure found', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': 'http://example.com/measures/123',
              parameterName: 'Flow'
            }]
          }]
        })
      })

      const result = await getStationReadings('8085')

      expect(result).toEqual([])
    })

    it('should return empty array when readings API fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': 'http://example.com/measures/123',
              parameter: 'level'
            }]
          }]
        })
      })

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await getStationReadings('8085')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array on fetch error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await getStationReadings('8085')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })
  })

  describe('searchStations', () => {
    it('should search stations with query parameters', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { RLOIid: '8085', label: 'Station 1' },
            { RLOIid: '8086', label: 'Station 2' }
          ]
        })
      })

      const result = await searchStations({ label: 'Test', stationType: 'S', riverName: 'Thames' })

      expect(result).toHaveLength(2)
      expect(result[0].label).toBe('Station 1')
    })

    it('should handle empty query object', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: []
        })
      })

      const result = await searchStations()

      expect(result).toEqual([])
    })

    it('should return empty array on API error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await searchStations({ label: 'Test' })

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array on fetch error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const result = await searchStations({ label: 'Test' })

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })
  })

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

    it('should handle station without stageScale', () => {
      const stationWithoutScale = {
        RLOIid: 8085,
        label: 'Test Station',
        riverName: 'Test River'
      }
      const readings = [
        { dateTime: '2026-01-16T13:00:00Z', value: 0.5 }
      ]

      const result = formatStationData(stationWithoutScale, readings)

      expect(result.state).toBe('normal')
      expect(result.stateInformation).toBe('Data not available')
      expect(result.hasPercentiles).toBe(false)
    })

    it('should detect low state', () => {
      const readings = [
        { dateTime: '2026-01-16T13:00:00Z', value: 0.1 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.state).toBe('low')
    })

    it('should use fallback values for missing station properties', () => {
      const minimalStation = {
        notation: '12345'
      }
      const readings = []

      const result = formatStationData(minimalStation, readings)

      expect(result.id).toBe('12345')
      expect(result.name).toBe('Unknown')
      expect(result.river).toBe('Unknown River')
      expect(result.type).toBe('S')
    })

    it('should handle station with stationReference', () => {
      const stationWithRef = {
        stationReference: 'E8085',
        town: 'Test Town'
      }
      const readings = []

      const result = formatStationData(stationWithRef, readings)

      expect(result.id).toBe('E8085')
      expect(result.name).toBe('Test Town')
    })

    it('should handle station status Active', () => {
      const activeStation = {
        ...mockStation,
        status: 'Active'
      }
      const readings = []

      const result = formatStationData(activeStation, readings)

      expect(result.isActive).toBe(true)
      expect(result.status).toBe('active')
    })

    it('should handle station status Closed', () => {
      const closedStation = {
        ...mockStation,
        status: 'Closed'
      }
      const readings = []

      const result = formatStationData(closedStation, readings)

      expect(result.isActive).toBe(false)
      expect(result.status).toBe('closed')
    })

    it('should handle readings with less than 5 items for trend', () => {
      const readings = [
        { dateTime: '2026-01-16T12:00:00Z', value: 0.5 },
        { dateTime: '2026-01-16T12:15:00Z', value: 0.6 }
      ]

      const result = formatStationData(mockStation, readings)

      expect(result.trend).toBe('steady')
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
