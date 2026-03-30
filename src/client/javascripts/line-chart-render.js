import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape'
import { select } from 'd3-selection'
import { timeFormat } from 'd3-time-format'
import {
  ARIA_HIDDEN,
  ARIA_HIDDEN_STRING,
  TEXT_ANCHOR_START,
  TEXT_ANCHOR_MIDDLE,
  TEXT_ANCHOR_ATTR,
  TIME_NOW_TSPAN_DY,
  LOCATOR_CIRCLE_RADIUS,
  TOOLTIP_TEXT_X_OFFSET,
  TSPAN_DY_OFFSET_LARGE,
  THIRTY_DAYS
} from './line-chart-constants.js'

export function renderLines(svg, observedPoints, forecastPoints, xScale, yScale, height, dataType) {
  const area = d3Area()
    .curve(curveMonotoneX)
    .x(d => xScale(new Date(d.dateTime)))
    .y0(height)
    .y1(d => yScale(dataType === 'river' && d.value < 0 ? 0 : d.value))

  const line = d3Line()
    .curve(curveMonotoneX)
    .x(d => xScale(new Date(d.dateTime)))
    .y(d => yScale(dataType === 'river' && d.value < 0 ? 0 : d.value))

  if (observedPoints.length) {
    svg.select('.observed-area').datum(observedPoints).attr('d', area)
    svg.select('.observed-line').datum(observedPoints).attr('d', line)
  }

  if (forecastPoints.length) {
    svg.select('.forecast-area').datum(forecastPoints).attr('d', area)
    svg.select('.forecast-line').datum(forecastPoints).attr('d', line)
  }
}

export function renderSignificantPoints(container, observedPoints, forecastPoints, xScale, yScale, timeRange) {
  container.selectAll('*').remove()

  const significantObserved = observedPoints.filter(x => x.isSignificant).map(p => ({ ...p, type: 'observed' }))
  const significantForecast = forecastPoints.filter(x => x.isSignificant).map(p => ({ ...p, type: 'forecast' }))
  const significantPoints = significantObserved.concat(significantForecast)

  container
    .attr('aria-rowcount', 1)
    .attr('aria-colcount', significantPoints.length)

  const cells = container
    .selectAll('.point')
    .data(significantPoints)
    .enter()
    .append('g')
    .attr('role', 'gridcell')
    .attr('class', d => `point point--${d.type}`)
    .attr('tabindex', (_d, i) => i === significantPoints.length - 1 ? 0 : -1)
    .attr('data-point', '')
    .attr('data-index', (_d, i) => i)

  cells.append('circle')
    .attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
    .attr('r', '5')
    .attr('cx', d => xScale(new Date(d.dateTime)))
    .attr('cy', d => yScale(d.value))

  cells.append('text')
    .attr('x', d => xScale(new Date(d.dateTime)))
    .attr('y', d => yScale(d.value))
    .each(function (d) {
      const value = `${d.value.toFixed(2)}m`
      const dateObj = new Date(d.dateTime)
      const time = timeFormat('%-I:%M%p')(dateObj).toLowerCase()
      const includeYear = timeRange === '1y' || timeRange === '5y'
      const dateFormat = includeYear ? '%e %b %Y' : '%e %b'
      const date = timeFormat(dateFormat)(dateObj)
      select(this).text(`${value} at ${time}, ${date}`)
    })

  return significantPoints
}

export function initializeSVG(containerId) {
  const container = document.getElementById(containerId)

  container.innerHTML = ''

  const description = document.createElement('span')
  description.className = 'govuk-visually-hidden'
  description.setAttribute('aria-live', 'polite')
  description.setAttribute('id', 'line-chart-description')
  container.appendChild(description)

  const svg = select(`#${containerId}`)
    .append('svg')
    .attr('id', `${containerId}-visualisation`)
    .attr('aria-label', 'Line chart')
    .attr('aria-describedby', 'line-chart-description')
    .attr('focusable', 'false')

  const mainGroup = svg.append('g').attr('class', 'chart-main')

  const defs = svg.append('defs')
  const clipPath = defs.append('clipPath').attr('id', 'chart-clip')
  clipPath.append('rect').attr('class', 'clip-rect')

  mainGroup.append('g').attr('class', 'y grid').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'x grid').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'x axis').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'y axis').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)

  const inner = mainGroup.append('g').attr('class', 'inner').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN).attr('clip-path', 'url(#chart-clip)')
  inner.append('g').attr('class', 'observed observed-focus')
  inner.append('g').attr('class', 'forecast')
  inner.select('.observed').append('path').attr('class', 'observed-area')
  inner.select('.observed').append('path').attr('class', 'observed-line')
  inner.select('.forecast').append('path').attr('class', 'forecast-area')
  inner.select('.forecast').append('path').attr('class', 'forecast-line')

  const timeLine = mainGroup.append('line').attr('class', 'time-line').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  const timeLabel = mainGroup.append('text').attr('class', 'time-now-text').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  timeLabel.append('tspan').attr('class', 'time-now-text__time').attr(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_MIDDLE).attr('x', 0)
  timeLabel.append('tspan').attr('class', 'time-now-text__date').attr(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_MIDDLE).attr('x', 0).attr('dy', TIME_NOW_TSPAN_DY)

  const locator = inner.append('g').attr('class', 'locator')
  locator.append('line').attr('class', 'locator__line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 0)
  locator.append('circle').attr('r', LOCATOR_CIRCLE_RADIUS).attr('class', 'locator-point')

  const significantContainer = mainGroup.append('g').attr('class', 'significant').attr('role', 'grid').append('g').attr('role', 'row')

  const tooltip = mainGroup.append('g').attr('class', 'tooltip').attr(ARIA_HIDDEN_STRING, ARIA_HIDDEN)
  const tooltipPath = tooltip.append('path').attr('class', 'tooltip-bg')
  const tooltipText = tooltip.append('text').attr('class', 'tooltip-text')
  const tooltipValue = tooltipText.append('tspan').attr('class', 'tooltip-text__strong').attr('x', TOOLTIP_TEXT_X_OFFSET).attr('y', THIRTY_DAYS).attr('dy', 0)
  const tooltipDescription = tooltipText.append('tspan').attr('class', 'tooltip-text').attr('x', TOOLTIP_TEXT_X_OFFSET).attr('dy', TSPAN_DY_OFFSET_LARGE)

  return {
    svg,
    mainGroup,
    inner,
    timeLine,
    timeLabel,
    locator,
    significantContainer,
    tooltip,
    tooltipPath,
    tooltipValue,
    tooltipDescription
  }
}
