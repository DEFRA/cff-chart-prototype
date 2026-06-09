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
  getSixAmMarkersInExtent,
  formatTickTime,
  generateUniqueYTicks,
  snapTickValuesForRange
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
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 640
const MOBILE_MAX_WIDTH_MEDIA_QUERY = `(max-width: ${MOBILE_VIEWPORT_MAX_WIDTH_PX}px)`
const MOBILE_Y_TICK_TEXT_OFFSET = 6
const SVG_NAMESPACE_URI = 'http://www.w3.org/2000/svg'
const FULL_FIVE_DAY_VIEW_DURATION_THRESHOLD = 4.5
const FIRST_TICK_OFFSET_DESKTOP = '12'
const FIRST_TICK_OFFSET_MOBILE = '0'
const TIME_INDICATOR_RANGES = [FIVE_DAY_RANGE, ONE_MONTH_RANGE, SIX_MONTH_RANGE, ONE_YEAR_RANGE, THREE_YEAR_RANGE, FIVE_YEAR_RANGE]

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
        if (TWO_LINE_MONTH_YEAR_RANGES.has(tickConfig.timeRange)) {
          const monthTspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          monthTspan.textContent = timeFormat('%b')(tickDate)
          textEl.appendChild(monthTspan)

          const yearTspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          yearTspan.setAttribute('x', '0')
          yearTspan.setAttribute('dy', X_AXIS_TIME_TSPAN_DY)
          yearTspan.textContent = timeFormat('%Y')(tickDate)
          textEl.appendChild(yearTspan)
        } else {
          const tspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          tspan.textContent = timeFormat('%b %y')(tickDate)
          textEl.appendChild(tspan)
        }
      } else if (tickConfig.labelMode === DATE_LABEL_MODE) {
        if (TWO_LINE_MONTH_YEAR_RANGES.has(tickConfig.timeRange)) {
          const dateTspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          dateTspan.textContent = timeFormat('%-e %b')(tickDate)
          textEl.appendChild(dateTspan)

          const yearTspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          yearTspan.setAttribute('x', '0')
          yearTspan.setAttribute('dy', X_AXIS_TIME_TSPAN_DY)
          yearTspan.textContent = timeFormat('%Y')(tickDate)
          textEl.appendChild(yearTspan)
        } else {
          const tspan = document.createElementNS(SVG_NAMESPACE_URI, 'tspan')
          tspan.textContent = timeFormat('%-e %b')(tickDate)
          textEl.appendChild(tspan)
        }
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
  tickConfig.timeRange = timeRange

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

// Re-export scale and tick utilities for backward compatibility
export { createXScale, createYScale, getYAxisLabelFormatter } from './line-chart-scale-utils.js'
