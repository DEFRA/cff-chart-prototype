import { extent } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { getVisibleDurationDays } from './line-chart-tick-utils.js'

const FIVE_DAY_RANGE = '5d'
const TIME_RANGE_PADDING = 0.05
const Y_AXIS_NICE_TICKS = 5
const Y_FORMAT_THREE_DP_THRESHOLD = 0.1
const Y_FORMAT_TWO_DP_THRESHOLD = 1
const Y_FORMAT_THREE_DP = 3
const Y_FORMAT_TWO_DP = 2
const Y_FORMAT_ONE_DP = 1
const MIN_RANGE_VALUE = 0.001
const RANGE_BUFFER_DIVISOR = 10
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

export function calculateYScaleDomain(lines, dataType) {
  const yExtent = extent(lines, (d) => d.value)
  const yExtentDataMin = yExtent[0]
  const yExtentDataMax = yExtent[1]

  let range = yExtentDataMax - yExtentDataMin
  range = Math.max(range, MIN_RANGE_VALUE)

  const yRangeUpperBuffered = yExtentDataMax + (range / RANGE_BUFFER_DIVISOR)
  const yRangeLowerBuffered = yExtentDataMin - (range / RANGE_BUFFER_DIVISOR)

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

export function getYAxisLabelFormatter(yRange) {
  if (yRange < Y_FORMAT_THREE_DP_THRESHOLD) {
    return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_THREE_DP)
  }

  if (yRange < Y_FORMAT_TWO_DP_THRESHOLD) {
    return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_TWO_DP)
  }

  return (value) => Number.parseFloat(value).toFixed(Y_FORMAT_ONE_DP)
}
