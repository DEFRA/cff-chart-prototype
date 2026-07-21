import { simplify } from './utils.js'
import {
  TOLERANCE_TIDE,
  TOLERANCE_DEFAULT
} from './line-chart-constants.js'
import { getTickSnapIntervalMs, getVisibleDurationDays } from './line-chart-tick-utils.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000
const FIFTEEN_MINUTES = 15
const FIFTEEN_MINUTES_MS = FIFTEEN_MINUTES * 60 * 1000
const THIRTY_MINUTES = 30
const THIRTY_MINUTES_MS = THIRTY_MINUTES * 60 * 1000
const DAYS_DAILY_TIER = 180
const DAYS_THIRTY_MIN_TIER = 30
const DOMAIN_BUFFER_RATIO = 0.1
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const FIVE_DAY_RANGE = '5d'
const HISTORIC_RANGES = new Set(['6m', '1y', '3y'])
const HISTORIC_INTERVAL_HOURS_TWELVE = 12
const HISTORIC_INTERVAL_HOURS_SIX = 6
const HISTORIC_INTERVAL_HOURS_THREE = 3

const HISTORIC_SNAP_TIERS = [
  { minDaysExclusive: 180, intervalMs: MS_PER_DAY },
  { minDaysExclusive: 90, intervalMs: HISTORIC_INTERVAL_HOURS_TWELVE * MS_PER_HOUR },
  { minDaysExclusive: 45, intervalMs: HISTORIC_INTERVAL_HOURS_SIX * MS_PER_HOUR },
  { minDaysExclusive: 21, intervalMs: HISTORIC_INTERVAL_HOURS_THREE * MS_PER_HOUR },
  { minDaysExclusive: 10, intervalMs: MS_PER_HOUR },
  { minDaysExclusive: 0, intervalMs: THIRTY_MINUTES_MS }
]

function getTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    return new Date(value).getTime()
  }

  return null
}

function removeFutureData(data) {
  const now = new Date().getTime()
  const before = data.length
  const result = data.filter(item => new Date(item.dateTime).getTime() <= now)
  if (result.length < before) {
    console.log(`[removeFutureData] removed ${before - result.length} future points`)
  }
  return result
}

function snapPointToInterval(point, snapIntervalMs) {
  const timestamp = getTimestamp(point.dateTime)
  if (timestamp === null) {
    return point
  }

  // Use normal rounding for bucketing - future filtering happens in filter functions
  const roundedMs = Math.round(timestamp / snapIntervalMs) * snapIntervalMs
  const asDate = point.dateTime instanceof Date

  return {
    ...point,
    dateTime: asDate ? new Date(roundedMs) : new Date(roundedMs).toISOString()
  }
}

function toCollapsedBucketPoints(points, aggregate = 'mean') {
  const buckets = new Map()

  for (const point of points) {
    const bucketMs = new Date(point.dateTime).getTime()
    const numericValue = Number(point.value)
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0
    const existing = buckets.get(bucketMs)

    if (!existing) {
      buckets.set(bucketMs, {
        point,
        total: safeValue,
        max: safeValue,
        count: 1,
        isSignificant: !!point.isSignificant
      })
      continue
    }

    existing.total += safeValue
    const isNewMax = safeValue >= existing.max
    existing.max = Math.max(existing.max, safeValue)
    existing.count += 1
    existing.isSignificant = existing.isSignificant || !!point.isSignificant
    if (isNewMax) {
      existing.point = point
    }
  }

  return [...buckets.values()]
    .map(({ point, total, max, count, isSignificant }) => ({
      ...point,
      value: aggregate === 'max' ? max : (total / count),
      isSignificant
    }))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
}

function downsampleToDaily(data) {
  const dailyGroups = new Map()
  for (const item of data) {
    const date = new Date(item.dateTime)
    const dayKey = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    if (!dailyGroups.has(dayKey) || item.value > dailyGroups.get(dayKey).value) {
      dailyGroups.set(dayKey, item)
    }
  }
  const result = [...dailyGroups.values()]
  result.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
  return result
}

