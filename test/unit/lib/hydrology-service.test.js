import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock flood-service proxyFetch before importing hydrology-service
vi.mock('../../../src/lib/flood-service.js', () => ({
  proxyFetch: vi.fn()
}))

// Mock config
vi.mock('../../../src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'api.hydrology.baseUrl') return 'https://environment.data.gov.uk/hydrology'
      if (key === 'root') return '/tmp/test-project'
      return null
    })
  }
}))

// Mock fs
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

import { lookupStationByRLOI, fetchHistoricReadings } from '../../../src/lib/hydrology-service.js'
import { proxyFetch } from '../../../src/lib/flood-service.js'
import { writeFile, mkdir } from 'node:fs/promises'

describe('hydrology-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('lookupStationByRLOI', () => {
    it('should return station info when found', async () => {
      // First call: station lookup
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            notation: '7da7bf7a-21a3-486a-a4aa-1280770bf512',
            label: 'Gosforth'
          }]
        })
      })
      // Second call: measures lookup
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { notation: '7da7bf7a-level-min-86400-m-qualified', parameter: 'level', period: 86400 },
            { notation: '7da7bf7a-level-i-900-m-qualified', parameter: 'level', period: 900 },
            { notation: '7da7bf7a-level-max-86400-m-qualified', parameter: 'level', period: 86400 }
          ]
        })
      })

      const result = await lookupStationByRLOI('8085')

      expect(result).toEqual({
        guid: '7da7bf7a-21a3-486a-a4aa-1280770bf512',
        name: 'Gosforth',
        measureId: '7da7bf7a-level-i-900-m-qualified'
      })
      expect(proxyFetch).toHaveBeenCalledWith(
        'https://environment.data.gov.uk/hydrology/id/stations?RLOIid=8085'
      )
    })

    it('should return null when no station found', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await lookupStationByRLOI('999999')
      expect(result).toBeNull()
    })

    it('should return null when no 15-min level measure found', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ notation: 'abc-123', label: 'Test Station' }]
        })
      })
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            { notation: 'abc-level-max-86400', parameter: 'level', period: 86400 }
          ]
        })
      })

      const result = await lookupStationByRLOI('1234')
      expect(result).toBeNull()
    })

    it('should throw when station API returns error', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(lookupStationByRLOI('8085')).rejects.toThrow('Hydrology API returned 500')
    })

    it('should throw when measures API returns error', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ notation: 'abc-123', label: 'Test' }]
        })
      })
      proxyFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      })

      await expect(lookupStationByRLOI('8085')).rejects.toThrow('Failed to fetch measures: 503')
    })

    it('should use stationGuid when notation is not available', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ stationGuid: 'guid-fallback', label: 'Fallback Station' }]
        })
      })
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ notation: 'measure-id', parameter: 'level', period: 900 }]
        })
      })

      const result = await lookupStationByRLOI('5555')
      expect(result.guid).toBe('guid-fallback')
    })
  })

  describe('fetchHistoricReadings', () => {
    const stationInfo = {
      guid: 'test-guid',
      name: 'Test Station',
      measureId: 'test-measure-i-900-m-qualified'
    }

    it('should fetch readings, downsample to hourly, and write to disk', async () => {
      const rawReadings = [
        { dateTime: '2025-01-01T00:00:00', value: 1.0 },
        { dateTime: '2025-01-01T00:15:00', value: 1.1 },
        { dateTime: '2025-01-01T00:30:00', value: 1.2 },
        { dateTime: '2025-01-01T00:45:00', value: 1.3 },
        { dateTime: '2025-01-01T01:00:00', value: 1.4 },
        { dateTime: '2025-01-01T01:15:00', value: 1.5 },
        { dateTime: '2025-01-01T02:00:00', value: 1.6 }
      ]

      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: rawReadings })
      })

      const result = await fetchHistoricReadings('8085', stationInfo)

      expect(result.meta.rloiId).toBe('8085')
      expect(result.meta.name).toBe('Test Station')
      expect(result.meta.rawPointCount).toBe(7)
      expect(result.meta.hourlyPointCount).toBe(3)
      expect(result.readings).toHaveLength(3)
      expect(result.readings[0].dateTime).toBe('2025-01-01T00:00:00')
      expect(result.readings[1].dateTime).toBe('2025-01-01T01:00:00')
      expect(result.readings[2].dateTime).toBe('2025-01-01T02:00:00')
    })

    it('should keep first reading per hour when downsampling', async () => {
      const rawReadings = [
        { dateTime: '2025-06-15T10:00:00', value: 2.0 },
        { dateTime: '2025-06-15T10:15:00', value: 2.5 },
        { dateTime: '2025-06-15T10:30:00', value: 3.0 },
        { dateTime: '2025-06-15T10:45:00', value: 2.8 }
      ]

      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: rawReadings })
      })

      const result = await fetchHistoricReadings('1234', stationInfo)

      expect(result.readings).toHaveLength(1)
      expect(result.readings[0].value).toBe(2.0)
    })

    it('should sort readings chronologically', async () => {
      const rawReadings = [
        { dateTime: '2025-03-01T14:00:00', value: 1.0 },
        { dateTime: '2025-01-01T10:00:00', value: 0.5 },
        { dateTime: '2025-02-01T08:00:00', value: 0.8 }
      ]

      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: rawReadings })
      })

      const result = await fetchHistoricReadings('1234', stationInfo)

      expect(result.readings[0].dateTime).toBe('2025-01-01T10:00:00')
      expect(result.readings[1].dateTime).toBe('2025-02-01T08:00:00')
      expect(result.readings[2].dateTime).toBe('2025-03-01T14:00:00')
    })

    it('should create output directory and write file', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ dateTime: '2025-01-01T00:00:00', value: 1.0 }] })
      })

      await fetchHistoricReadings('7041', stationInfo)

      expect(mkdir).toHaveBeenCalledWith('/tmp/test-project/data/historic', { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        '/tmp/test-project/data/historic/7041.json',
        expect.any(String)
      )

      const writtenData = JSON.parse(writeFile.mock.calls[0][1])
      expect(writtenData.meta.rloiId).toBe('7041')
      expect(writtenData.readings).toHaveLength(1)
    })

    it('should throw when readings API returns error', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      await expect(fetchHistoricReadings('8085', stationInfo)).rejects.toThrow('Failed to fetch readings: 500')
    })

    it('should handle empty readings', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await fetchHistoricReadings('8085', stationInfo)

      expect(result.readings).toHaveLength(0)
      expect(result.meta.rawPointCount).toBe(0)
      expect(result.meta.hourlyPointCount).toBe(0)
    })

    it('should include correct date range in metadata', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      const result = await fetchHistoricReadings('8085', stationInfo)

      const expectedEnd = new Date().toISOString().split('T')[0]
      const expectedStart = new Date()
      expectedStart.setFullYear(expectedStart.getFullYear() - 3)

      expect(result.meta.endDate).toBe(expectedEnd)
      expect(result.meta.startDate).toBe(expectedStart.toISOString().split('T')[0])
    })

    it('should construct correct API URL with date range and limit', async () => {
      proxyFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] })
      })

      await fetchHistoricReadings('8085', stationInfo)

      const url = proxyFetch.mock.calls[0][0]
      expect(url).toContain('https://environment.data.gov.uk/hydrology/id/measures/test-measure-i-900-m-qualified/readings.json')
      expect(url).toContain('mineq-date=')
      expect(url).toContain('maxeq-date=')
      expect(url).toContain('_limit=200000')
    })
  })
})
