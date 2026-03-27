import { simplify } from './utils.js'
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape'
import { axisBottom, axisLeft } from 'd3-axis'
import { scaleLinear, scaleTime } from 'd3-scale'
import { timeFormat } from 'd3-time-format'
import { select, selectAll } from 'd3-selection'
import { extent } from 'd3-array'
import { createZoomHandler, setupZoomBehavior, setupZoomControls, setupChartInfoUpdate } from './chart-zoom.js'

const DISPLAYED_HOUR_ON_X_AXIS = 6
const Y_AXIS_CLASS = '.y.axis'
const TEXT_ANCHOR_START = 'start'
const TEXT_ANCHOR_MIDDLE = 'middle'
const TEXT_ANCHOR_ATTR = 'text-anchor'
const ARIA_HIDDEN = true
const ARIA_HIDDEN_STRING = 'aria-hidden'
const RANGE_BUFFER_DIVISOR = 3
const MIN_RANGE_VALUE = 1
const TIME_RANGE_PADDING = 0.05
const Y_AXIS_NICE_TICKS = 5
const TICK_OFFSET_X1 = -5
const TICK_TEXT_OFFSET_X = 9
const TIME_LABEL_OFFSET_Y = 9
const TIME_LABEL_OFFSET_X_MOBILE = -20
const TIME_LABEL_OFFSET_X_DESKTOP = -24
const TICK_OVERLAP_MARGIN = 5
const TOOLTIP_TEXT_HEIGHT_OFFSET = 23
const TOOLTIP_PATH_LENGTH = 140
const TOOLTIP_PATH_LENGTH_WIDE = 175
const TOOLTIP_MARGIN_TOP = 10
const TOOLTIP_MARGIN_BOTTOM_OFFSET = 10
const TOOLTIP_VERTICAL_OFFSET = 40
const LOCATOR_CIRCLE_RADIUS = 5
const TOOLTIP_TEXT_X_OFFSET = 12
const TSPAN_DY_OFFSET_LARGE = '1.4em'
const TIME_NOW_TSPAN_DY = '15'
const MARGIN_TOP = 20
const MARGIN_BOTTOM = 45
const MARGIN_LEFT = 15
const MOBILE_MARGIN_RIGHT_BASE = 31
const DESKTOP_MARGIN_RIGHT_BASE = 36
const MARGIN_CHAR_MULTIPLIER = 9
const MOBILE_BREAKPOINT = '(max-width: 640px)'
const TOLERANCE_TIDE = 10000000
const TOLERANCE_DEFAULT = 1000000
const DEFAULT_TOOLTIP_Y = 10
const DECIMAL_PLACES = 2
const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 400

// Time range thresholds in days
const SEVEN_DAYS = 7
const THIRTY_DAYS = 30

// Downsampling ratios
const FORECAST_POINTS_RATIO = 0.3

/**
 * Generate exactly N evenly-spaced tick values across the time range
 */
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

/**
 * Calculate appropriate tick interval based on time range
 */
function calculateTickInterval(xExtent) {
  const timeDiff = xExtent[1] - xExtent[0]
  const days = timeDiff / (1000 * 60 * 60 * 24)

  // Always generate exactly 8 evenly-spaced ticks
  const TARGET_TICKS = 8
  const tickValues = generateEvenlySpacedTicks(xExtent, TARGET_TICKS)

  if (days <= SEVEN_DAYS) {
    // Up to 7 days: show time
    return { tickValues, formatTime: true, formatDate: true, removeLastNTicks: 1 }
  } else {
    // All other ranges: just show date
    return { tickValues, formatTime: false, formatDate: true, removeLastNTicks: 2 }
  }
}

/**
 * Format X axis labels with time and date
 */
function formatXAxisLabels(d, i, nodes, showTime, isYearScale = false) {
  const element = select(nodes[i])
  if (showTime) {
    const formattedTime = timeFormat('%-I%p')(new Date(d.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0))).toLocaleLowerCase()
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedTime)
    element.append('tspan').attr('x', 0).attr('dy', '15').text(formattedDate)
  } else if (isYearScale) {
    // For 5-year scale, show month & year
    const formattedDate = timeFormat('%b %Y')(new Date(d))
    element.append('tspan').text(formattedDate)
  } else {
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedDate)
  }
}

/**
 * Calculate Y scale domain with buffering
 */