function downsampleToInterval(data, intervalMs) {
  const intervalGroups = new Map()

  for (const item of data) {
    const timestamp = new Date(item.dateTime).getTime()
    const interval = Math.floor(timestamp / intervalMs) * intervalMs
    const itemValue = Number(item.value)
    const safeItemValue = Number.isFinite(itemValue) ? itemValue : Number.NEGATIVE_INFINITY
    const existing = intervalGroups.get(interval)

    if (!existing) {
      intervalGroups.set(interval, {
        point: item,
        maxValue: safeItemValue,
        isSignificant: !!item.isSignificant
      })
      continue
    }

    if (safeItemValue > existing.maxValue) {
      existing.point = item
      existing.maxValue = safeItemValue
    }

    existing.isSignificant = existing.isSignificant || !!item.isSignificant
  }

  return [...intervalGroups.values()]
    .map(({ point, isSignificant }) => ({ ...point, isSignificant }))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
}

function downsampleToFifteenMin(data) {
  return downsampleToInterval(data, FIFTEEN_MINUTES_MS)
}

function downsampleToThirtyMin(data) {
  return downsampleToInterval(data, THIRTY_MINUTES_MS)
}

function filterToVisibleWindow(data, visibleDomain) {
  if (!visibleDomain) { return data }

  const [start, end] = visibleDomain
  const startMs = start.getTime()
  const endMs = end.getTime()
  const buffer = (endMs - startMs) * DOMAIN_BUFFER_RATIO

  const windowStart = startMs - buffer
  const windowEnd = endMs + buffer
  const now = new Date().getTime()

  let futureCount = 0
  const filtered = data.filter(item => {
    const t = new Date(item.dateTime).getTime()
    const inWindow = t >= windowStart && t <= windowEnd
    const notFuture = t <= now
    if (inWindow && !notFuture) {
      futureCount++
    }
    // Include item if it's in the visible window AND not in the future
    return inWindow && notFuture
  })
  
  if (futureCount > 0) {
    console.warn(`[filterToVisibleWindow] FOUND AND REMOVED ${futureCount} future data points!`)
  }
  
  return filtered
}

function downsampleByVisibleDomain(data, visibleDomain) {
  if (!visibleDomain || !data || data.length === 0) {
    return data || []
  }

  const [start, end] = visibleDomain
  const visibleDays = (end.getTime() - start.getTime()) / MS_PER_DAY

  if (visibleDays > DAYS_DAILY_TIER) {
    return downsampleToDaily(data)
  }

  // Use 15-minute intervals for 5-day view, 30-minute for longer views
  if (visibleDays <= DAYS_THIRTY_MIN_TIER) {
    return downsampleToFifteenMin(data)
  }

  return downsampleToThirtyMin(data)
}

function simplifyByType(data, dataType) {
  if (dataType === 'river') {
    return data
  }

  const tolerance = dataType === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
  return simplify(data, tolerance)
}

function toAscendingChronological(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return points || []
  }

  const first = new Date(points[0].dateTime).getTime()
  const last = new Date(points[points.length - 1].dateTime).getTime()
  return first > last ? [...points].reverse() : points
}

function calculateValueRange(data) {
  const values = data.map(d => Number(d.value)).filter(v => Number.isFinite(v))
  if (values.length === 0) {
    return null
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: values.reduce((a, b) => a + b, 0) / values.length
  }
}

function markFirstForecastSignificance(observed, forecast) {
  if (!observed || observed.length === 0) {
    return
  }

  const latestObserved = observed[0]
  const firstForecast = forecast[0]
  const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
    latestObserved.value === firstForecast.value
  forecast[0].isSignificant = !isSame
}

