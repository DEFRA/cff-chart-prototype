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

function generateEvenlySpacedTicks(xExtent, count = 8) {
  const ticks = []
  const start = xExtent[0].getTime()
  const end = xExtent[1].getTime()
  const step = (end - start) / (count - 1)

  for (let i = 0; i < count; i++) {
    ticks.push(new Date(start + (step * i)))
  }

  return ticks
}

function calculateTickInterval(xExtent) {
  const timeDiff = xExtent[1] - xExtent[0]
  const days = timeDiff / (1000 * 60 * 60 * 24)
  const tickValues = generateEvenlySpacedTicks(xExtent, 8)

  if (days <= SEVEN_DAYS) {
    return { tickValues, formatTime: true, removeLastNTicks: 1 }
  }

  return { tickValues, formatTime: false, removeLastNTicks: 2 }
}

function formatXAxisLabels(d, i, nodes, showTime, isYearScale = false) {
  const element = select(nodes[i])

  if (showTime) {
    const formattedTime = timeFormat('%-I%p')(new Date(d.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0))).toLocaleLowerCase()
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedTime)
    element.append('tspan').attr('x', 0).attr('dy', '15').text(formattedDate)
    return
  }

  if (isYearScale) {
    element.append('tspan').text(timeFormat('%b %Y')(new Date(d)))
    return
  }

  element.append('tspan').text(timeFormat('%-e %b')(new Date(d)))
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
  const timeRange = xExtent[1] - xExtent[0]
  const paddedMax = new Date(xExtent[1].getTime() + (timeRange * TIME_RANGE_PADDING))

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
  const isYearScale = timeRange === '5y'

  const xAxis = axisBottom()
    .scale(xScale)
    .tickSizeOuter(0)
    .tickFormat('')
    .tickValues(tickConfig.tickValues)

  const yAxis = axisLeft()
    .scale(yScale)
    .ticks(Y_AXIS_NICE_TICKS)
    .tickFormat(d => Number.parseFloat(d).toFixed(1))
    .tickSizeOuter(0)

  svg.select('.x.axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)

  svg.select(Y_AXIS_CLASS)
    .attr('transform', `translate(${width}, 0)`)
    .call(yAxis)

  svg.select('.x.axis').selectAll('text').each((d, i, nodes) => formatXAxisLabels(d, i, nodes, tickConfig.formatTime, isYearScale))

  removeLastTickLabel(svg, tickConfig.removeLastNTicks)

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

  svg.select('.y.grid')
    .attr('transform', 'translate(0, 0)')
    .call(axisLeft(yScale)
      .ticks(Y_AXIS_NICE_TICKS)
      .tickSize(-width, 0, 0)
      .tickFormat('')
    )
}

export function updateTimeIndicator(_svg, timeLabel, timeLine, xScale, height, isMobile) {
  const now = new Date()
  const timeX = Math.floor(xScale(now))

  timeLine.attr('y1', 0).attr('y2', height).attr('transform', `translate(${timeX},0)`)

  timeLabel
    .attr('y', height + TIME_LABEL_OFFSET_Y)
    .attr('transform', `translate(${timeX},0)`)
    .attr('dy', '0.71em')
    .attr('x', isMobile ? TIME_LABEL_OFFSET_X_MOBILE : TIME_LABEL_OFFSET_X_DESKTOP)

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
