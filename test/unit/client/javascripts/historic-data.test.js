import { describe, test, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  parseHistoricCSV,
  saveHistoricData,
  loadHistoricData,
  clearHistoricData,
  mergeData,
  filterDataByTimeRange,
  getTimeRangeLabel
} from '../../../../src/client/javascripts/historic-data.js'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('Historic Data Management', () => {
  beforeEach(async () => {
    localStorageMock.clear()
    vi.clearAllMocks()
    
    // Clear IndexedDB before each test
    await clearHistoricData()
  })

  describe('parseHistoricCSV', () => {
    test('should parse valid CSV with dateTime and value columns', () => {
      const csv = `"measure","dateTime","date","value","completeness","quality","qcode"
"http://example.com/measure","2024-01-15T10:00:00","2024-01-15","1.234","","Unchecked",""
"http://example.com/measure","2024-01-15T10:15:00","2024-01-15","1.567","","Unchecked",""`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        dateTime: '2024-01-15T10:00:00',
        value: 1.234,
        _: 1.234
      })
      expect(result[1]).toEqual({
        dateTime: '2024-01-15T10:15:00',
        value: 1.567,
        _: 1.567
      })
    })

    test('should filter out data older than 5 years', () => {
      const now = new Date()
      const sixYearsAgo = new Date(now.getTime() - (6 * 365 * 24 * 60 * 60 * 1000))
      const fourYearsAgo = new Date(now.getTime() - (4 * 365 * 24 * 60 * 60 * 1000))

      const csv = `"dateTime","value"
"${sixYearsAgo.toISOString()}","1.0"
"${fourYearsAgo.toISOString()}","2.0"`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(2.0)
    })

    test('should skip invalid rows with missing or invalid values', () => {
      const csv = `"dateTime","value"
"2024-01-15T10:00:00","1.234"
"2024-01-15T10:15:00","invalid"
"","1.567"
"2024-01-15T10:30:00","2.345"`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(2)
      expect(result[0].value).toBe(1.234)
      expect(result[1].value).toBe(2.345)
    })

    test('should throw error for empty CSV', () => {
      expect(() => parseHistoricCSV('')).toThrow('CSV file is empty or invalid')
    })

    test('should throw error for CSV without required columns', () => {
      const csv = `"measure","date"
"test","2024-01-15"`

      expect(() => parseHistoricCSV(csv)).toThrow('CSV must contain "dateTime" and "value" columns')
    })
  })

  describe('IndexedDB operations', () => {
    test('saveHistoricData should save data to IndexedDB', async () => {
      const data = [
        { dateTime: '2024-01-15T10:00:00', value: 1.234, _: 1.234 }
      ]

      const result = await saveHistoricData(data)

      expect(result).toBe(true)
    })

    test('loadHistoricData should load data from IndexedDB', async () => {
      const data = [
        { dateTime: '2024-01-15T10:00:00', value: 1.234, _: 1.234 }
      ]
      await saveHistoricData(data)

      const result = await loadHistoricData()

      expect(result).toEqual(data)
    })

    test('loadHistoricData should return null when no data exists', async () => {
      const result = await loadHistoricData()

      expect(result).toBeNull()
    })

    test('clearHistoricData should remove data from IndexedDB', async () => {
      const data = [
        { dateTime: '2024-01-15T10:00:00', value: 1.234, _: 1.234 }
      ]
      await saveHistoricData(data)

      const result = await clearHistoricData()

      expect(result).toBe(true)

      const loadedData = await loadHistoricData()
      expect(loadedData).toBeNull()
    })
  })

  describe('mergeData', () => {
    test('should merge historic and realtime data without duplicates', () => {
      const historic = [
        { dateTime: '2024-01-15T10:00:00', value: 1.0, _: 1.0 },
        { dateTime: '2024-01-15T11:00:00', value: 2.0, _: 2.0 }
      ]
      const realtime = [
        { dateTime: '2024-01-15T11:00:00', value: 2.5, _: 2.5 },
        { dateTime: '2024-01-15T12:00:00', value: 3.0, _: 3.0 }
      ]

      const result = mergeData(historic, realtime)

      expect(result).toHaveLength(3)
      expect(result[0].dateTime).toBe('2024-01-15T10:00:00')
      expect(result[1].dateTime).toBe('2024-01-15T11:00:00')
      expect(result[1].value).toBe(2.5) // Realtime takes precedence
      expect(result[2].dateTime).toBe('2024-01-15T12:00:00')
    })

    test('should return realtime data when historic is empty', () => {
      const realtime = [
        { dateTime: '2024-01-15T12:00:00', value: 3.0, _: 3.0 }
      ]

      const result = mergeData(null, realtime)

      expect(result).toEqual(realtime)
    })

    test('should return historic data when realtime is empty', () => {
      const historic = [
        { dateTime: '2024-01-15T10:00:00', value: 1.0, _: 1.0 }
      ]

      const result = mergeData(historic, null)

      expect(result).toEqual(historic)
    })

    test('should sort merged data by dateTime', () => {
      const historic = [
        { dateTime: '2024-01-15T10:00:00', value: 1.0, _: 1.0 }
      ]
      const realtime = [
        { dateTime: '2024-01-15T12:00:00', value: 3.0, _: 3.0 },
        { dateTime: '2024-01-15T11:00:00', value: 2.0, _: 2.0 }
      ]

      const result = mergeData(historic, realtime)

      expect(result[0].dateTime).toBe('2024-01-15T10:00:00')
      expect(result[1].dateTime).toBe('2024-01-15T11:00:00')
      expect(result[2].dateTime).toBe('2024-01-15T12:00:00')
    })
  })

  describe('filterDataByTimeRange', () => {
    const now = new Date()
    const data = [
      { dateTime: new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)).toISOString(), value: 1.0 },
      { dateTime: new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000)).toISOString(), value: 2.0 },
      { dateTime: new Date(now.getTime() - (1 * 60 * 60 * 1000)).toISOString(), value: 3.0 }
    ]

    test('should filter data to last 5 days', () => {
      const result = filterDataByTimeRange(data, '5d')

      expect(result.length).toBeGreaterThan(0)
      expect(result.every(item => {
        const itemDate = new Date(item.dateTime)
        return (now - itemDate) <= (5 * 24 * 60 * 60 * 1000)
      })).toBe(true)
    })

    test('should filter data to last month', () => {
      const result = filterDataByTimeRange(data, '1m')

      expect(result).toHaveLength(3)
    })

    test('should return all data for unknown range', () => {
      const result = filterDataByTimeRange(data, 'unknown')

      expect(result).toEqual(data)
    })

    test('should handle empty data', () => {
      const result = filterDataByTimeRange([], '5d')

      expect(result).toEqual([])
    })
  })

  describe('getTimeRangeLabel', () => {
    test('should return correct label for 5 days', () => {
      expect(getTimeRangeLabel('5d')).toBe('Last 5 days')
    })

    test('should return correct label for 1 month', () => {
      expect(getTimeRangeLabel('1m')).toBe('Last month')
    })

    test('should return correct label for 6 months', () => {
      expect(getTimeRangeLabel('6m')).toBe('Last 6 months')
    })

    test('should return correct label for 1 year', () => {
      expect(getTimeRangeLabel('1y')).toBe('Last year')
    })

    test('should return correct label for 5 years', () => {
      expect(getTimeRangeLabel('5y')).toBe('Last 5 years')
    })

    test('should return default label for unknown range', () => {
      expect(getTimeRangeLabel('unknown')).toBe('Last 5 days')
    })
  })
})
