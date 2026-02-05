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

// Test constants
const SAMPLE_DATETIME_1 = '2024-01-15T10:00:00'
const SAMPLE_DATETIME_2 = '2024-01-15T11:00:00'
const SAMPLE_DATETIME_3 = '2024-01-15T12:00:00'
const SAMPLE_VALUE_1 = 1.234
const SAMPLE_VALUE_2 = 1.567
const SAMPLE_VALUE_3 = 2.345
const DAYS_PER_YEAR = 365
const SIX_YEARS = 6
const FOUR_YEARS = 4
const TEN_DAYS = 10
const THREE_DAYS = 3
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000
const FIVE_DAYS_MS = 5 * MILLISECONDS_PER_DAY
const EXPECTED_ARRAY_LENGTH_3 = 3

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
"http://example.com/measure","${SAMPLE_DATETIME_1}","2024-01-15","${SAMPLE_VALUE_1}","","Unchecked",""
"http://example.com/measure","2024-01-15T10:15:00","2024-01-15","${SAMPLE_VALUE_2}","","Unchecked",""`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        dateTime: SAMPLE_DATETIME_1,
        value: SAMPLE_VALUE_1,
        _: SAMPLE_VALUE_1
      })
      expect(result[1]).toEqual({
        dateTime: '2024-01-15T10:15:00',
        value: SAMPLE_VALUE_2,
        _: SAMPLE_VALUE_2
      })
    })

    test('should filter out data older than 5 years', () => {
      const now = new Date()
      const sixYearsAgo = new Date(now.getTime() - (SIX_YEARS * DAYS_PER_YEAR * MILLISECONDS_PER_DAY))
      const fourYearsAgo = new Date(now.getTime() - (FOUR_YEARS * DAYS_PER_YEAR * MILLISECONDS_PER_DAY))

      const csv = `"dateTime","value"
"${sixYearsAgo.toISOString()}","1"
"${fourYearsAgo.toISOString()}","2"`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(2)
    })

    test('should skip invalid rows with missing or invalid values', () => {
      const csv = `"dateTime","value"
"${SAMPLE_DATETIME_1}","${SAMPLE_VALUE_1}"
"2024-01-15T10:15:00","invalid"
"","1.567"
"2024-01-15T10:30:00","${SAMPLE_VALUE_3}"`

      const result = parseHistoricCSV(csv)

      expect(result).toHaveLength(2)
      expect(result[0].value).toBe(SAMPLE_VALUE_1)
      expect(result[1].value).toBe(SAMPLE_VALUE_3)
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
        { dateTime: SAMPLE_DATETIME_1, value: SAMPLE_VALUE_1, _: SAMPLE_VALUE_1 }
      ]

      const result = await saveHistoricData(data)

      expect(result).toBe(true)
    })

    test('loadHistoricData should load data from IndexedDB', async () => {
      const data = [
        { dateTime: SAMPLE_DATETIME_1, value: SAMPLE_VALUE_1, _: SAMPLE_VALUE_1 }
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
        { dateTime: SAMPLE_DATETIME_1, value: SAMPLE_VALUE_1, _: SAMPLE_VALUE_1 }
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
        { dateTime: SAMPLE_DATETIME_1, value: 1, _: 1 },
        { dateTime: SAMPLE_DATETIME_2, value: 2, _: 2 }
      ]
      const realtime = [
        { dateTime: SAMPLE_DATETIME_2, value: 2.5, _: 2.5 },
        { dateTime: SAMPLE_DATETIME_3, value: 3, _: 3 }
      ]

      const result = mergeData(historic, realtime)

      expect(result).toHaveLength(EXPECTED_ARRAY_LENGTH_3)
      expect(result[0].dateTime).toBe(SAMPLE_DATETIME_1)
      expect(result[1].dateTime).toBe(SAMPLE_DATETIME_2)
      expect(result[1].value).toBe(2.5) // Realtime takes precedence
      expect(result[2].dateTime).toBe(SAMPLE_DATETIME_3)
    })

    test('should return realtime data when historic is empty', () => {
      const realtime = [
        { dateTime: SAMPLE_DATETIME_3, value: 3, _: 3 }
      ]

      const result = mergeData(null, realtime)

      expect(result).toEqual(realtime)
    })

    test('should return historic data when realtime is empty', () => {
      const historic = [
        { dateTime: SAMPLE_DATETIME_1, value: 1, _: 1 }
      ]

      const result = mergeData(historic, null)

      expect(result).toEqual(historic)
    })

    test('should sort merged data by dateTime', () => {
      const historic = [
        { dateTime: SAMPLE_DATETIME_1, value: 1, _: 1 }
      ]
      const realtime = [
        { dateTime: SAMPLE_DATETIME_3, value: 3, _: 3 },
        { dateTime: SAMPLE_DATETIME_2, value: 2, _: 2 }
      ]

      const result = mergeData(historic, realtime)

      expect(result[0].dateTime).toBe(SAMPLE_DATETIME_1)
      expect(result[1].dateTime).toBe(SAMPLE_DATETIME_2)
      expect(result[2].dateTime).toBe(SAMPLE_DATETIME_3)
    })
  })

  describe('filterDataByTimeRange', () => {
    const now = new Date()
    const data = [
      { dateTime: new Date(now.getTime() - (TEN_DAYS * MILLISECONDS_PER_DAY)).toISOString(), value: 1 },
      { dateTime: new Date(now.getTime() - (THREE_DAYS * MILLISECONDS_PER_DAY)).toISOString(), value: 2 },
      { dateTime: new Date(now.getTime() - MILLISECONDS_PER_HOUR).toISOString(), value: 3 }
    ]

    test('should filter data to last 5 days', () => {
      const result = filterDataByTimeRange(data, '5d')

      expect(result.length).toBeGreaterThan(0)
      expect(result.every(item => {
        const itemDate = new Date(item.dateTime)
        return (now - itemDate) <= FIVE_DAYS_MS
      })).toBe(true)
    })

    test('should filter data to last month', () => {
      const result = filterDataByTimeRange(data, '1m')

      expect(result).toHaveLength(EXPECTED_ARRAY_LENGTH_3)
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
