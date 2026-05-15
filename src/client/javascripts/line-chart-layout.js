import { axisBottom, axisLeft } from 'd3-axis'
import { extent } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { select, selectAll } from 'd3-selection'
import { timeFormat } from 'd3-time-format'
import {
  DISPLAYED_HOUR_ON_X_AXIS,
  Y_AXIS_CLASS,
  TEXT_ANCHOR_START,
  TEXT_ANCHOR_ATTR,
  RANGE_BUFFER_DIVISOR,
  MIN_RANGE_VALUE,
  TIME_RANGE_PADDING,
  Y_AXIS_NICE_TICKS,
  TICK_OFFSET_X1,
  TICK_TEXT_OFFSET_X,
  TIME_LABEL_OFFSET_Y,
  TIME_LABEL_OFFSET_X_MOBILE,
  TIME_LABEL_OFFSET_X_DESKTOP,
  TICK_OVERLAP_MARGIN,
  SEVEN_DAYS
} from './line-chart-constants.js'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const VERY_ZOOMED_DAY_THRESHOLD = 1
const VERY_ZOOMED_TICK_COUNT = 3
const REDUCED_TICK_COUNT = 4
const X_AXIS_TIME_TSPAN_DY = '15'
const Y_RANGE_SMALL_THRESHOLD = 1
const Y_RANGE_MEDIUM_THRESHOLD = 10
const Y_TICK_COUNT_SMALL = 4
const Y_TICK_COUNT_MEDIUM = 5
const Y_TICK_COUNT_LARGE = 6
const Y_FORMAT_THREE_DP_THRESHOLD = 0.1
const Y_FORMAT_TWO_DP_THRESHOLD = 1
const Y_FORMAT_THREE_DP = 3
const Y_FORMAT_TWO_DP = 2
const Y_FORMAT_ONE_DP = 1
const FLOAT_DEDUPE_PRECISION = 100000
const FLOAT_DEDUPE_DECIMALS = 5
const MIN_UNIQUE_TICKS = 2
const FIRST_TICK_TEXT_OFFSET_X = '2'
const TIME_LABEL_DY = '0.71em'
const LAST_TICKS_TO_REMOVE_WITH_TIME = 1
const LAST_TICKS_TO_REMOVE_WITHOUT_TIME = 1

function getAdaptiveYTickCount(yRange) {
  if (yRange < Y_RANGE_SMALL_THRESHOLD) {
    return Y_TICK_COUNT_SMALL
  }

  if (yRange < Y_RANGE_MEDIUM_THRESHOLD) {
    return Y_TICK_COUNT_MEDIUM
  }

  return Y_TICK_COUNT_LARGE
}

function generateEvenlySpacedTicks(xExtent) {
  const ticks = []
  const start = xExtent[0].getTime()
  const end = xExtent[1].getTime()
  const durationMs = end - start
  const durationDays = durationMs / MS_PER_DAY
  
  // Aggressively reduce ticks for better mobile readability
  const tickCount = durationDays < VERY_ZOOMED_DAY_THRESHOLD
    ? VERY_ZOOMED_TICK_COUNT
    : REDUCED_TICK_COUNT
  
  const step = (end - start) / (tickCount - 1)

  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(start + (step * i)))
  }

  return ticks
}

function calculateTickInterval(xExtent) {
  const timeDiff = xExtent[1] - xExtent[0]
  const days = timeDiff / MS_PER_DAY
  const tickValues = generateEvenlySpacedTicks(xExtent)

  if (days <= SEVEN_DAYS) {
    return { tickValues, formatTime: true, removeLastNTicks: LAST_TICKS_TO_REMOVE_WITH_TIME }
  }

  return { tickValues, formatTime: false, removeLastNTicks: LAST_TICKS_TO_REMOVE_WITHOUT_TIME }
}

function formatXAxisLabels(d, i, nodes, showTime, isYearScale = false) {
  const element = select(nodes[i])

  if (showTime) {
    const formattedTime = timeFormat('%-I%p')(new Date(d.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0))).toLocaleLowerCase()
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedTime)
    element.append('tspan').attr('x', 0).attr('dy', X_AXIS_TIME_TSPAN_DY).text(formattedDate)
    return
  }

  if (isYearScale) {
    element.append('tspan').text(timeFormat('%b %Y')(new Date(d)))
    return
  }

  element.append('tspan').text(timeFormat('%-e %b')(new Date(d)))
}

