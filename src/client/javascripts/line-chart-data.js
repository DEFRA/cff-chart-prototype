import { simplify } from './utils.js'
import {
  TOLERANCE_TIDE,
  TOLERANCE_DEFAULT
} from './line-chart-constants.js'
import { getTickSnapIntervalMs, getVisibleDurationDays } from './line-chart-tick-utils.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const THIRTY_MINUTES = 30
const THIRTY_MINUTES_MS = THIRTY_MINUTES * 60 * 1000
const DAYS_DAILY_TIER = 180
const DAYS_THIRTY_MIN_TIER = 30
const DOMAIN_BUFFER_RATIO = 0.1
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const FIVE_DAY_RANGE = '5d'
const FIVE_DAY_ZOOM_THRESHOLD = 5
const FIFTEEN_MINUTES = 15
const FIFTEEN_MINUTES_MS = FIFTEEN_MINUTES * 60 * 1000
const FULL_ZOOM_INTERVAL_TOLERANCE_DAYS = FIFTEEN_MINUTES_MS / MS_PER_DAY

function getTimestamp(value) {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    return new Date(value).getTime()
  }

  return null
}

function snapPointToInterval(point, snapIntervalMs) {
  const timestamp = getTimestamp(point.dateTime)
  if (timestamp === null) {
    return point
  }

  const roundedMs = Math.round(timestamp / snapIntervalMs) * snapIntervalMs
  const asDate = point.dateTime instanceof Date

  return {
    ...point,
    dateTime: asDate ? new Date(roundedMs) : new Date(roundedMs).toISOString()
  }
}

function toCollapsedBucketPoints(points) {
  const buckets = new Map()

  for (const point of points) {
    const bucketMs = new Date(point.dateTime).getTime()
    const existing = buckets.get(bucketMs)

    if (!existing) {
      buckets.set(bucketMs, {
        point,
        total: point.value,
        count: 1,
        isSignificant: !!point.isSignificant
      })
      continue
    }

    existing.total += point.value
    existing.count += 1
    existing.isSignificant = existing.isSignificant || !!point.isSignificant
    existing.point = point
  }

  return [...buckets.values()]
    .map(({ point, total, count, isSignificant }) => ({
      ...point,
      value: total / count,
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

function downsampleToThirtyMin(data) {
  const result = []
  let lastInterval = null
  for (const item of data) {
    const timestamp = new Date(item.dateTime).getTime()
    const interval = Math.floor(timestamp / THIRTY_MINUTES_MS) * THIRTY_MINUTES_MS
    if (lastInterval !== interval) {
      result.push(item)
      lastInterval = interval
    }
  }
  return result
}

function filterToVisibleWindow(data, visibleDomain) {
  if (!visibleDomain) { return data }

  const [start, end] = visibleDomain
  const startMs = start.getTime()
  const endMs = end.getTime()
  const buffer = (endMs - startMs) * DOMAIN_BUFFER_RATIO

  const windowStart = startMs - buffer
  const windowEnd = endMs + buffer

  return data.filter(item => {
    const t = new Date(item.dateTime).getTime()
    return t >= windowStart && t <= windowEnd
  })
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

  if (visibleDays > DAYS_THIRTY_MIN_TIER) {
    return downsampleToThirtyMin(data)
  }

  return data
}

function simplifyByType(data, dataType) {
  if (dataType === 'river') {
    return data
  }

  const tolerance = dataType === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
  return simplify(data, tolerance)
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
  return filtered.map(l => ({ ...l, type: 'observed' })).reverse()
}

function processForecastData(forecast, dataType, observed) {
  const processed = simplifyByType(forecast, dataType)
  markFirstForecastSignificance(observed, processed)
  return processed.map(l => ({ ...l, type: 'forecast' }))
}

function snapDataToNiceIntervals(data, timeRange, visibleDomain) {
  if (!data || data.length === 0 || !visibleDomain) {
    return data
  }

  // For 5-day range near full view, don't snap (use exact timestamps)
  const visibleDurationDays = getVisibleDurationDays(visibleDomain)
  const isNearFullFiveDayView = timeRange === FIVE_DAY_RANGE && visibleDurationDays >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD
  if (isNearFullFiveDayView) {
    return data
  }

  // Get the snap interval for the current time range
  let snapIntervalMs = getTickSnapIntervalMs(timeRange)
  if (!snapIntervalMs) {
    return data
  }

  // Treat effective full zoom as <= 5 days with one-interval tolerance for floating-point drift.
  if (visibleDurationDays <= FIVE_DAY_ZOOM_THRESHOLD + FULL_ZOOM_INTERVAL_TOLERANCE_DAYS) {
    snapIntervalMs = FIFTEEN_MINUTES_MS
  }

  const snapped = data.map(item => snapPointToInterval(item, snapIntervalMs))
  return toCollapsedBucketPoints(snapped)
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
  observedPoints = downsampleByVisibleDomain(observedPoints, visibleDomain)
  observedPoints = snapDataToNiceIntervals(observedPoints, timeRange, visibleDomain)

  forecastPoints = filterToVisibleWindow(forecastPoints, visibleDomain)
  forecastPoints = downsampleByVisibleDomain(forecastPoints, visibleDomain)
  forecastPoints = snapDataToNiceIntervals(forecastPoints, timeRange, visibleDomain)

  const lines = observedPoints.concat(forecastPoints)
  return { lines, observedPoints, forecastPoints }
}