function processObservedData(observed, dataType) {
  const processed = simplifyByType(observed, dataType)
  const filtered = processed.filter(l => !l.err)
  const ordered = toAscendingChronological(filtered)
  return ordered.map(l => ({ ...l, type: 'observed' }))
}

function processForecastData(forecast, dataType, observed) {
  const processed = simplifyByType(forecast, dataType)
  markFirstForecastSignificance(observed, processed)
  return processed.map(l => ({ ...l, type: 'forecast' }))
}

function getHistoricSnapIntervalMs(visibleDurationDays) {
  const tier = HISTORIC_SNAP_TIERS.find(({ minDaysExclusive }) => visibleDurationDays > minDaysExclusive)
  return tier ? tier.intervalMs : THIRTY_MINUTES_MS
}

function getSnapIntervalMs(timeRange, visibleDurationDays) {
  let snapIntervalMs = getTickSnapIntervalMs(timeRange)
  if (!snapIntervalMs) {
    return null
  }
  if (HISTORIC_RANGES.has(timeRange)) {
    snapIntervalMs = getHistoricSnapIntervalMs(visibleDurationDays)
  }
  return snapIntervalMs
}

function snapDataToNiceIntervals(data, timeRange, visibleDomain) {
  if (!data || data.length === 0 || !visibleDomain) {
    return data
  }

  const rangeBefore = calculateValueRange(data)

  // For 5-day range near full view, don't snap (use exact timestamps)
  const visibleDurationDays = getVisibleDurationDays(visibleDomain)
  const isNearFullFiveDayView = timeRange === FIVE_DAY_RANGE && visibleDurationDays >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD
  if (isNearFullFiveDayView) {
    return data
  }

  // Get the snap interval for the current time range
  const snapIntervalMs = getSnapIntervalMs(timeRange, visibleDurationDays)
  if (!snapIntervalMs) {
    return data
  }

  const snapped = data.map(item => snapPointToInterval(item, snapIntervalMs))
  const aggregate = timeRange === '3y' ? 'max' : 'mean'
  const result = toCollapsedBucketPoints(snapped, aggregate)

  // Log range after snapping
  const rangeAfter = calculateValueRange(result)
  
  if (rangeBefore && rangeAfter) {
    console.log(`[snapDataToNiceIntervals] ${timeRange}: ${data.length}→${result.length} points, aggregate=${aggregate}, values before=[${rangeBefore.min.toFixed(2)}, ${rangeBefore.max.toFixed(2)}, mean=${rangeBefore.mean.toFixed(2)}], after=[${rangeAfter.min.toFixed(2)}, ${rangeAfter.max.toFixed(2)}, mean=${rangeAfter.mean.toFixed(2)}]`)
  }
  
  return result
}



export function processData(dataCache, visibleDomain, timeRange) {
  let observedPoints = []
  let forecastPoints = []

  if (dataCache.observed?.length) {
    observedPoints = processObservedData(dataCache.observed, dataCache.type)
  }

  if (dataCache.forecast?.length) {
    forecastPoints = processForecastData(dataCache.forecast, dataCache.type, dataCache.observed)
  }

  observedPoints = filterToVisibleWindow(observedPoints, visibleDomain)
  const beforeDownsample = observedPoints.length
  observedPoints = downsampleByVisibleDomain(observedPoints, visibleDomain)
  console.log(`[processData] downsampled observed from ${beforeDownsample} to ${observedPoints.length} points`)
  observedPoints = snapDataToNiceIntervals(observedPoints, timeRange, visibleDomain)
  observedPoints = removeFutureData(observedPoints)

  forecastPoints = filterToVisibleWindow(forecastPoints, visibleDomain)
  forecastPoints = downsampleByVisibleDomain(forecastPoints, visibleDomain)
  forecastPoints = snapDataToNiceIntervals(forecastPoints, timeRange, visibleDomain)
  forecastPoints = removeFutureData(forecastPoints)

  const lines = observedPoints.concat(forecastPoints)
  return { lines, observedPoints, forecastPoints }
}

