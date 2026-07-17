import { axisBottom, axisLeft } from 'd3-axis'
import { select, selectAll } from 'd3-selection'
import { timeFormat } from 'd3-time-format'
import {
  DISPLAYED_HOUR_ON_X_AXIS,
  Y_AXIS_CLASS,
  TEXT_ANCHOR_START,
  TEXT_ANCHOR_MIDDLE,
  TEXT_ANCHOR_ATTR,
  TICK_OFFSET_X1,
  TICK_TEXT_OFFSET_X,
  TIME_LABEL_OFFSET_Y,
  TIME_LABEL_OFFSET_X_MOBILE,
  TIME_LABEL_OFFSET_X_DESKTOP
} from './line-chart-constants.js'
import {
  getAdaptiveYTickCount,
  generateFixedTickValues,
  getVisibleDurationDays,
  formatTickTime,
  generateUniqueYTicks
} from './line-chart-tick-utils.js'
import {
  DATE_LABEL_MODE,
  TIME_AND_DATE_LABEL_MODE,
  MONTH_YEAR_LABEL_MODE,
  getLabelModeForExtent,
  getYAxisLabelFormatter
} from './line-chart-scale-utils.js'

const FIVE_DAY_RANGE = '5d'
const ONE_MONTH_RANGE = '1m'
const SIX_MONTH_RANGE = '6m'
const ONE_YEAR_RANGE = '1y'
const THREE_YEAR_RANGE = '3y'
const FIVE_YEAR_RANGE = '5y'
const TWO_LINE_MONTH_YEAR_RANGES = new Set([SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE])
const X_AXIS_TIME_TSPAN_DY = '15'
const TIME_LABEL_DY = '0.71em'
const FIXED_X_TICK_COUNT = 6
const DEFAULT_REMOVE_LAST_N_TICKS = 0
const MIDNIGHT_HOUR = 0
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 640
const MOBILE_MAX_WIDTH_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`
const MOBILE_Y_TICK_TEXT_OFFSET = 6
const SVG_NAMESPACE_URI = 'http://www.w3.org/2000/svg'
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const MS_PER_DAY = 1000 * 60 * 60 * 24
const FIRST_TICK_OFFSET_DESKTOP = '12'
const FIRST_TICK_OFFSET_MOBILE = '0'
const TIME_INDICATOR_RANGES = [FIVE_DAY_RANGE, ONE_MONTH_RANGE, SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE, FIVE_YEAR_RANGE]
const DAY_ALIGNED_TICK_THRESHOLD_DAYS = 7
const DAY_ALIGNED_MIN_DURATION_DAYS = 4
const FINAL_HISTORIC_ZOOM_THRESHOLD_DAYS = 6.5
const DAY_ALIGNED_RANGES = new Set([SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE])
const DAY_CADENCE_HOUR = DISPLAYED_HOUR_ON_X_AXIS

function isNowVisibleInExtent(xExtent, timeRange, nowMs = Date.now()) {
  if (!TIME_INDICATOR_RANGES.includes(timeRange)) {
    return false
  }

  const minTime = xExtent[0].getTime()
  const maxTime = xExtent[1].getTime()

  return nowMs >= minTime && nowMs <= maxTime
}

function getFiveDayTicksWithTodayEnd(xExtent, nowMs = Date.now()) {
  const maxTime = Math.min(xExtent[1].getTime(), nowMs)
  const minTime = xExtent[0].getTime()

  const endTick = new Date(maxTime)
  const todaySixAm = new Date(maxTime)
  todaySixAm.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0)

  if (todaySixAm.getTime() > maxTime) {
    todaySixAm.setTime(todaySixAm.getTime() - MS_PER_DAY)
  }

  const sixAmTicks = []
  for (let i = 4; i >= 0; i--) {
    const tick = new Date(todaySixAm.getTime() - (i * MS_PER_DAY))
    if (tick.getTime() >= minTime) {
      sixAmTicks.push(tick)
    }
  }

  const ticks = [...sixAmTicks]
  if (ticks.at(-1)?.getTime() !== endTick.getTime()) {
    ticks.push(endTick)
  }

  return ticks
}

function getFixedHourDailyTicks(xExtent, hour = DAY_CADENCE_HOUR) {
  const startMs = xExtent[0].getTime()
  const endMs = xExtent[1].getTime()

  const cursor = new Date(startMs)
  cursor.setHours(hour, 0, 0, 0)
  if (cursor.getTime() < startMs) {
    cursor.setDate(cursor.getDate() + 1)
  }

  const ticks = []
  while (cursor.getTime() <= endMs) {
    ticks.push(new Date(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }

  if (ticks.length > 0) {
    return ticks
  }

  const fallbackTick = new Date(endMs)
  fallbackTick.setHours(hour, 0, 0, 0)
  if (fallbackTick.getTime() > endMs) {
    fallbackTick.setDate(fallbackTick.getDate() - 1)
  }

  return [fallbackTick]
}

function getFixedHourCadenceTicks(xExtent, targetTickCount = FIXED_X_TICK_COUNT, hour = DAY_CADENCE_HOUR, minStepDays = 1) {
  const dailyTicks = getFixedHourDailyTicks(xExtent, hour)
  if (dailyTicks.length <= targetTickCount) {
    if (minStepDays <= 1) {
      return dailyTicks
    }

    const filtered = dailyTicks.filter((tick) => {
      const dayNumber = Math.floor(tick.getTime() / MS_PER_DAY)
      return dayNumber % minStepDays === 0
    })

    if (filtered.length > 0) {
      const lastTick = dailyTicks.at(-1)
      if (lastTick && filtered.at(-1)?.getTime() !== lastTick.getTime()) {
        return [...filtered, lastTick]
      }

      return filtered
    }

    return dailyTicks
  }

  const stepDays = Math.max(minStepDays, Math.ceil((dailyTicks.length - 1) / Math.max(1, targetTickCount - 1)))
  const ticks = dailyTicks.filter((tick) => {
    const dayNumber = Math.floor(tick.getTime() / MS_PER_DAY)
    return dayNumber % stepDays === 0
  }).slice(0, Math.max(1, targetTickCount - 1))

  if (ticks.length === 0 && dailyTicks.length > 0) {
    ticks.push(dailyTicks[0])
  }

  const lastTick = dailyTicks.at(-1)
  if (lastTick && ticks.at(-1)?.getTime() !== lastTick.getTime()) {
    ticks.push(lastTick)
  }

  return ticks.slice(0, targetTickCount)
}

function calculateTickInterval(xExtent, timeRange, _width, nowMs = Date.now()) {
  const labelMode = getLabelModeForExtent(timeRange, xExtent)
  const visibleDurationDays = getVisibleDurationDays(xExtent)
  const isNearFullFiveDayView = timeRange === FIVE_DAY_RANGE && visibleDurationDays >= FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD
  const useDayAlignedTicks =
    DAY_ALIGNED_RANGES.has(timeRange) &&
    visibleDurationDays > DAY_ALIGNED_MIN_DURATION_DAYS &&
    visibleDurationDays <= DAY_ALIGNED_TICK_THRESHOLD_DAYS

  const configFactories = {
    [FIVE_DAY_RANGE]: () => ({
      tickValues: isNearFullFiveDayView
        ? getFiveDayTicksWithTodayEnd(xExtent, nowMs)
        : generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: 1,
      hideFirstTickLabel: !isNearFullFiveDayView
    }),
    [ONE_MONTH_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS,
      hideFirstTickLabel: true
    }),
    [SIX_MONTH_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: 1,
      hideFirstTickLabel: true
    }),
    [ONE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: 1,
      hideFirstTickLabel: true
    }),
    [THREE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: 1,
      hideFirstTickLabel: true
    }),
    [FIVE_YEAR_RANGE]: () => ({
      tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
      labelMode,
      removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS,
      hideFirstTickLabel: true
    })
  }

  const config = (configFactories[timeRange] ?? (() => ({
    tickValues: generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT),
    labelMode,
    removeLastNTicks: DEFAULT_REMOVE_LAST_N_TICKS,
    hideFirstTickLabel: true
  })))()

  // Only remove the rightmost tick label while the live "now" indicator is visible.
  // If users pan/zoom so "now" is out of view, keep a normal rightmost date label.
  const shouldHideRightmostTick = config.removeLastNTicks > 0 && isNowVisibleInExtent(xExtent, timeRange, nowMs)
  config.removeLastNTicks = shouldHideRightmostTick ? config.removeLastNTicks : DEFAULT_REMOVE_LAST_N_TICKS

  if (useDayAlignedTicks) {
    // In zoomed historic views, keep stable midnight cadence and match 5-day tick density.
    const dailyTicks = getFixedHourDailyTicks(xExtent, MIDNIGHT_HOUR)
    config.tickValues = visibleDurationDays <= FINAL_HISTORIC_ZOOM_THRESHOLD_DAYS
      ? generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT)
      : (dailyTicks.length < FIXED_X_TICK_COUNT
          ? generateFixedTickValues(xExtent, FIXED_X_TICK_COUNT)
          : getFixedHourCadenceTicks(xExtent, FIXED_X_TICK_COUNT, MIDNIGHT_HOUR))
    config.hideFirstTickLabel = true
    config.removeLastNTicks = DEFAULT_REMOVE_LAST_N_TICKS
  }

  return config
}

export function getTickConfigForRender(xScale, timeRange, width, nowMs = Date.now()) {
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent, timeRange, width, nowMs)
  tickConfig.timeRange = timeRange
  return tickConfig
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

function makeTspan(text, x, dy) {
  const tspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
  tspan.textContent = text
  if (x !== undefined) {tspan.setAttribute('x', x)}
  if (dy !== undefined) {tspan.setAttribute('dy', dy)}
  return tspan
}

function appendTickTspans(textEl, tickDate, labelMode, isTwoLine) {
  if (labelMode === TIME_AND_DATE_LABEL_MODE) {
    textEl.appendChild(makeTspan(formatTickTime(tickDate)))
    textEl.appendChild(makeTspan(timeFormat('%-e %b')(tickDate), '0', X_AXIS_TIME_TSPAN_DY))
    return
  }

  if (labelMode === MONTH_YEAR_LABEL_MODE) {
    if (isTwoLine) {
      textEl.appendChild(makeTspan(timeFormat('%b')(tickDate)))
      textEl.appendChild(makeTspan(timeFormat('%Y')(tickDate), '0', X_AXIS_TIME_TSPAN_DY))
    } else {
      textEl.appendChild(makeTspan(timeFormat('%b %y')(tickDate)))
    }
    return
  }

  if (labelMode === DATE_LABEL_MODE && isTwoLine) {
    textEl.appendChild(makeTspan(timeFormat('%-e %b')(tickDate)))
    textEl.appendChild(makeTspan(timeFormat('%Y')(tickDate), '0', X_AXIS_TIME_TSPAN_DY))
    return
  }

  textEl.appendChild(makeTspan(timeFormat('%-e %b')(tickDate)))
}

function getOrCreateTickText(tickNode) {
  const existing = tickNode.querySelector('text')
  if (existing) {
    return existing
  }

  const el = document.createElementNS(SVG_NAMESPACE_URI, 'text')
  el.setAttribute('y', '0')
  el.setAttribute('x', '0')
  el.setAttribute('dy', TIME_LABEL_DY)
  el.setAttribute('text-anchor', 'middle')
  tickNode.appendChild(el)
  return el
}

function populateTickLabels(svg, tickConfig) {
  const tickData = svg.select('.x.axis').selectAll('.tick').data()
  const tickElements = Array.from(document.querySelectorAll('.x.axis .tick'))
  const isTwoLine = TWO_LINE_MONTH_YEAR_RANGES.has(tickConfig.timeRange)

  tickElements.forEach((tickNode, i) => {
    const textEl = getOrCreateTickText(tickNode)

    if (textEl.parentNode === tickNode) {
      while (textEl.firstChild) {
        textEl.firstChild.remove()
      }
    }

    if (i < tickData.length) {
      appendTickTspans(textEl, new Date(tickData[i]), tickConfig.labelMode, isTwoLine)
    }
  })
}

export function renderAxes(svg, config) {
  const { xScale, yScale, width, height, timeRange, tickConfig: providedTickConfig } = config
  const isMobileViewport = globalThis.matchMedia?.(MOBILE_MAX_WIDTH_MEDIA_QUERY)?.matches ?? false
  const yTickTextOffset = isMobileViewport ? MOBILE_Y_TICK_TEXT_OFFSET : TICK_TEXT_OFFSET_X
  const tickConfig = providedTickConfig || getTickConfigForRender(xScale, timeRange, width)

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
  if (tickConfig.hideFirstTickLabel) {
    removeFirstTickLabel(svg)
  }
  removeLastTickLabel(svg, tickConfig.removeLastNTicks)
  alignEdgeTickLabels(svg)

  svg.select(Y_AXIS_CLASS).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', yTickTextOffset)
}

export function renderGridLines(svg, xScale, yScale, height, width, _xExtent, timeRange, tickConfigArg = null) {
  const tickConfig = tickConfigArg || getTickConfigForRender(xScale, timeRange, width)
  const visibleExtent = xScale.domain()

  const xGrid = axisBottom(xScale)
    .tickSize(-height, 0, 0)
    .tickFormat('')
    .tickValues(tickConfig.tickValues)

  svg.select('.x.grid')
    .attr('transform', `translate(0,${height})`)
    .call(xGrid)

  svg.select('.x.grid').selectAll('.tick').each(function (d) {
    if (d > visibleExtent[1]) {
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

    // Reset visibility before overlap calculation so labels can reappear as viewport changes.
    tickSelection.select('text').style('display', null)

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

// Re-export scale and tick utilities for backward compatibility
export { createXScale, createYScale, createYScaleForRange, getYAxisLabelFormatter } from './line-chart-scale-utils.js'