function calculateYScaleDomain(lines, dataType) {
  const yExtent = extent(lines, (d) => d.value)
  const yExtentDataMin = yExtent[0]
  const yExtentDataMax = yExtent[1]

  let range = yExtentDataMax - yExtentDataMin
  range = Math.max(range, MIN_RANGE_VALUE)

  const yRangeUpperBuffered = yExtentDataMax + (range / RANGE_BUFFER_DIVISOR)
  const yRangeLowerBuffered = yExtentDataMin - (range / RANGE_BUFFER_DIVISOR)

  const upperBound = Math.max(yExtentDataMax, yRangeUpperBuffered)

  let lowerBound
  if (dataType === 'river') {
    lowerBound = Math.max(yRangeLowerBuffered, 0)
  } else {
    lowerBound = yRangeLowerBuffered
  }

  return {
    min: lowerBound,
    max: Math.max(upperBound, MIN_RANGE_VALUE)
  }
}

/**
 * Initialize X scale with padding
 */
function createXScale(observed, forecast, width) {
  const xExtent = extent(observed.concat(forecast), (d) => new Date(d.dateTime))
  const timeRange = xExtent[1] - xExtent[0]
  const paddedMax = new Date(xExtent[1].getTime() + (timeRange * TIME_RANGE_PADDING))

  const scale = scaleTime().domain([xExtent[0], paddedMax]).range([0, width])

  return { scale, extent: xExtent }
}

/**
 * Initialize Y scale
 */
function createYScale(lines, dataType, height) {
  const domain = calculateYScaleDomain(lines, dataType)
  return scaleLinear()
    .domain([domain.min, domain.max])
    .range([height, 0])
    .nice(Y_AXIS_NICE_TICKS)
}

/**
 * Render X and Y axes
 */
