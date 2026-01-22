import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { formatStationData, formatTelemetryData, getStation, getStationReadings, searchStations, proxyFetch } from '../../../src/lib/flood-service.js'

// Test constants
const TEST_API_URL = 'http://example.com/api'
const TEST_MEASURE_ID = 'http://example.com/measures/123'
const NETWORK_ERROR_MESSAGE = 'Network error'
const TEST_STATION_LABEL = 'Test Station'
const SAMPLE_DATETIME_1 = '2026-01-16T12:00:00Z'
const SAMPLE_DATETIME_2 = '2026-01-16T12:15:00Z'
const SAMPLE_DATETIME_3 = '2026-01-16T12:30:00Z'
const SAMPLE_DATETIME_4 = '2026-01-16T12:45:00Z'
const SAMPLE_DATETIME_5 = '2026-01-16T13:00:00Z'
const EXPECTED_READING_COUNT = 3

// Mock global fetch
globalThis.fetch = vi.fn()

describe('flood-service - proxyFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.HTTP_PROXY
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.HTTP_PROXY
  })

  describe('proxyFetch', () => {
    it('should call fetch directly when HTTP_PROXY is not set', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: 'data' })
      })

      await proxyFetch(TEST_API_URL)

      expect(globalThis.fetch).toHaveBeenCalledWith(TEST_API_URL, {})
    })

    it('should call fetch with ProxyAgent when HTTP_PROXY is set', async () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080'

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ test: 'data' })
      })

      await proxyFetch(TEST_API_URL)

      expect(globalThis.fetch).toHaveBeenCalled()
      const callArgs = globalThis.fetch.mock.calls[0]
      // Verify that dispatcher was passed
      expect(callArgs[1]).toBeDefined()
      expect(callArgs[0]).toBe(TEST_API_URL)
    })
  })
})

describe('flood-service - getStation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStation', () => {
    it('should return station data for valid station ID', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            RLOIid: '8085',
            label: TEST_STATION_LABEL,
            riverName: 'Test River'
          }]
        })
      })

      const result = await getStation('8085')

      expect(result).toMatchObject({
        RLOIid: '8085',
        label: TEST_STATION_LABEL
      })
    })

    it('should return null when API response is not ok', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await getStation('99999')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should return null when no items in response', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await getStation('99999')

      expect(result).toBeNull()
    })

    it('should return null on fetch error', async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error(NETWORK_ERROR_MESSAGE))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await getStation('8085')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})

describe('flood-service - getStationReadings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getStationReadings', () => {
    it('should return readings for valid station', async () => {
      // First call for station data
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': TEST_MEASURE_ID,
              parameterName: 'Water Level'
            }]
          }]
        })
      })

      // Second call for readings
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { dateTime: SAMPLE_DATETIME_1, value: 0.5 }
          ]
        })
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })
      const result = await getStationReadings('8085')

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(0.5)
      consoleSpy.mockRestore()
    })

    it('should return empty array when readings data has no items property', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': TEST_MEASURE_ID,
              parameterName: 'Water Level'
            }]
          }]
        })
      })

      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { })
      const result = await getStationReadings('8085')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array when station not found', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await getStationReadings('99999')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array when station has no items', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await getStationReadings('99999')

      expect(result).toEqual([])
    })

    it('should return empty array when station has no measures', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ measures: [] }]
        })
      })

      const result = await getStationReadings('8085')

      expect(result).toEqual([])
    })

    it('should return empty array when no level measure found', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': TEST_MEASURE_ID,
              parameterName: 'Flow'
            }]
          }]
        })
      })

      const result = await getStationReadings('8085')

      expect(result).toEqual([])
    })

    it('should return empty array when readings API fails', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            measures: [{
              '@id': TEST_MEASURE_ID,
              parameter: 'level'
            }]
          }]
        })
      })

      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await getStationReadings('8085')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array on fetch error', async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error(NETWORK_ERROR_MESSAGE))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await getStationReadings('8085')

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })
  })
})

describe('flood-service - searchStations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('searchStations', () => {
    it('should search stations with query parameters', async () => {
      globalThis.fetch.mockResolvedValueOnce({
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
      globalThis.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: []
        })
      })

      const result = await searchStations()

      expect(result).toEqual([])
    })

    it('should return empty array on API error', async () => {
      globalThis.fetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request'
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await searchStations({ label: 'Test' })

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })

    it('should return empty array on fetch error', async () => {
      globalThis.fetch.mockRejectedValueOnce(new Error(NETWORK_ERROR_MESSAGE))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      const result = await searchStations({ label: 'Test' })

      expect(result).toEqual([])
      consoleSpy.mockRestore()
    })
  })
})

