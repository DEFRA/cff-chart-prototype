import { axisBottom, axisLeft } from 'd3-axis'
import { extent } from 'd3-array'
import { scaleLinear, scaleTime } from 'd3-scale'
import { select, selectAll } from 'd3-selection'
import { timeFormat } from 'd3-time-format'
import {
  DISPLAYED_HOUR_ON_X_AXIS,
  Y_AXIS_CLASS,
  TEXT_ANCHOR_START,
  TEXT_ANCHOR_MIDDLE,
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
  TICK_OVERLAP_MARGIN
} from './line-chart-constants.js'

const MS_PER_DAY = 1000 * 60 * 60 * 24
const VERY_ZOOMED_DAY_THRESHOLD = 1
const VERY_ZOOMED_TICK_COUNT = 3
const REDUCED_TICK_COUNT = 4
const FIVE_DAY_RANGE = '5d'
const ONE_MONTH_RANGE = '1m'
const SIX_MONTH_RANGE = '6m'
const TICK_HIDDEN_CLASS = 'tick--hidden'
const ONE_YEAR_RANGE = '1y'
const THREE_YEAR_RANGE = '3y'
const FIVE_YEAR_RANGE = '5y'
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
const TIME_LABEL_DY = '0.71em'
const DATE_LABEL_MODE = 'date'
const TIME_AND_DATE_LABEL_MODE = 'time-date'
const MONTH_YEAR_LABEL_MODE = 'month-year'
const MOBILE_CHART_WIDTH_THRESHOLD = 520
const VERY_NARROW_CHART_WIDTH_THRESHOLD = 390
const TIME_INDICATOR_RANGES = [FIVE_DAY_RANGE, ONE_MONTH_RANGE, SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE, FIVE_YEAR_RANGE]
const DEFAULT_REMOVE_LAST_N_TICKS = 0
const ONE_MONTH_DAY_STEP_MOBILE = 4
const ONE_MONTH_DAY_STEP_DESKTOP = 2
const MONTH_STEP_MOBILE = 1
const MONTH_STEP_DESKTOP = 1
const ONE_YEAR_MONTH_STEP_MOBILE = 2
const ONE_YEAR_MONTH_STEP_DESKTOP = 1
const THREE_YEAR_MONTH_STEP_VERY_NARROW = 6
const THREE_YEAR_MONTH_STEP_NARROW = 4
const THREE_YEAR_MONTH_STEP_DESKTOP = 2
const FIVE_YEAR_MONTH_STEP_MOBILE = 12
const FIVE_YEAR_MONTH_STEP_DESKTOP = 6
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 640
const MOBILE_MAX_WIDTH_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`
const MOBILE_Y_TICK_TEXT_OFFSET = 6
const MOBILE_TICK_OVERLAP_MARGIN = 2

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

function generateFiveDayTicks(xExtent, dayStep = 1) {
  const start = new Date(xExtent[0])
  const end = new Date(xExtent[1])

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  // For the 5-day chart, align labels to full days after the partial first day.
  const firstTick = new Date(start)
  firstTick.setDate(firstTick.getDate() + 1)
  firstTick.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0)

  end.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0)

  const ticks = []
  const currentTick = new Date(firstTick)

  while (true) {
    if (currentTick > end) {
      break
    }

    ticks.push(new Date(currentTick))
    currentTick.setDate(currentTick.getDate() + dayStep)
  }

  return ticks.length > 0 ? ticks : generateEvenlySpacedTicks(xExtent)
}

function generateMonthTicks(xExtent, monthStep = 1) {
  const start = new Date(xExtent[0])
  const end = new Date(xExtent[1])

  const firstMonthTick = new Date(start.getFullYear(), start.getMonth(), 1)
  firstMonthTick.setMonth(firstMonthTick.getMonth() + 1)

  const ticks = []
  const currentTick = new Date(firstMonthTick)

  while (true) {
    if (currentTick > end) {
      break
    }

    ticks.push(new Date(currentTick))
    currentTick.setMonth(currentTick.getMonth() + monthStep)
  }

  return ticks.length > 0 ? ticks : generateEvenlySpacedTicks(xExtent)
}

function generateOneMonthTicks(xExtent, dayStep = 2) {
  const start = new Date(xExtent[0])
  const end = new Date(xExtent[1])

  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const firstTick = new Date(start)
  firstTick.setDate(firstTick.getDate() + 1)

  const ticks = []
  const currentTick = new Date(firstTick)

  while (true) {
    if (currentTick > end) {
      break
    }

    ticks.push(new Date(currentTick))
    currentTick.setDate(currentTick.getDate() + dayStep)
  }

  return ticks.length > 0 ? ticks : generateEvenlySpacedTicks(xExtent)
}

function getThreeYearMonthStep(isVeryNarrowChart, isNarrowChart) {
  if (isVeryNarrowChart) {
    return THREE_YEAR_MONTH_STEP_VERY_NARROW
  }

  if (isNarrowChart) {
    return THREE_YEAR_MONTH_STEP_NARROW
  }

  return THREE_YEAR_MONTH_STEP_DESKTOP
}

function calculateTickInterval(xExtent, timeRange, width) {
  const isNarrowChart = width <= MOBILE_CHART_WIDTH_THRESHOLD
  const isVeryNarrowChart = width <= VERY_NARROW_CHART_WIDTH_THRESHOLD
  const threeYearMonthStep = getThreeYearMonthStep(isVeryNarrowChart, isNarrowChart)

  const configFactories = {
    [FIVE_DAY_RANGE]: () => ({
      tickValues: generateFiveDayTicks(xExtent),
      labelMode: TIME_AND_DATE_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [ONE_MONTH_RANGE]: () => ({
      tickValues: generateOneMonthTicks(xExtent, isNarrowChart ? ONE_MONTH_DAY_STEP_MOBILE : ONE_MONTH_DAY_STEP_DESKTOP),
      labelMode: DATE_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [SIX_MONTH_RANGE]: () => ({
      tickValues: generateMonthTicks(xExtent, isNarrowChart ? MONTH_STEP_MOBILE : MONTH_STEP_DESKTOP),
      labelMode: MONTH_YEAR_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [ONE_YEAR_RANGE]: () => ({
      tickValues: generateMonthTicks(xExtent, isNarrowChart ? ONE_YEAR_MONTH_STEP_MOBILE : ONE_YEAR_MONTH_STEP_DESKTOP),
      labelMode: MONTH_YEAR_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [THREE_YEAR_RANGE]: () => ({
      tickValues: generateMonthTicks(xExtent, threeYearMonthStep),
      labelMode: MONTH_YEAR_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [FIVE_YEAR_RANGE]: () => ({
      tickValues: generateMonthTicks(xExtent, isNarrowChart ? FIVE_YEAR_MONTH_STEP_MOBILE : FIVE_YEAR_MONTH_STEP_DESKTOP),
      labelMode: MONTH_YEAR_LABEL_MODE,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    })
  }

  return (configFactories[timeRange] ?? (() => ({
    tickValues: generateEvenlySpacedTicks(xExtent),
    labelMode: DATE_LABEL_MODE,
    removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
  })))()
}

function formatXAxisLabels(d, i, nodes, labelMode) {
  const element = select(nodes[i])

  if (labelMode === TIME_AND_DATE_LABEL_MODE) {
    const timeDate = new Date(d)
    timeDate.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0)
    const formattedTime = timeFormat('%-I%p')(timeDate).toLocaleLowerCase()
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedTime)
    element.append('tspan').attr('x', 0).attr('dy', X_AXIS_TIME_TSPAN_DY).text(formattedDate)
    return
  }

  if (labelMode === MONTH_YEAR_LABEL_MODE) {
    element.append('tspan').text(timeFormat('%b %y')(new Date(d)))
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
  const isMobileViewport = globalThis.matchMedia?.(MOBILE_MAX_WIDTH_MEDIA_QUERY)?.matches ?? false
  const firstTickOffset = isMobileViewport ? '0' : '12'

  if (tickCount === 0) {
    return
  }

  const firstTickText = select(xAxisTicks.nodes()[0]).select('text')
  if (!firstTickText.empty()) {
    firstTickText.style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_MIDDLE)

    if (firstTickOffset === '0') {
      return
    }

    firstTickText.selectAll('tspan').each(function () {
      const tspan = select(this)
      const currentX = tspan.attr('x')
      if (currentX !== null) {
        tspan.attr('x', firstTickOffset)
      } else {
        tspan.attr('dx', firstTickOffset)
      }
    })
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
  const isMobileViewport = globalThis.matchMedia?.(MOBILE_MAX_WIDTH_MEDIA_QUERY)?.matches ?? false
  const yTickTextOffset = isMobileViewport ? MOBILE_Y_TICK_TEXT_OFFSET : TICK_TEXT_OFFSET_X
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent, timeRange, width)

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

  svg.select('.x.axis').selectAll('text').each((d, i, nodes) => formatXAxisLabels(d, i, nodes, tickConfig.labelMode))

  removeLastTickLabel(svg, tickConfig.removeLastNTicks)
  alignEdgeTickLabels(svg)

  svg.select(Y_AXIS_CLASS).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', yTickTextOffset)
}

export function renderGridLines(svg, xScale, yScale, height, width, xExtent, timeRange) {
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent, timeRange, width)

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

export function updateTimeIndicator(_svg, timeLabel, timeLine, xScale, height, isMobile, timeRange) {
  const allowTimeIndicator = TIME_INDICATOR_RANGES.includes(timeRange)

  if (!allowTimeIndicator) {
    timeLine.style('display', 'none')
    timeLabel.style('display', 'none')
    return
  }

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

function overlapsWithTimeLabel(textRect, isTimeLabelHidden, timeNowX, timeNowWidth, overlapMargin) {
  if (isTimeLabelHidden) {
    return false
  }

  return (textRect.right + overlapMargin) > timeNowX &&
    textRect.left <= (timeNowX + timeNowWidth + overlapMargin)
}

function shouldHideTickLabel(isOverlapWithNow, isOverlapWithPreviousTick, preserveDenseDayTicks) {
  if (preserveDenseDayTicks) {
    return isOverlapWithNow
  }

  return isOverlapWithNow || isOverlapWithPreviousTick
}

function processTickVisibility(tick, context, lastVisibleTickRight) {
  const tickSelection = select(tick)
  const tickText = tickSelection.select('text')

  if (tickText.empty()) {
    tickSelection.classed(TICK_HIDDEN_CLASS, false)
    return lastVisibleTickRight
  }

  // Reset visibility before measuring, otherwise previously-hidden labels
  // can report zero-width bounds after zoom/pan redraws.
  tickText.style('display', null)

  const textRect = tickText.node().getBoundingClientRect()
  const isOverlapWithNow = overlapsWithTimeLabel(
    textRect,
    context.isTimeLabelHidden,
    context.timeNowX,
    context.timeNowWidth,
    context.overlapMargin
  )

  const isOverlapWithPreviousTick = textRect.left <= (lastVisibleTickRight + context.overlapMargin)

  const shouldHideTick = shouldHideTickLabel(
    isOverlapWithNow,
    isOverlapWithPreviousTick,
    context.preserveDenseDayTicks
  )

  tickSelection.classed(TICK_HIDDEN_CLASS, shouldHideTick)
  tickText.style('display', shouldHideTick ? 'none' : null)

  return shouldHideTick ? lastVisibleTickRight : textRect.right
}

function shouldSkipOverlapDetection(timeRange, isMobileViewport, timeLabelNode, timeLabelRect) {
  if (timeRange === FIVE_DAY_RANGE && !isMobileViewport) {
    return true
  }

  if (!timeLabelNode) {
    return true
  }

  if (timeLabelRect.width === 0 || timeLabelRect.height === 0) {
    return true
  }

  if (timeLabelRect.left <= 0 || timeLabelRect.right <= 0) {
    return true
  }

  return false
}

function buildTickContext(timeLabel, isMobileViewport, overlapMargin, preserveDenseDayTicks) {
  const timeLabelRect = timeLabel.node().getBoundingClientRect()
  const isTimeLabelHidden = timeLabel.style('display') === 'none'

  return {
    isTimeLabelHidden,
    timeNowX: timeLabelRect.left,
    timeNowWidth: timeLabelRect.width,
    overlapMargin,
    preserveDenseDayTicks
  }
}

export function hideOverlappingTicks(timeLabel, timeRange) {
  const ticks = selectAll('.x .tick')
  const timeLabelNode = timeLabel.node()
  const isMobileViewport = globalThis.matchMedia?.(MOBILE_MAX_WIDTH_MEDIA_QUERY)?.matches ?? false
  const overlapMargin = isMobileViewport ? MOBILE_TICK_OVERLAP_MARGIN : TICK_OVERLAP_MARGIN
  const preserveDenseDayTicks = isMobileViewport && timeRange === FIVE_DAY_RANGE

  // always clear stale hidden state first so early returns cannot leave
  // all x-axis labels stuck with inline display:none.
  for (const tick of ticks.nodes()) {
    const tickSelection = select(tick)
    tickSelection.classed(TICK_HIDDEN_CLASS, false)
    tickSelection.select('text').style('display', null)
  }

  const timeLabelRect = timeLabelNode?.getBoundingClientRect()
  if (!timeLabelRect || shouldSkipOverlapDetection(timeRange, isMobileViewport, timeLabelNode, timeLabelRect)) {
    return
  }

  const context = buildTickContext(timeLabel, isMobileViewport, overlapMargin, preserveDenseDayTicks)
  let lastVisibleTickRight = Number.NEGATIVE_INFINITY

  for (const tick of ticks.nodes()) {
    lastVisibleTickRight = processTickVisibility(tick, context, lastVisibleTickRight)
  }
}
