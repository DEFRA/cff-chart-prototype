/**
 * Historic Data Manager
 * Handles CSV upload, parsing, storage, and filtering of historic telemetry data
 */

const DB_NAME = 'historic-telemetry-db'
const DB_VERSION = 1
const STORE_NAME = 'telemetry-data'
const DATA_KEY = 'historic-data'
const FIVE_YEARS = 5
const DAYS_PER_YEAR = 365
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const FIVE_DAYS = 5
const THIRTY_DAYS = 30
const SIX_MONTHS = 6
const FIVE_YEARS_MS = FIVE_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

/**
 * Open IndexedDB database
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

/**
 * Parse CSV content and extract dateTime and value fields
 * Only includes data from the last 5 years
 */
export function parseHistoricCSV(csvContent) {
  const lines = csvContent.trim().split('\n')
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid')
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.replaceAll('"', '').trim())
  const dateTimeIndex = header.indexOf('dateTime')
  const valueIndex = header.indexOf('value')

  if (dateTimeIndex === -1 || valueIndex === -1) {
    throw new Error('CSV must contain "dateTime" and "value" columns')
  }

  // Calculate cutoff date (5 years ago)
  const fiveYearsAgo = new Date(Date.now() - FIVE_YEARS_MS)

  // Parse data rows
  const data = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) {
      continue
    }

    const values = line.split(',').map(v => v.replaceAll('"', '').trim())
    const dateTime = values[dateTimeIndex]
    const value = Number.parseFloat(values[valueIndex])

    // Skip invalid rows
    if (!dateTime || Number.isNaN(value)) {
      continue
    }

    // Only include data from last 5 years
    const date = new Date(dateTime)
    if (date < fiveYearsAgo) {
      continue
    }

    data.push({
      dateTime,
      value,
      _: value // Some charts may expect this format
    })
  }

  return data
}

/**
 * Save historic data to IndexedDB
 */
export async function saveHistoricData(data) {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(data, DATA_KEY)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)

      transaction.oncomplete = () => db.close()
    })
  } catch (error) {
    console.error('Failed to save historic data:', error)
    return false
  }
}

/**
 * Load historic data from IndexedDB
 */
export async function loadHistoricData() {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(DATA_KEY)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)

      transaction.oncomplete = () => db.close()
    })
  } catch (error) {
    console.error('Failed to load historic data:', error)
    return null
  }
}

/**
 * Clear historic data from IndexedDB
 */
export async function clearHistoricData() {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(DATA_KEY)

      request.onsuccess = () => resolve(true)
      request.onerror = () => reject(request.error)

      transaction.oncomplete = () => db.close()
    })
  } catch (error) {
    console.error('Failed to clear historic data:', error)
    return false
  }
}

/**
 * Merge historic data with real-time telemetry data
 * Removes duplicates, keeping real-time data when timestamps match
 */
export function mergeData(historicData, realtimeData) {
  if (!historicData || !Array.isArray(historicData) || historicData.length === 0) {
    return Array.isArray(realtimeData) ? realtimeData : []
  }

  if (!realtimeData || !Array.isArray(realtimeData) || realtimeData.length === 0) {
    return Array.isArray(historicData) ? historicData : []
  }

  // Create a map of real-time data by timestamp for quick lookup
  const realtimeMap = new Map()
  realtimeData.forEach(item => {
    realtimeMap.set(item.dateTime, item)
  })

  // Merge: use all real-time data + historic data that doesn't overlap
  const merged = [...realtimeData]
  historicData.forEach(item => {
    if (!realtimeMap.has(item.dateTime)) {
      merged.push(item)
    }
  })

  // Sort by dateTime
  merged.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))

  return merged
}

/**
 * Filter data by time range
 */
export function filterDataByTimeRange(data, range) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return []
  }

  const now = new Date()
  let cutoffDate

  const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

  switch (range) {
    case '5d':
      cutoffDate = new Date(now.getTime() - (FIVE_DAYS * MS_PER_DAY))
      break
    case '1m':
      cutoffDate = new Date(now.getTime() - (THIRTY_DAYS * MS_PER_DAY))
      break
    case '6m':
      cutoffDate = new Date(now.getTime() - (SIX_MONTHS * THIRTY_DAYS * MS_PER_DAY))
      break
    case '1y':
      cutoffDate = new Date(now.getTime() - (DAYS_PER_YEAR * MS_PER_DAY))
      break
    case '5y':
      cutoffDate = new Date(now.getTime() - FIVE_YEARS_MS)
      break
    default:
      return data
  }

  return data.filter(item => new Date(item.dateTime) >= cutoffDate)
}

/**
 * Get human-readable label for time range
 */
export function getTimeRangeLabel(range) {
  const labels = {
    '5d': 'Last 5 days',
    '1m': 'Last month',
    '6m': 'Last 6 months',
    '1y': 'Last year',
    '5y': 'Last 5 years'
  }
  return labels[range] || 'Last 5 days'
}

/**
 * Downsample data for chart style B to improve performance and readability
 * - 5 days, 1 month: no downsampling (15-min intervals)
 * - 6 months: hourly values only
 * - 1 year: 4-hour intervals
 * - 5 years: daily high points
 */
export function downsampleForStyleB(data, range) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return []
  }

  // No downsampling for 5 days and 1 month
  if (range === '5d' || range === '1m') {
    return data
  }

  const downsampled = []
  const FOUR_HOURS_MS = 4 * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

  if (range === '6m') {
    // Hourly values - keep first value of each hour
    let lastHour = null
    data.forEach(item => {
      const date = new Date(item.dateTime)
      const hour = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime()
      if (lastHour !== hour) {
        downsampled.push(item)
        lastHour = hour
      }
    })
  } else if (range === '1y') {
    // 4-hour intervals
    let lastInterval = null
    data.forEach(item => {
      const timestamp = new Date(item.dateTime).getTime()
      const interval = Math.floor(timestamp / FOUR_HOURS_MS) * FOUR_HOURS_MS
      if (lastInterval !== interval) {
        downsampled.push(item)
        lastInterval = interval
      }
    })
  } else if (range === '5y') {
    // Weekly high points - group by week and keep max value
    const weeklyGroups = new Map()
    data.forEach(item => {
      const date = new Date(item.dateTime)
      // Get the start of the week (Sunday)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      weekStart.setHours(0, 0, 0, 0)
      const weekKey = weekStart.getTime()
      if (!weeklyGroups.has(weekKey) || item.value > weeklyGroups.get(weekKey).value) {
        weeklyGroups.set(weekKey, item)
      }
    })
    downsampled.push(...weeklyGroups.values())
    downsampled.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
  } else {
    // Unknown range - return original data
    return data
  }

  return downsampled
}
