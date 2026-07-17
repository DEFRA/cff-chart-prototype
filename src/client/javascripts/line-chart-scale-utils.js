import { extent } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { getVisibleDurationDays } from './line-chart-tick-utils.js'
import {
  RANGE_BUFFER_DIVISOR,
  MIN_RANGE_VALUE,
  TIME_RANGE_PADDING,
  Y_AXIS_NICE_TICKS
} from './line-chart-constants.js'

const FIVE_DAY_RANGE = '5d'
const SIX_MONTH_RANGE = '6m'
const ONE_YEAR_RANGE = '1y'
const THREE_YEAR_RANGE = '3y'
const FIVE_YEAR_RANGE = '5y'
const HISTORIC_BUFFER_DIVISOR = 5
const HISTORIC_TIME_RANGES = new Set([SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE, FIVE_YEAR_RANGE])
const Y_FORMAT_THREE_DP_THRESHOLD = 0.1
const Y_FORMAT_TWO_DP_THRESHOLD = 1
const Y_FORMAT_THREE_DP = 3
const Y_FORMAT_TWO_DP = 2
const Y_FORMAT_ONE_DP = 1
const TIME_AND_DATE_DURATION_THRESHOLD_DAYS = 2
const DATE_DURATION_THRESHOLD_DAYS = 120

export const DATE_LABEL_MODE = 'date'
export const TIME_AND_DATE_LABEL_MODE = 'time-date'
export const MONTH_YEAR_LABEL_MODE = 'month-year'

export function getLabelModeForExtent(timeRange, xExtent) {
  const durationDays = getVisibleDurationDays(xExtent)

  if (timeRange === FIVE_DAY_RANGE || durationDays <= TIME_AND_DATE_DURATION_THRESHOLD_DAYS) {
    return TIME_AND_DATE_LABEL_MODE
  }

  if (durationDays <= DATE_DURATION_THRESHOLD_DAYS) {
    return DATE_LABEL_MODE
  }

  return MONTH_YEAR_LABEL_MODE
}

export function calculateYScaleDomain(lines, dataType, rangeBufferDivisor = RANGE_BUFFER_DIVISOR) {
  const yExtent = extent(lines, (d) => d.value)
  const yExtentDataMin = yExtent[0]
  const yExtentDataMax = yExtent[1]

  let range = yExtentDataMax - yExtentDataMin
  range = Math.max(range, MIN_RANGE_VALUE)

  const yRangeUpperBuffered = yExtentDataMax + (range / rangeBufferDivisor)
  const yRangeLowerBuffered = yExtentDataMin - (range / rangeBufferDivisor)

  const upperBound = Math.max(yExtentDataMax, yRangeUpperBuffered)
  const lowerBound = dataType === 'river' ? Math.max(yRangeLowerBuffered, 0) : yRangeLowerBuffered

  return {
    min: lowerBound,
    max: Math.max(upperBound, MIN_RANGE_VALUE)
  }
}

export function createXScale(observed, forecast, width) {
  const xExtent = extent(observed.concat(forecast), (d) => new Date(d.dateTime))
  const now = new Date()
  const latestTime = Math.max(xExtent[1].getTime(), now.getTime())
  const timeRange = latestTime - xExtent[0].getTime()
  const paddedMax = new Date(latestTime + (timeRange * TIME_RANGE_PADDING))

  const scale = scaleTime().domain([xExtent[0], paddedMax]).range([0, width])

  return { scale, extent: xExtent }
}

export function createYScale(lines, dataType, height) {
  const domain = calculateYScaleDomain(lines, dataType)
  return scaleLinear()
    .domain([domain.min, domain.max])
    .range([height, 0])
    .nice(Y_AXIS_NICE_TICKS)
}

export function createYScaleForRange(lines, dataType, height, timeRange) {
  const bufferDivisor = HISTORIC_TIME_RANGES.has(timeRange)
    ? HISTORIC_BUFFER_DIVISOR
    : RANGE_BUFFER_DIVISOR

  const domain = calculateYScaleDomain(lines, dataType, bufferDivisor)
  return scaleLinear()
    .domain([domain.min, domain.max])
    .range([height, 0])
    .nice(Y_AXIS_NICE_TICKS)
}

export function getYAxisLabelFormatter(yRange) {
  if (yRange < Y_FORMAT_THREE_DP_THRESHOLD) {
    return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_THREE_DP)
  }

  if (yRange < Y_FORMAT_TWO_DP_THRESHOLD) {
    return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_TWO_DP)
  }

  return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_ONE_DP)
}