describe('formatStationData - Basic Operations', () => {
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
      { dateTime: SAMPLE_DATETIME_1, value: 0.5 },
      { dateTime: SAMPLE_DATETIME_2, value: 0.52 },
      { dateTime: SAMPLE_DATETIME_3, value: 0.54 },
      { dateTime: SAMPLE_DATETIME_4, value: 0.56 },
      { dateTime: SAMPLE_DATETIME_5, value: 0.58 }
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
})

describe('formatStationData - Trend Detection', () => {
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

  it('should detect falling trend', () => {
    const readings = [
      { dateTime: SAMPLE_DATETIME_1, value: 1 },
      { dateTime: SAMPLE_DATETIME_2, value: 0.95 },
      { dateTime: SAMPLE_DATETIME_3, value: 0.9 },
      { dateTime: SAMPLE_DATETIME_4, value: 0.85 },
      { dateTime: SAMPLE_DATETIME_5, value: 0.8 }
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.trend).toBe('falling')
  })

  it('should detect steady trend', () => {
    const readings = [
      { dateTime: SAMPLE_DATETIME_1, value: 0.5 },
      { dateTime: SAMPLE_DATETIME_2, value: 0.51 },
      { dateTime: SAMPLE_DATETIME_3, value: 0.5 },
      { dateTime: SAMPLE_DATETIME_4, value: 0.51 },
      { dateTime: SAMPLE_DATETIME_5, value: 0.5 }
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.trend).toBe('steady')
  })
})

describe('formatStationData - State Detection', () => {
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

  it('should detect high state', () => {
    const readings = [
      { dateTime: SAMPLE_DATETIME_5, value: 2 }
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.state).toBe('high')
  })
})

describe('formatStationData - Edge Cases', () => {
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
      label: TEST_STATION_LABEL,
      riverName: 'Test River'
    }
    const readings = [
      { dateTime: SAMPLE_DATETIME_5, value: 0.5 }
    ]

    const result = formatStationData(stationWithoutScale, readings)

    expect(result.state).toBe('normal')
    expect(result.stateInformation).toBe('Data not available')
    expect(result.hasPercentiles).toBe(false)
  })

  it('should detect low state', () => {
    const readings = [
      { dateTime: SAMPLE_DATETIME_5, value: 0.1 }
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
      { dateTime: SAMPLE_DATETIME_1, value: 0.5 },
      { dateTime: SAMPLE_DATETIME_2, value: 0.6 }
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.trend).toBe('steady')
  })

  it('should handle readings where hourAgoReading has no value', () => {
    // Create 6 readings where the 5th from end has no value
    const readings = [
      { dateTime: '2026-01-16T11:00:00Z', value: 0.5 },
      { dateTime: '2026-01-16T11:15:00Z' }, // Missing value - this will be hourAgoReading
      { dateTime: '2026-01-16T11:30:00Z', value: 0.6 },
      { dateTime: '2026-01-16T11:45:00Z', value: 0.65 },
      { dateTime: SAMPLE_DATETIME_1, value: 0.7 },
      { dateTime: SAMPLE_DATETIME_2, value: 0.75 }
    ]

    const result = formatStationData(mockStation, readings)

    // Should be steady since hourAgoReading (readings[1]) has no value
    expect(result.trend).toBe('steady')
  })

  it('should handle station with stageScale but latestValue equal to typical', () => {
    const readings = [
      { dateTime: SAMPLE_DATETIME_5, value: 1.5 }
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.state).toBe('normal')
  })

  it('should use fallback for stationReference when all IDs are missing', () => {
    const minimalStation = {}
    const readings = []

    const result = formatStationData(minimalStation, readings)

    expect(result.id).toBe('unknown')
  })

  it('should handle latestReading without dateTime', () => {
    const readings = [
      { value: 0.5 } // No dateTime
    ]

    const result = formatStationData(mockStation, readings)

    expect(result.recentValue).toBeDefined()
    expect(result.recentValue.formattedTime).toBeDefined()
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

    expect(result.observed).toHaveLength(EXPECTED_READING_COUNT)
    expect(result.observed[0].value).toBe(0.5)
    expect(result.forecast).toHaveLength(0)
    expect(result.type).toBe('river')
    expect(result.latestDateTime).toBe(SAMPLE_DATETIME_1)

    vi.useRealTimers()
  })

  it('should handle empty readings', () => {
    const result = formatTelemetryData([])

    expect(result.observed).toHaveLength(0)
    expect(result.forecast).toHaveLength(0)
  })

  it('should mark all readings as not errors', () => {
    const readings = [
      { dateTime: '2026-01-20T12:00:00Z', value: 0.5 }
    ]

    const result = formatTelemetryData(readings)

    expect(result.observed[0].err).toBe(false)
  })
})
