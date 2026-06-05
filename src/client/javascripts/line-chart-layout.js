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
  TIME_LABEL_OFFSET_X_DESKTOP
} from './line-chart-constants.js'

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
const TIME_INDICATOR_RANGES = [FIVE_DAY_RANGE, ONE_MONTH_RANGE, SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE, FIVE_YEAR_RANGE]
const DEFAULT_REMOVE_LAST_N_TICKS = 0
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 640
const MOBILE_MAX_WIDTH_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`
const MOBILE_Y_TICK_TEXT_OFFSET = 6
const FIXED_X_TICK_COUNT = 6
const TIME_AND_DATE_DURATION_THRESHOLD_DAYS = 2
const DATE_DURATION_THRESHOLD_DAYS = 120
const SVG_NAMESPACE_URI = 'http://www.w3.org/2000/svg'
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const SIX_AM_HOUR = 6
const FIRST_TICK_OFFSET_DESKTOP = '12'
const FIRST_TICK_OFFSET_MOBILE = '0'

function getTickSnapIntervalMs(timeRange) {
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

function snapTickValuesForRange(tickValues, timeRange, xExtent) {
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

function generateFixedTickValues(xExtent, tickCount = FIXED_X_TICK_COUNT, useSixAmAlignment = false) {
  const ticks = []
  const start = xExtent[0].getTime()
  const end = xExtent[1].getTime()
  const durationDays = (end - start) / MS_PER_DAY

  if (!Number.isFinite(start) || !Number.isFinite(end) || tickCount < 2 || end <= start) {
    return generateEvenlySpacedTicks(xExtent)
  }

  if (useSixAmAlignment && durationDays >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD) {
    // Keep production-style 6am alignment only for near full 5d view.
    // As users zoom in, fall back to evenly spaced ticks so point count stays stable.
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

  // For longer ranges, use evenly spaced ticks
  const step = (end - start) / (tickCount - 1)
  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(start + (step * i)))
  }

  return ticks
}


function getVisibleDurationDays(xExtent) {
  const startMs = new Date(xExtent[0]).getTime()
  const endMs = new Date(xExtent[1]).getTime()
  return (endMs - startMs) / MS_PER_DAY
}

function getSixAmMarkersInExtent(xExtent) {
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

function getLabelModeForExtent(timeRange, xExtent) {
  const durationDays = getVisibleDurationDays(xExtent)

  if (timeRange === FIVE_DAY_RANGE || durationDays <= TIME_AND_DATE_DURATION_THRESHOLD_DAYS) {
    return TIME_AND_DATE_LABEL_MODE
  }

  if (durationDays <= DATE_DURATION_THRESHOLD_DAYS) {
    return DATE_LABEL_MODE
  }

  return MONTH_YEAR_LABEL_MODE
}

function calculateTickInterval(xExtent, timeRange, _width) {
  const labelMode = getLabelModeForExtent(timeRange, xExtent)

  const configFactories = {
    [FIVE_DAY_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT, true),
      labelMode,
      removeLastNTicks: 1
    }),
    [ONE_MONTH_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent),
      labelMode,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    }),
    [SIX_MONTH_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent),
      labelMode,
      removeLastNTicks: 1
    }),
    [ONE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent),
      labelMode,
      removeLastNTicks: 1
    }),
    [THREE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent),
      labelMode,
      removeLastNTicks: 1
    }),
    [FIVE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent),
      labelMode,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
    })
  }

  const config = (configFactories[timeRange] ?? (() => ({
    tickValues: generateFixedTickValues(xExtent),
    labelMode,
    removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS
  })))()

  return {
    ...config,
    tickValues: snapTickValuesForRange(config.tickValues, timeRange, xExtent)
  }
}

function formatTickTime(date) {
  const hasMinutes = date.getMinutes() !== 0
  const formatPattern = hasMinutes ? '%-I:%M%p' : '%-I%p'
  return timeFormat(formatPattern)(date).toLocaleLowerCase()
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

function removeFirstTickLabel(svg) {
  const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
  const tickCount = xAxisTicks.size()

  if (tickCount > 0) {
    const firstTick = xAxisTicks.nodes()[0]
    select(firstTick).select('text').remove()
  }
}

function alignEdgeTickLabels(svg) {
  const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
  const tickCount = xAxisTicks.size()
  const isMobileViewport = globalThis.matchMedia?.(MOBILE_MAX_WIDTH_MEDIA_QUERY)?.matches ?? false
  const firstTickOffset = isMobileViewport ? FIRST_TICK_OFFSET_MOBILE : FIRST_TICK_OFFSET_DESKTOP

  if (tickCount === 0) {
    return
  }

  const firstTickText = select(xAxisTicks.nodes()[0]).select('text')
  if (!firstTickText.empty()) {
    firstTickText.style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_MIDDLE)

    if (firstTickOffset === FIRST_TICK_OFFSET_MOBILE) {
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

function populateTickLabels(svg, tickConfig) {
  const tickData = svg.select('.x.axis').selectAll('.tick').data()
  const tickElements = Array.from(document.querySelectorAll('.x.axis .tick'))
  
  tickElements.forEach((tickNode, i) => {
    const textEl = tickNode.querySelector('text') || (() => {
      const el = document.createElementNS(SVG_NAMESPACE_URI, 'text')
      el.setAttribute('y', '0')
      el.setAttribute('x', '0')
      el.setAttribute('dy', TIME_LABEL_DY)
      el.setAttribute('text-anchor', 'middle')
      tickNode.appendChild(el)
      return el
    })()
    
    if (textEl.parentNode === tickNode) {
      while (textEl.firstChild) {
        textEl.firstChild.remove()
      }
    }
    
    if (i < tickData.length) {
      const tickDate = new Date(tickData[i])
      
      if (tickConfig.labelMode === TIME_AND_DATE_LABEL_MODE) {
        const tspan1 = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
        tspan1.textContent = formatTickTime(tickDate)
        textEl.appendChild(tspan1)
        
        const tspan2 = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
        tspan2.setAttribute('x', '0')
        tspan2.setAttribute('dy', X_AXIS_TIME_TSPAN_DY)
        tspan2.textContent = timeFormat('%-e %b')(tickDate)
        textEl.appendChild(tspan2)
      } else if (tickConfig.labelMode === MONTH_YEAR_LABEL_MODE) {
        const tspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
        tspan.textContent = timeFormat('%b %y')(tickDate)
        textEl.appendChild(tspan)
      } else {
        const tspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
        tspan.textContent = timeFormat('%-e %b')(tickDate)
        textEl.appendChild(tspan)
      }
    }
  })
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

  populateTickLabels(svg, tickConfig)
  removeFirstTickLabel(svg)
  removeLastTickLabel(svg, tickConfig.removeLastNTicks)
  alignEdgeTickLabels(svg)

  svg.select(Y_AXIS_CLASS).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', yTickTextOffset)
}

export function renderGridLines(svg, xScale, yScale, height, width, xExtent, timeRange) {
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent, timeRange, width)
  const useFiveDaySixAmMarkers = timeRange === FIVE_DAY_RANGE && getVisibleDurationDays(visibleExtent) >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD
  const gridTickValues = useFiveDaySixAmMarkers
    ? Array.from(new Set([
      ...tickConfig.tickValues.map((tick) => new Date(tick).getTime()),
      ...getSixAmMarkersInExtent(visibleExtent).map((tick) => tick.getTime())
    ])).sort((a, b) => a - b).map((tick) => new Date(tick))
    : tickConfig.tickValues

  const xGrid = axisBottom(xScale)
    .tickSize(-height, 0, 0)
    .tickFormat('')
    .tickValues(gridTickValues)

  svg.select('.x.grid')
    .attr('transform', `translate(0,${height})`)
    .call(xGrid)

  const maxVisibleTick = useFiveDaySixAmMarkers ? visibleExtent[1] : xExtent[1]

  svg.select('.x.grid').selectAll('.tick').each(function (d) {
    if (d > maxVisibleTick) {
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

export function hideOverlappingTicks(timeLabel, _timeRange) {
  const timeLabelNode = timeLabel.node()
  if (!timeLabelNode) {
    return
  }

  const timeLabelRect = timeLabelNode.getBoundingClientRect()
  const ticks = selectAll('.x .tick')

  for (const tick of ticks.nodes()) {
    const tickSelection = select(tick)
    const tickText = tickSelection.select('text').node()

    if (!tickText) {
      continue
    }

    const isAlreadyHidden = tickText.style.display === 'none'

    // If already hidden, keep it hidden
    if (isAlreadyHidden) {
      continue
    }

    const tickRect = tickText.getBoundingClientRect()

    // Check if tick overlaps with time label
    const overlaps =
      tickRect.right > timeLabelRect.left &&
      tickRect.left < timeLabelRect.right &&
      tickRect.bottom > timeLabelRect.top &&
      tickRect.top < timeLabelRect.bottom

    tickSelection.select('text').style('display', overlaps ? 'none' : null)
  }
}
