/**
 * Historic Data Manager
 * Handles merging, filtering, and downsampling of historic telemetry data
 */

const DAYS_PER_YEAR = 365
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const FIVE_YEARS = 5
const FIVE_DAYS = 5
const THIRTY_DAYS = 30
const THIRTY_MINUTES = 30
const SIX_MONTHS = 6
const THREE_YEARS = 3
const FIVE_YEARS_MS = FIVE_YEARS * DAYS_PER_YEAR * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

/**
 * Remove data points with future timestamps
 */
function removeFutureData(data) {
  const now = new Date()
  return data.filter(item => new Date(item.dateTime) <= now)
}

/**
 * Validate that data is a non-empty array
 */
function isValidDataArray(data) {
  return data && Array.isArray(data) && data.length > 0
}

/**
 * Log merge operation results
 */
function logMergeResult(filtered, merged, realtimeLength, historicLength) {
  if (filtered.length === 0) {
    return
  }

  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const removedCount = merged.length - filtered.length
  const removedMsg = removedCount > 0 ? ` (removed ${removedCount} future points)` : ''
  console.log(`[mergeData] merged ${realtimeLength} realtime + ${historicLength} historic = ${merged.length} total, filtered to ${filtered.length}${removedMsg}, range ${first.value}@${first.dateTime} to ${last.value}@${last.dateTime}`)
}

/**
 * Merge historic data with real-time telemetry data
 * Removes duplicates, keeping real-time data when timestamps match
 */
export function mergeData(historicData, realtimeData) {
  if (!isValidDataArray(historicData)) {
    return Array.isArray(realtimeData) ? realtimeData : []
  }

  if (!isValidDataArray(realtimeData)) {
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

  // Remove any future-dated points
  const filtered = removeFutureData(merged)

  logMergeResult(filtered, merged, realtimeData.length, historicData.length)

  return filtered
}

/**
 * Calculate cutoff date based on time range
 */
function getCutoffDateForRange(range, now) {
  const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND

  switch (range) {
    case '5d':
      return new Date(now.getTime() - (FIVE_DAYS * MS_PER_DAY))
    case '1m':
      return new Date(now.getTime() - (THIRTY_DAYS * MS_PER_DAY))
    case '6m':
      return new Date(now.getTime() - (SIX_MONTHS * THIRTY_DAYS * MS_PER_DAY))
    case '1y':
      return new Date(now.getTime() - (DAYS_PER_YEAR * MS_PER_DAY))
    case '3y':
      return new Date(now.getTime() - (THREE_YEARS * DAYS_PER_YEAR * MS_PER_DAY))
    case '5y':
      return new Date(now.getTime() - FIVE_YEARS_MS)
    default:
      return null
  }
}

/**
 * Log filter operation results
 */
function logFilterResult(filtered, data, range, futureCount) {
  if (filtered.length === 0) {
    return
  }

  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const futureMsg = futureCount > 0 ? ` (removed ${futureCount} future)` : ''
  
  // Log value distribution for diagnostics
  const values = filtered.map(d => Number(d.value)).filter(v => Number.isFinite(v))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  
  console.log(`[filterDataByTimeRange] ${range}: ${data.length} → ${filtered.length} points${futureMsg}, value range=[${min.toFixed(2)}, ${max.toFixed(2)}], mean=${mean.toFixed(2)}, first=${first.value}@${first.dateTime}, last=${last.value}@${last.dateTime}`)
}

/**
 * Filter data by time range
 */
export function filterDataByTimeRange(data, range) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return []
  }

  const now = new Date()
  const cutoffDate = getCutoffDateForRange(range, now)

  if (!cutoffDate) {
    return data
  }

  // Filter by time range AND exclude future data
  let futureCount = 0
  const filtered = data.filter(item => {
    const itemTime = new Date(item.dateTime)
    const inRange = itemTime >= cutoffDate
    const notFuture = itemTime <= now
    if (inRange && !notFuture) {
      futureCount++
    }
    return inRange && notFuture
  })
  
  logFilterResult(filtered, data, range, futureCount)
  return filtered
}

/**
 * Get human-readable label for time range
 */
export function getTimeRangeLabel(range) {
  const labels = {
    '5d': 'last 5 days',
    '6m': 'last 6 months',
    '1y': 'last year',
    '3y': 'last 3 years',
  }
  return labels[range] || 'last 5 days'
}

/**
 * Downsample data for chart style B to improve performance and readability
 * - 5 days, 1 month: no downsampling (15-min intervals)
 * - 6 months: 30-minute intervals
 * - 1 year: 30-minute intervals
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
  const THIRTY_MINUTES_MS = THIRTY_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND

  if (range === '6m' || range === '1y') {
    // 30-minute intervals
    let lastInterval = null
    data.forEach(item => {
      const timestamp = new Date(item.dateTime).getTime()
      const interval = Math.floor(timestamp / THIRTY_MINUTES_MS) * THIRTY_MINUTES_MS
      if (lastInterval !== interval) {
        downsampled.push(item)
        lastInterval = interval
      }
    })
  } else if (range === '3y') {
    // Daily high points - group by day and keep max value
    const dailyGroups = new Map()
    data.forEach(item => {
      const date = new Date(item.dateTime)
      const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      if (!dailyGroups.has(dayKey) || item.value > dailyGroups.get(dayKey).value) {
        dailyGroups.set(dayKey, item)
      }
    })
    downsampled.push(...dailyGroups.values())
    downsampled.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
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
