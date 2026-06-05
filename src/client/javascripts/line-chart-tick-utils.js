import { timeFormat } from 'd3-time-format'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const MS_PER_MINUTE = 1000 * 60
const FIFTEEN = 15
const THIRTY = 30
const DAYS_PER_WEEK = 7
const FIFTEEN_MINUTES_MS = FIFTEEN * MS_PER_MINUTE
const THIRTY_MINUTES_MS = THIRTY * MS_PER_MINUTE
const WEEK_MS = DAYS_PER_WEEK * MS_PER_DAY
const VERY_ZOOMED_DAY_THRESHOLD = 1
const VERY_ZOOMED_TICK_COUNT = 3
const REDUCED_TICK_COUNT = 4
const FIVE_DAY_RANGE = '5d'
const ONE_MONTH_RANGE = '1m'
const SIX_MONTH_RANGE = '6m'
const ONE_YEAR_RANGE = '1y'
const THREE_YEAR_RANGE = '3y'
const FIVE_YEAR_RANGE = '5y'
const FIXED_X_TICK_COUNT = 6
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const SIX_AM_HOUR = 6
const FLOAT_DEDUPE_PRECISION = 100000
const FLOAT_DEDUPE_DECIMALS = 5
const MIN_UNIQUE_TICKS = 2

export function getTickSnapIntervalMs(timeRange) {
  if (timeRange === FIVE_DAY_RANGE || timeRange === ONE_MONTH_RANGE) {
    return FIFTEEN_MINUTES_MS
  }

  if (timeRange === SIX_MONTH_RANGE || timeRange === ONE_YEAR_RANGE) {
    return THIRTY_MINUTES_MS
  }

  if (timeRange === THREE_YEAR_RANGE) {
    return MS_PER_DAY
  }

  if (timeRange === FIVE_YEAR_RANGE) {
    return WEEK_MS
  }

  return null
}

export function snapTickValuesForRange(tickValues, timeRange, xExtent) {
  const isNearFullFiveDayView = timeRange === FIVE_DAY_RANGE && getVisibleDurationDays(xExtent) >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD
  if (isNearFullFiveDayView) {
    return tickValues
  }

  const snapIntervalMs = getTickSnapIntervalMs(timeRange)
  if (!snapIntervalMs) {
    return tickValues
  }

  const snapped = tickValues.map((tick) => {
    const tickMs = new Date(tick).getTime()
    return new Date(Math.round(tickMs / snapIntervalMs) * snapIntervalMs)
  })

  const uniqueTimes = new Set(snapped.map((tick) => tick.getTime()))
  if (uniqueTimes.size !== snapped.length) {
    return tickValues
  }

  return snapped
}

export function getAdaptiveYTickCount(yRange) {
  const Y_RANGE_SMALL_THRESHOLD = 1
  const Y_RANGE_MEDIUM_THRESHOLD = 10
  const Y_TICK_COUNT_SMALL = 4
  const Y_TICK_COUNT_MEDIUM = 5
  const Y_TICK_COUNT_LARGE = 6

  if (yRange < Y_RANGE_SMALL_THRESHOLD) {
    return Y_TICK_COUNT_SMALL
  }

  if (yRange < Y_RANGE_MEDIUM_THRESHOLD) {
    return Y_TICK_COUNT_MEDIUM
  }

  return Y_TICK_COUNT_LARGE
}

export function generateEvenlySpacedTicks(xExtent) {
  const ticks = []
  const start = xExtent[0].getTime()
  const end = xExtent[1].getTime()
  const durationMs = end - start
  const durationDays = durationMs / MS_PER_DAY
  
  const tickCount = durationDays < VERY_ZOOMED_DAY_THRESHOLD
    ? VERY_ZOOMED_TICK_COUNT
    : REDUCED_TICK_COUNT
  
  const step = (end - start) / (tickCount - 1)

  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(start + (step * i)))
  }

  return ticks
}

export function generateFixedTickValues(xExtent, tickCount = FIXED_X_TICK_COUNT, useSixAmAlignment = false) {
  const ticks = []
  const start = xExtent[0].getTime()
  const end = xExtent[1].getTime()
  const durationDays = (end - start) / MS_PER_DAY

  if (!Number.isFinite(start) || !Number.isFinite(end) || tickCount < 2 || end <= start) {
    return generateEvenlySpacedTicks(xExtent)
  }

  if (useSixAmAlignment && durationDays >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD) {
    let current = new Date(start)
    current.setHours(SIX_AM_HOUR, 0, 0, 0)
    if (current.getTime() > start) {
      current = new Date(current.getTime() - MS_PER_DAY)
    }

    for (let i = 0; i < tickCount - 1; i++) {
      ticks.push(new Date(current.getTime()))
      current = new Date(current.getTime() + MS_PER_DAY)
    }
    ticks.push(new Date(end))
    return ticks
  }

  const step = (end - start) / (tickCount - 1)
  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(start + (step * i)))
  }

  return ticks
}

export function getVisibleDurationDays(xExtent) {
  const startMs = new Date(xExtent[0]).getTime()
  const endMs = new Date(xExtent[1]).getTime()
  return (endMs - startMs) / MS_PER_DAY
}

export function getSixAmMarkersInExtent(xExtent) {
  const start = new Date(xExtent[0]).getTime()
  const end = new Date(xExtent[1]).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return []
  }

  const markers = []
  const marker = new Date(start)
  marker.setHours(SIX_AM_HOUR, 0, 0, 0)

  if (marker.getTime() <= start) {
    marker.setDate(marker.getDate() + 1)
  }

  while (marker.getTime() < end) {
    markers.push(new Date(marker.getTime()))
    marker.setDate(marker.getDate() + 1)
  }

  return markers
}

export function formatTickTime(date) {
  const hasMinutes = date.getMinutes() !== 0
  const formatPattern = hasMinutes ? '%-I:%M%p' : '%-I%p'
  return timeFormat(formatPattern)(date).toLocaleLowerCase()
}

export function generateUniqueYTicks(yScale, desiredCount) {
  const [min, max] = yScale.domain()
  const range = max - min
  
  if (range < 1) {
    const manualRangeTicks = []
    for (let i = 0; i < desiredCount; i++) {
      manualRangeTicks.push(min + ((max - min) * i) / (desiredCount - 1))
    }
    return manualRangeTicks
  }
  
  const generatedTicks = yScale.ticks(desiredCount)
  
  const uniqueTicks = []
  const seen = new Set()
  
  for (const tick of generatedTicks) {
    const rounded = Math.round(tick * FLOAT_DEDUPE_PRECISION) / FLOAT_DEDUPE_PRECISION
    const roundedStr = rounded.toFixed(FLOAT_DEDUPE_DECIMALS)
    
    if (!seen.has(roundedStr)) {
      seen.add(roundedStr)
      uniqueTicks.push(tick)
    }
  }
  
  if (uniqueTicks.length < MIN_UNIQUE_TICKS) {
    const manualTicks = []
    for (let i = 0; i < desiredCount; i++) {
      manualTicks.push(min + ((max - min) * i) / (desiredCount - 1))
    }
    return manualTicks
  }
  
  return uniqueTicks
}