function renderAxes(svg, config) {
  const { xScale, yScale, width, height, timeRange } = config
  // Use visible domain from scale for tick calculation (important for zoom)
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

  // Format X axis labels
  svg.select('.x.axis').selectAll('text').each((d, i, nodes) => formatXAxisLabels(d, i, nodes, tickConfig.formatTime, isYearScale))

  // Remove last tick label(s) to avoid overlap with time indicator
  removeLastTickLabel(svg, tickConfig.removeLastNTicks)

  // Position Y axis ticks
  svg.select(Y_AXIS_CLASS).style(TEXT_ANCHOR_ATTR, TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', TICK_TEXT_OFFSET_X)
}

/**
 * Remove the last N tick labels to avoid overlap with time indicator
 */
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

/**
 * Render grid lines
 */
function renderGridLines(svg, xScale, yScale, height, width, xExtent) {
  // Use visible domain from scale for grid calculation (important for zoom)
  const visibleExtent = xScale.domain()
  const tickConfig = calculateTickInterval(visibleExtent)

  const xGrid = axisBottom(xScale)
    .tickSize(-height, 0, 0)
    .tickFormat('')
    .tickValues(tickConfig.tickValues)

  svg.select('.x.grid')
    .attr('transform', `translate(0,${height})`)
    .call(xGrid)

  // Remove grid lines after latest data point
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

/**
 * Update time indicator line and label
 */
function updateTimeIndicator(_svg, timeLabel, timeLine, xScale, height, isMobile) {
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

/**
 * Hide overlapping tick labels near the time indicator
 */
function hideOverlappingTicks(timeLabel) {
  const timeNowX = timeLabel.node().getBoundingClientRect().left
  const timeNowWidth = timeLabel.node().getBoundingClientRect().width
  const ticks = selectAll('.x .tick')
  const tickNodes = ticks.nodes()

  for (const tick of tickNodes) {
    const tickX = tick.getBoundingClientRect().left
    const tickWidth = tick.getBoundingClientRect().width
    const isOverlap = (tickX + tickWidth + TICK_OVERLAP_MARGIN) > timeNowX && tickX <= (timeNowX + timeNowWidth + TICK_OVERLAP_MARGIN)
    select(tick).classed('tick--hidden', isOverlap)
  }
}

/**
 * Downsample data points based on target count
 * For performance with large datasets
 */
function downsampleData(data, targetPoints) {
  if (!data || data.length <= targetPoints) {
    return data
  }

  const step = Math.ceil(data.length / targetPoints)
  const result = []

  for (let i = 0; i < data.length; i += step) {
    result.push(data[i])
  }

  // Always include the last point
  if (result.at(-1) !== data.at(-1)) {
    result.push(data.at(-1))
  }

  return result
}

/**
 * Calculate appropriate data density based on zoom level
 */
function getTargetPointsForZoom(zoomLevel, basePoints = 500) {
  // At zoom level 1 (no zoom): show fewer points
  // At higher zoom: show more points
  const multiplier = Math.min(zoomLevel, 10) // Cap at 10x
  return Math.floor(basePoints * multiplier)
}

/**
 * Simplify data based on type
 */
function simplifyByType(data, dataType) {
  if (dataType === 'river') {
    return data
  }
  const tolerance = dataType === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
  return simplify(data, tolerance)
}

/**
 * Mark first forecast as significant if different from last observed
 */
function markFirstForecastSignificance(observed, forecast) {
  if (!observed || observed.length === 0) {
    return
  }
  const latestObserved = observed[0]
  const firstForecast = forecast[0]
  const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
    latestObserved.value === firstForecast.value
  forecast[0].isSignificant = !isSame
}

/**
 * Process observed data points
 */
function processObservedData(observed, dataType) {
  const processed = simplifyByType(observed, dataType)
  const filtered = processed.filter(l => !l.err)
  return filtered.map(l => ({ ...l, type: 'observed' })).reverse()
}

/**
 * Process forecast data points
 */
function processForecastData(forecast, dataType, observed) {
  const processed = simplifyByType(forecast, dataType)
  markFirstForecastSignificance(observed, processed)
  return processed.map(l => ({ ...l, type: 'forecast' }))
}

/**
 * Process and filter data for rendering
 */
function processData(dataCache, zoomLevel = 1) {
  let observedPoints = []
  let forecastPoints = []

  if (dataCache.observed?.length) {
    observedPoints = processObservedData(dataCache.observed, dataCache.type)
  }

  if (dataCache.forecast?.length) {
    forecastPoints = processForecastData(dataCache.forecast, dataCache.type, dataCache.observed)
  }

  // Apply downsampling for performance with large datasets
  const targetPoints = getTargetPointsForZoom(zoomLevel)
  observedPoints = downsampleData(observedPoints, targetPoints)
  forecastPoints = downsampleData(forecastPoints, Math.floor(targetPoints * FORECAST_POINTS_RATIO))

  const lines = observedPoints.concat(forecastPoints)
  return { lines, observedPoints, forecastPoints }
}

/**
 * Render chart lines and areas
 */
function renderLines(svg, observedPoints, forecastPoints, xScale, yScale, height, dataType) {
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

/**
 * Render significant data points
 */
function renderSignificantPoints(container, observedPoints, forecastPoints, xScale, yScale, timeRange) {
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

/**
 * Create tooltip manager
 */
function createTooltipManager(tooltipConfig) {
  const { tooltip, tooltipPath, tooltipValue, tooltipDescription, locator, getHeight, dataType, latestDateTime, timeRange } = tooltipConfig

  function setPosition(x, y, dataPoint, yScaleFunc) {
    const currentHeight = getHeight()
    const locatorX = x // Save original X for locator positioning
    const text = tooltip.select('text')
    const txtHeight = Math.round(text.node().getBBox().height) + TOOLTIP_TEXT_HEIGHT_OFFSET
    const pathLength = (timeRange === '1y' || timeRange === '5y') ? TOOLTIP_PATH_LENGTH_WIDE : TOOLTIP_PATH_LENGTH
    const pathCentre = `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`

    // Center tooltip horizontally on the locator line
    tooltipPath.attr('d', pathCentre)
    x -= (pathLength / 2)

    const tooltipHeight = tooltipPath.node().getBBox().height
    const tooltipMarginTop = TOOLTIP_MARGIN_TOP
    const tooltipMarginBottom = currentHeight - (tooltipHeight + TOOLTIP_MARGIN_BOTTOM_OFFSET)
    y -= tooltipHeight + TOOLTIP_VERTICAL_OFFSET

    if (y < tooltipMarginTop) {
      y = tooltipMarginTop
    } else if (y > tooltipMarginBottom) {
      y = tooltipMarginBottom
    } else {
      // y is within bounds, no adjustment needed
    }

    tooltip.attr('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`)
    tooltip.classed('tooltip--visible', true)

    const locatorY = Math.floor(yScaleFunc(dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value))
    const isForecast = (new Date(dataPoint.dateTime)) > (new Date(latestDateTime))
    locator.classed('locator--forecast', isForecast)
    locator.attr('transform', `translate(${locatorX.toFixed(0)},0)`)
    const lineElement = locator.select('.locator__line')
    lineElement.attr('y2', currentHeight)
    locator.select('.locator-point').attr('transform', `translate(0,${locatorY})`)
  }

  function show(dataPoint, tooltipY, xScaleFunc, yScaleFunc) {
    if (!dataPoint) {
      return
    }

    const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0 ? '0' : dataPoint.value.toFixed(2)
    const dateObj = new Date(dataPoint.dateTime)
    const includeYear = timeRange === '1y' || timeRange === '5y'
    const dateFormat = includeYear ? '%e %b %Y' : '%e %b'

    tooltipValue.text(`${value}m`)
    tooltipDescription.text(`${timeFormat('%-I:%M%p')(dateObj).toLowerCase()}, ${timeFormat(dateFormat)(dateObj)}`)

    locator.classed('locator--visible', true)

    const tooltipX = xScaleFunc(new Date(dataPoint.dateTime))
    setPosition(tooltipX, tooltipY, dataPoint, yScaleFunc)
  }

  function hide() {
    tooltip.classed('tooltip--visible', false)
    locator.classed('locator--visible', false)
  }

  return { show, hide }
}

/**
 * Find data point by X coordinate
 */
function findDataPointByX(x, lines, xScale) {
  if (!lines || lines.length === 0 || !xScale) {
    return null
  }

  const mouseDate = xScale.invert(x)
  const mouseTime = mouseDate.getTime()

  // Find closest point by iterating through all points
  let closestPoint = lines[0]
  let minDistance = Math.abs(mouseTime - new Date(closestPoint.dateTime).getTime())

  for (let i = 1; i < lines.length; i++) {
    const pointTime = new Date(lines[i].dateTime).getTime()
    const distance = Math.abs(mouseTime - pointTime)

    if (distance < minDistance) {
      minDistance = distance
      closestPoint = lines[i]
    }
  }

  return closestPoint
}

/**
 * Initialize SVG structure
 */
function initializeSVG(containerId) {
  const container = document.getElementById(containerId)

  // Clear any existing chart content
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

  // Add clipPath to prevent lines from overlapping axes
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

/**
 * Setup event handlers
 */
function setupEventHandlers(container, svg, _mainGroup, getState, tooltipManager) {
  let interfaceType = null
  let lastClientX, lastClientY

  const getMousePosition = (e, svgElement) => {
    const rect = svgElement.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const handleMouseMove = (e) => {
    if (lastClientX === e.clientX && lastClientY === e.clientY) {
      return
    }
    lastClientX = e.clientX
    lastClientY = e.clientY
    const { margin, lines, xScale, yScale } = getState()
    if (!xScale) {
      return
    }
    if (interfaceType === 'touch') {
      interfaceType = 'mouse'
      return
    }
    interfaceType = 'mouse'
    const [mouseX, mouseY] = getMousePosition(e, svg.node())
    const chartX = mouseX - margin.left
    const chartY = mouseY - margin.top
    const dataPoint = findDataPointByX(chartX, lines, xScale)
    tooltipManager.show(dataPoint, chartY, xScale, yScale)
  }

  const handleClick = (e) => {
    const { margin, lines, xScale, yScale } = getState()
    const [mouseX, mouseY] = getMousePosition(e, svg.node())
    const chartX = mouseX - margin.left
    const chartY = mouseY - margin.top
    const dataPoint = findDataPointByX(chartX, lines, xScale)
    tooltipManager.show(dataPoint, chartY, xScale, yScale)
  }

  const handleTouchStart = () => {
    interfaceType = 'touch'
  }

  const handleTouchMove = (e) => {
    const { margin, lines, xScale, yScale } = getState()
    if (!xScale) {
      return
    }
    const touchEvent = e.touches[0]
    const [mouseX] = getMousePosition(touchEvent, svg.node())
    const chartX = mouseX - margin.left
    const dataPoint = findDataPointByX(chartX, lines, xScale)
    tooltipManager.show(dataPoint, DEFAULT_TOOLTIP_Y, xScale, yScale)
  }

  const handleTouchEnd = () => {
    interfaceType = null
  }

  const handleMouseLeave = () => {
    tooltipManager.hide()
  }

  // Use native event listeners for better Edge compatibility
  const svgNode = svg.node()
  svgNode.addEventListener('click', handleClick)
  svgNode.addEventListener('mousemove', handleMouseMove)
  svgNode.addEventListener('touchstart', handleTouchStart)
  svgNode.addEventListener('touchmove', handleTouchMove)
  svgNode.addEventListener('touchend', handleTouchEnd)
  container.addEventListener('mouseleave', handleMouseLeave)
}

/**
 * Initialize and setup zoom functionality
 */
function initializeZoom(config) {
  const { svg, mainGroup, stateRef, dataCache, timeRange, significantContainer, 
          timeLine, timeLabel, isMobileRef, tooltipManager, container, zoomRef } = config
  
  const baseXScale = stateRef.xScale.copy()
  
  const handleZoomEvent = (event) => {
    const result = createZoomHandler({
      svg, 
      baseXScale, 
      width: stateRef.width, 
      height: stateRef.height, 
      timeRange, 
      dataCache,
      significantContainer, 
      timeLine, 
      timeLabel, 
      isMobile: isMobileRef.current, 
      tooltipManager, 
      container,
      processData,
      renderAxes,
      renderGridLines,
      renderLines,
      renderSignificantPoints,
      updateTimeIndicator,
      hideOverlappingTicks
    })(event, stateRef.lines, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale)
    
    // Update state
    stateRef.xScale = result.xScale
    stateRef.yScale = result.yScale
    stateRef.lines = result.lines
    stateRef.observedPoints = result.observedPoints
    stateRef.forecastPoints = result.forecastPoints
  }

  const zoomSetup = setupZoomBehavior({
    svg, 
    mainGroup, 
    width: stateRef.width, 
    height: stateRef.height, 
    baseXScale,
    handleZoomEvent
  })
  
  zoomRef.behavior = zoomSetup.zoomBehavior
  zoomRef.rect = zoomSetup.zoomRect

  setupZoomControls(container, mainGroup, zoomRef.behavior)
  setupChartInfoUpdate(container)
}

/**
 * Setup responsive behavior and event handlers
 */
function setupResponsiveHandlers(config) {
  const { container, svg, mainGroup, mobileMediaQuery, isMobileRef, tooltipManager, renderChart, stateRef } = config

  const getState = () => ({ 
    margin: stateRef.margin, 
    lines: stateRef.lines, 
    xScale: stateRef.xScale, 
    yScale: stateRef.yScale 
  })

  // Setup mouse/touch handlers for tooltips
  setupEventHandlers(container, svg, mainGroup, getState, tooltipManager)
  
  mobileMediaQuery[mobileMediaQuery.addEventListener ? 'addEventListener' : 'addListener']('change', (e) => {
    isMobileRef.current = e.matches
    tooltipManager.hide()
    renderChart()
  })

  globalThis.addEventListener('resize', () => {
    tooltipManager.hide()
    renderChart()
  })
}

/**
 * Create chart rendering function
 */
function createChartRenderer(config) {
  const { container, svg, mainGroup, svgElements, dataCache, timeRange, isMobileRef, stateRef, zoomRef } = config

  return (zoomLevel = 1) => {
    // Process data with appropriate detail level for zoom
    const processedData = processData(dataCache, zoomLevel)
    stateRef.lines = processedData.lines
    stateRef.observedPoints = processedData.observedPoints
    stateRef.forecastPoints = processedData.forecastPoints

    if (!stateRef.lines || stateRef.lines.length === 0) {
      console.warn('No data to render')
      return
    }

    // Create scales
    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, stateRef.width || DEFAULT_WIDTH)
    stateRef.xScale = xScaleNew
    stateRef.xExtent = xExtentNew

    stateRef.yScale = createYScale(stateRef.lines, dataCache.type, stateRef.height || DEFAULT_HEIGHT)

    // Calculate margins
    const numChars = stateRef.yScale.domain()[1].toFixed(1).length - DECIMAL_PLACES
    stateRef.margin = { 
      top: MARGIN_TOP, 
      bottom: MARGIN_BOTTOM, 
      left: MARGIN_LEFT, 
      right: (isMobileRef.current ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE) + (numChars * MARGIN_CHAR_MULTIPLIER) 
    }

    // Calculate dimensions
    const containerBoundingRect = container.getBoundingClientRect()
    stateRef.width = Math.floor(containerBoundingRect.width) - stateRef.margin.left - stateRef.margin.right
    stateRef.height = Math.floor(containerBoundingRect.height) - stateRef.margin.top - stateRef.margin.bottom

    // Update scales with new dimensions
    stateRef.xScale.range([0, stateRef.width])
    stateRef.yScale.range([stateRef.height, 0])

    // Apply margin transform
    mainGroup.attr('transform', `translate(${stateRef.margin.left},${stateRef.margin.top})`)

    // Update clipPath dimensions to match chart area
    svg.select('.clip-rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', stateRef.width)
      .attr('height', stateRef.height)

    // Render chart elements
    renderAxes(svg, { xScale: stateRef.xScale, yScale: stateRef.yScale, width: stateRef.width, height: stateRef.height, timeRange })
    renderGridLines(svg, stateRef.xScale, stateRef.yScale, stateRef.height, stateRef.width, stateRef.xExtent)
    updateTimeIndicator(svg, svgElements.timeLabel, svgElements.timeLine, stateRef.xScale, stateRef.height, isMobileRef.current)
    hideOverlappingTicks(svgElements.timeLabel)
    renderLines(svg, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, stateRef.height, dataCache.type)
    renderSignificantPoints(svgElements.significantContainer, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, timeRange)

    // Update locator line height
    svgElements.inner.select('.locator__line').attr('y1', 0).attr('y2', stateRef.height)

    // Update zoom rect dimensions and extents if it exists
    if (zoomRef.rect && zoomRef.behavior) {
      zoomRef.rect.attr('width', stateRef.width).attr('height', stateRef.height)
      // Update zoom extents to match new chart dimensions
      zoomRef.behavior
        .translateExtent([[0, 0], [stateRef.width, stateRef.height]])
        .extent([[0, 0], [stateRef.width, stateRef.height]])
    }
  }
}

/**
 * Main LineChart function
 */
export function lineChart(containerId, _stationId, data, _options = {}) {
  const container = document.getElementById(containerId)

  if (!container) {
    console.error('LineChart: Container not found:', containerId)
    return
  }

  if (!data) {
    console.error('LineChart: No data provided')
    return
  }

  const dataCache = data
  const timeRange = _options.timeRange || '5d'
  const enableZoom = _options.enableZoom || false
  const svgElements = initializeSVG(containerId)
  const { svg, mainGroup, timeLine, timeLabel, locator, significantContainer, tooltip, tooltipPath, tooltipValue, tooltipDescription } = svgElements

  const mobileMediaQuery = globalThis.matchMedia(MOBILE_BREAKPOINT)
  const isMobileRef = { current: mobileMediaQuery.matches }
  
  // State object for mutable chart state
  const stateRef = {
    width: null,
    height: null,
    margin: null,
    xScale: null,
    yScale: null,
    xExtent: null,
    lines: null,
    observedPoints: null,
    forecastPoints: null
  }
  
  // Zoom reference object
  const zoomRef = { behavior: null, rect: null }

  // Create render function
  const renderChart = createChartRenderer({
    container,
    svg,
    mainGroup,
    svgElements,
    dataCache,
    timeRange,
    isMobileRef,
    stateRef,
    zoomRef
  })

  // Create tooltip manager
  const tooltipManager = createTooltipManager({
    tooltip,
    tooltipPath,
    tooltipValue,
    tooltipDescription,
    locator,
    getHeight: () => stateRef.height,
    dataType: dataCache.type,
    latestDateTime: dataCache.latestDateTime,
    timeRange
  })

  // Initial render
  renderChart()

  // Setup zoom behavior if enabled
  if (enableZoom) {
    initializeZoom({
      svg, mainGroup, stateRef, dataCache, timeRange, 
      significantContainer, timeLine, timeLabel, isMobileRef, 
      tooltipManager, container, zoomRef
    })
  }

  // Setup responsive behavior and event handlers
  setupResponsiveHandlers({
    container, svg, mainGroup, mobileMediaQuery, 
    isMobileRef, tooltipManager, renderChart, stateRef
  })

  this.chart = container
}