function generateUniqueYTicks(yScale, desiredCount) {
  const [min, max] = yScale.domain()
  const range = max - min
  
  // For very small ranges, always generate manual ticks to avoid D3's duplicate behavior
  if (range < 1) {
    const manualRangeTicks = []
    for (let i = 0; i < desiredCount; i++) {
      manualRangeTicks.push(min + ((max - min) * i) / (desiredCount - 1))
    }
    return manualRangeTicks
  }
  
  // For larger ranges, try D3's ticks but deduplicate
  const generatedTicks = yScale.ticks(desiredCount)
  
  const uniqueTicks = []
  const seen = new Set()
  
  for (const tick of generatedTicks) {
    // Round to 5 decimal places to catch floating-point duplicates
    const rounded = Math.round(tick * FLOAT_DEDUPE_PRECISION) / FLOAT_DEDUPE_PRECISION
    const roundedStr = rounded.toFixed(FLOAT_DEDUPE_DECIMALS)
    
    if (!seen.has(roundedStr)) {
      seen.add(roundedStr)
      uniqueTicks.push(tick)
    }
  }
  
  // If deduplication removed too many, fall back to manual generation
  if (uniqueTicks.length < MIN_UNIQUE_TICKS) {
    const manualTicks = []
    for (let i = 0; i < desiredCount; i++) {
      manualTicks.push(min + ((max - min) * i) / (desiredCount - 1))
    }
    return manualTicks
  }
  
  return uniqueTicks
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

function removeLastTickLabel(svg, count = 1) {
  const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
  const tickCount = xAxisTicks.size()

  if (tickCount > 0) {
    for (let i = 0; i < count && i < tickCount; i++) {
      const tickIndex = tickCount - 1 - i
      const tick = xAxisTicks.nodes()[tickIndex]
      select(tick).select('text').remove()
    }
  }
}

function alignEdgeTickLabels(svg) {
  const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
  const tickCount = xAxisTicks.size()

  if (tickCount === 0) {
    return
  }

  const firstTickText = select(xAxisTicks.nodes()[0]).select('text')
  if (!firstTickText.empty()) {
    firstTickText
      .style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
      .attr('dx', FIRST_TICK_TEXT_OFFSET_X)
  }
}

function calculateYScaleDomain(lines, dataType) {
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

export function renderAxes(svg, config) {
  const { xScale, yScale, width, height, timeRange } = config
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent)
  const isYearScale = timeRange === '1y' || timeRange === '3y' || timeRange === '5y'

  const xAxis = axisBottom()
    .scale(xScale)
    .tickSizeOuter(0)
    .tickFormat('')
    .tickValues(tickConfig.tickValues)

  // Generate smart Y-axis ticks that respect the scale's domain
  const yDomain = yScale.domain()
  const yRange = yDomain[1] - yDomain[0]
  
  // Calculate appropriate tick count based on domain range
  const yTickCount = getAdaptiveYTickCount(yRange)
  
  // Generate unique ticks without duplicates
  const yTickValues = generateUniqueYTicks(yScale, yTickCount)
  const yAxisTickFormat = getYAxisLabelFormatter(yRange)
  
  const yAxis = axisLeft()
    .scale(yScale)
    .tickValues(yTickValues)
    .tickFormat(yAxisTickFormat)
    .tickSizeOuter(0)

  svg.select('.x.axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)

  svg.select(Y_AXIS_CLASS)
    .attr('transform', `translate(${width}, 0)`)
    .call(yAxis)

  svg.select('.x.axis').selectAll('text').each((d, i, nodes) => formatXAxisLabels(d, i, nodes, tickConfig.formatTime, isYearScale))

  removeLastTickLabel(svg, tickConfig.removeLastNTicks)
  alignEdgeTickLabels(svg)

  svg.select(Y_AXIS_CLASS).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', TICK_TEXT_OFFSET_X)
}

export function renderGridLines(svg, xScale, yScale, height, width, xExtent) {
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent)

  const xGrid = axisBottom(xScale)
    .tickSize(-height, 0, 0)
    .tickFormat('')
    .tickValues(tickConfig.tickValues)

  svg.select('.x.grid')
    .attr('transform', `translate(0,${height})`)
    .call(xGrid)

  svg.select('.x.grid').selectAll('.tick').each(function (d) {
    if (d > xExtent[1]) {
      select(this).remove()
    }
  })

  // Use same smart tick calculation as renderAxes for consistency
  const yDomain = yScale.domain()
  const yRange = yDomain[1] - yDomain[0]
  
  const yTickCount = getAdaptiveYTickCount(yRange)
  
  const yTickValues = generateUniqueYTicks(yScale, yTickCount)

  svg.select('.y.grid')
    .attr('transform', 'translate(0, 0)')
    .call(axisLeft(yScale)
      .tickValues(yTickValues)
      .tickSize(-width, 0, 0)
      .tickFormat('')
    )
}

export function updateTimeIndicator(_svg, timeLabel, timeLine, xScale, height, isMobile) {
  const now = new Date()
  const timeX = Math.floor(xScale(now))
  const [rangeMin, rangeMax] = xScale.range()
  const isVisible = timeX >= rangeMin && timeX <= rangeMax

  timeLine
    .attr('y1', 0)
    .attr('y2', height)
    .attr('transform', `translate(${timeX},0)`)
    .style('display', isVisible ? null : 'none')

  timeLabel
    .attr('y', height + TIME_LABEL_OFFSET_Y)
    .attr('transform', `translate(${timeX},0)`)
    .attr('dy', TIME_LABEL_DY)
    .attr('x', isMobile ? TIME_LABEL_OFFSET_X_MOBILE : TIME_LABEL_OFFSET_X_DESKTOP)
    .style('display', isVisible ? null : 'none')

  timeLabel.select('.time-now-text__time')
    .text(timeFormat('%-I:%M%p')(now).toLowerCase())

  timeLabel.select('.time-now-text__date')
    .text(timeFormat('%-e %b')(now))
}

export function hideOverlappingTicks(timeLabel) {
  const timeNowX = timeLabel.node().getBoundingClientRect().left
  const timeNowWidth = timeLabel.node().getBoundingClientRect().width
  const ticks = selectAll('.x .tick')

  for (const tick of ticks.nodes()) {
    const tickX = tick.getBoundingClientRect().left
    const tickWidth = tick.getBoundingClientRect().width
    const isOverlap = (tickX + tickWidth + TICK_OVERLAP_MARGIN) > timeNowX && tickX <= (timeNowX + timeNowWidth + TICK_OVERLAP_MARGIN)
    select(tick).classed('tick--hidden', isOverlap)
  }
}
