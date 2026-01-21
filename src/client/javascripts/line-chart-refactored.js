import { simplify } from './utils.js'
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape'
import { axisBottom, axisLeft } from 'd3-axis'
import { scaleLinear, scaleTime } from 'd3-scale'
import { timeFormat } from 'd3-time-format'
import { timeHour } from 'd3-time'
import { select, selectAll, pointer } from 'd3-selection'
import { extent, bisector } from 'd3-array'

const DISPLAYED_HOUR_ON_X_AXIS = 6
const Y_AXIS_CLASS = '.y.axis'
const TEXT_ANCHOR_START = 'start'
const ARIA_HIDDEN = true
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
const TOOLTIP_MARGIN_TOP = 10
const TOOLTIP_MARGIN_BOTTOM_OFFSET = 10
const TOOLTIP_VERTICAL_OFFSET = 40
const LOCATOR_CIRCLE_RADIUS = 5
const TOOLTIP_TEXT_X_OFFSET = 12
const TSPAN_DY_OFFSET = '0.5em'
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

/**
 * Format X axis labels with time and date
 */
function formatXAxisLabels(d, i, nodes) {
  const element = select(nodes[i])
  const formattedTime = timeFormat('%-I%p')(new Date(d.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0))).toLocaleLowerCase()
  const formattedDate = timeFormat('%-e %b')(new Date(d))
  element.append('tspan').text(formattedTime)
  element.append('tspan').attr('x', 0).attr('dy', '15').text(formattedDate)
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
function renderAxes(svg, xScale, yScale, width, height, _isMobile) {
  const xAxis = axisBottom()
    .scale(xScale)
    .ticks(timeHour.filter(d => d.getHours() === DISPLAYED_HOUR_ON_X_AXIS))
    .tickFormat('')
    .tickSizeOuter(0)

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
  svg.select('.x.axis').selectAll('text').each(formatXAxisLabels)

  // Remove last tick label if it's 6am
  removeLastTickLabel(svg)

  // Position Y axis ticks
  svg.select(Y_AXIS_CLASS).style('text-anchor', TEXT_ANCHOR_START)
  svg.selectAll(`${Y_AXIS_CLASS} .tick line`).attr('x1', TICK_OFFSET_X1).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll(`${Y_AXIS_CLASS} .tick text`).attr('x', TICK_TEXT_OFFSET_X)
}

/**
 * Remove the last 6am tick label but keep the line
 */
function removeLastTickLabel(svg) {
  const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
  if (xAxisTicks.size() > 0) {
    const lastTick = xAxisTicks.nodes()[xAxisTicks.size() - 1]
    const lastTickData = select(lastTick).datum()
    if (lastTickData && lastTickData.getHours() === DISPLAYED_HOUR_ON_X_AXIS) {
      select(lastTick).select('text').remove()
    }
  }
}

/**
 * Render grid lines
 */
function renderGridLines(svg, xScale, yScale, height, width, xExtent) {
  svg.select('.x.grid')
    .attr('transform', `translate(0,${height})`)
    .call(axisBottom(xScale)
      .ticks(timeHour.filter(d => d.getHours() === DISPLAYED_HOUR_ON_X_AXIS))
      .tickSize(-height, 0, 0)
      .tickFormat('')
    )

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
 * Process and filter data for rendering
 */
function processData(dataCache) {
  let lines = []
  let observedPoints = []
  let forecastPoints = []

  if (dataCache.observed?.length) {
    let processedObserved = dataCache.observed

    // Simplify non-river data
    if (dataCache.type !== 'river') {
      const tolerance = dataCache.type === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
      processedObserved = simplify(processedObserved, tolerance)
    }

    // Filter errors
    const filtered = processedObserved.filter(l => !l.err)

    observedPoints = filtered.map(l => ({ ...l, type: 'observed' })).reverse()
    lines = observedPoints
  }

  if (dataCache.forecast?.length) {
    let processedForecast = dataCache.forecast

    // Simplify non-river data
    if (dataCache.type !== 'river') {
      const tolerance = dataCache.type === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
      processedForecast = simplify(processedForecast, tolerance)
    }

    // Mark first forecast point as significant if different from last observed
    if (dataCache.observed && dataCache.observed.length > 0) {
      const latestObserved = dataCache.observed[0]
      const firstForecast = processedForecast[0]
      const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
        latestObserved.value === firstForecast.value
      processedForecast[0].isSignificant = !isSame
    }

    forecastPoints = processedForecast.map(l => ({ ...l, type: 'forecast' }))
    lines = lines.concat(forecastPoints)
  }

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
function renderSignificantPoints(container, observedPoints, forecastPoints, xScale, yScale) {
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
    .attr('aria-hidden', ARIA_HIDDEN)
    .attr('r', '5')
    .attr('cx', d => xScale(new Date(d.dateTime)))
    .attr('cy', d => yScale(d.value))

  cells.append('text')
    .attr('x', d => xScale(new Date(d.dateTime)))
    .attr('y', d => yScale(d.value))
    .each(function (d) {
      const value = `${d.value.toFixed(2)}m`
      const time = timeFormat('%-I:%M%p')(new Date(d.dateTime)).toLowerCase()
      const date = timeFormat('%e %b')(new Date(d.dateTime))
      select(this).text(`${value} at ${time}, ${date}`)
    })

  return significantPoints
}

/**
 * Create tooltip manager
 */
function createTooltipManager(tooltipConfig) {
  const { tooltip, tooltipPath, tooltipValue, tooltipDescription, locator, xScale, yScale, height, dataType, latestDateTime } = tooltipConfig

  function setPosition(x, y, dataPoint) {
    const text = tooltip.select('text')
    const txtHeight = Math.round(text.node().getBBox().height) + TOOLTIP_TEXT_HEIGHT_OFFSET
    const pathLength = TOOLTIP_PATH_LENGTH
    const pathCentre = `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`

    if (x > pathLength) {
      tooltipPath.attr('d', pathCentre)
      x -= pathLength
    } else {
      tooltipPath.attr('d', pathCentre)
    }

    const tooltipHeight = tooltipPath.node().getBBox().height
    const tooltipMarginTop = TOOLTIP_MARGIN_TOP
    const tooltipMarginBottom = height - (tooltipHeight + TOOLTIP_MARGIN_BOTTOM_OFFSET)
    y -= tooltipHeight + TOOLTIP_VERTICAL_OFFSET

    if (y < tooltipMarginTop) {
      y = tooltipMarginTop
    } else if (y > tooltipMarginBottom) {
      y = tooltipMarginBottom
    }

    tooltip.attr('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`)
    tooltip.classed('tooltip--visible', true)

    const locatorX = Math.floor(xScale(new Date(dataPoint.dateTime)))
    const locatorY = Math.floor(yScale(dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value))
    const isForecast = (new Date(dataPoint.dateTime)) > (new Date(latestDateTime))
    locator.classed('locator--forecast', isForecast)
    locator.attr('transform', `translate(${locatorX},0)`)
    locator.select('.locator__line').attr('y2', height)
    locator.select('.locator-point').attr('transform', `translate(0,${locatorY})`)
  }

  function show(dataPoint, tooltipY = DEFAULT_TOOLTIP_Y) {
    if (!dataPoint) {
      return
    }

    const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0 ? '0' : dataPoint.value.toFixed(2)

    tooltipValue.text(`${value}m`)
    tooltipDescription.text(`${timeFormat('%-I:%M%p')(new Date(dataPoint.dateTime)).toLowerCase()}, ${timeFormat('%e %b')(new Date(dataPoint.dateTime))}`)

    locator.classed('locator--visible', true)

    const tooltipX = xScale(new Date(dataPoint.dateTime))
    setPosition(tooltipX, tooltipY, dataPoint)
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
  const bisectDate = bisector((d) => new Date(d.dateTime)).left
  const i = bisectDate(lines, mouseDate, 1)
  const d0 = lines[i - 1]
  const d1 = lines[i] || lines[i - 1]

  if (!d0 || !d1) {
    return null
  }

  return mouseDate - new Date(d0.dateTime) > new Date(d1.dateTime) - mouseDate ? d1 : d0
}

/**
 * Initialize SVG structure
 */
function initializeSVG(containerId) {
  const container = document.getElementById(containerId)

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

  mainGroup.append('g').attr('class', 'y grid').attr('aria-hidden', ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'x grid').attr('aria-hidden', ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'x axis').attr('aria-hidden', ARIA_HIDDEN)
  mainGroup.append('g').attr('class', 'y axis').attr('aria-hidden', ARIA_HIDDEN).style('text-anchor', TEXT_ANCHOR_START)

  const inner = mainGroup.append('g').attr('class', 'inner').attr('aria-hidden', ARIA_HIDDEN)
  inner.append('g').attr('class', 'observed observed-focus')
  inner.append('g').attr('class', 'forecast')
  inner.select('.observed').append('path').attr('class', 'observed-area')
  inner.select('.observed').append('path').attr('class', 'observed-line')
  inner.select('.forecast').append('path').attr('class', 'forecast-area')
  inner.select('.forecast').append('path').attr('class', 'forecast-line')

  const timeLine = mainGroup.append('line').attr('class', 'time-line').attr('aria-hidden', ARIA_HIDDEN)
  const timeLabel = mainGroup.append('text').attr('class', 'time-now-text').attr('aria-hidden', ARIA_HIDDEN)
  timeLabel.append('tspan').attr('class', 'time-now-text__time').attr('text-anchor', 'middle').attr('x', 0)
  timeLabel.append('tspan').attr('class', 'time-now-text__date').attr('text-anchor', 'middle').attr('x', 0).attr('dy', TIME_NOW_TSPAN_DY)

  const locator = inner.append('g').attr('class', 'locator')
  locator.append('line').attr('class', 'locator__line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 0)
  locator.append('circle').attr('r', LOCATOR_CIRCLE_RADIUS).attr('class', 'locator-point')

  const significantContainer = mainGroup.append('g').attr('class', 'significant').attr('role', 'grid').append('g').attr('role', 'row')

  const tooltip = mainGroup.append('g').attr('class', 'tooltip').attr('aria-hidden', ARIA_HIDDEN)
  const tooltipPath = tooltip.append('path').attr('class', 'tooltip-bg')
  const tooltipText = tooltip.append('text').attr('class', 'tooltip-text')
  const tooltipValue = tooltipText.append('tspan').attr('class', 'tooltip-text__strong').attr('x', TOOLTIP_TEXT_X_OFFSET).attr('dy', TSPAN_DY_OFFSET)
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
function setupEventHandlers(container, svg, margin, tooltipManager, lines, xScale, _dataType) {
  let interfaceType = null
  let lastClientX, lastClientY

  const handleMouseMove = (e) => {
    if (lastClientX === e.clientX && lastClientY === e.clientY) {
      return
    }
    lastClientX = e.clientX
    lastClientY = e.clientY
    if (!xScale) {
      return
    }
    if (interfaceType === 'touch') {
      interfaceType = 'mouse'
      return
    }
    interfaceType = 'mouse'
    const dataPoint = findDataPointByX(pointer(e)[0] - margin.left, lines, xScale)
    tooltipManager.setDataPoint(dataPoint)
    tooltipManager.show(dataPoint, pointer(e)[1])
  }

  const handleClick = (e) => {
    const dataPoint = findDataPointByX(pointer(e)[0] - margin.left, lines, xScale)
    tooltipManager.setDataPoint(dataPoint)
    tooltipManager.show(dataPoint, pointer(e)[1])
  }

  const handleTouchMove = (e) => {
    if (!xScale) {
      return
    }
    const touchEvent = e.targetTouches[0]
    const elementOffsetX = svg.node().getBoundingClientRect().left
    const dataPoint = findDataPointByX(pointer(touchEvent)[0] - elementOffsetX - margin.left, lines, xScale)
    tooltipManager.setDataPoint(dataPoint)
    tooltipManager.show(dataPoint, DEFAULT_TOOLTIP_Y)
  }

  svg.on('click', handleClick)
  svg.on('mousemove', handleMouseMove)
  svg.on('touchstart', () => { interfaceType = 'touch' })
  svg.on('touchmove', handleTouchMove)
  svg.on('touchend', () => { interfaceType = null })
  container.addEventListener('mouseleave', () => tooltipManager.hide())
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

  console.log('LineChart initializing with data:', data)

  const dataCache = data
  const svgElements = initializeSVG(containerId)
  const { svg, mainGroup, timeLine, timeLabel, locator, significantContainer, tooltip, tooltipPath, tooltipValue, tooltipDescription } = svgElements

  let isMobile = globalThis.matchMedia(MOBILE_BREAKPOINT).matches
  let width, height, margin, xScale, yScale, xExtent, lines, observedPoints, forecastPoints

  const renderChart = () => {
    // Process data
    const processedData = processData(dataCache)
    lines = processedData.lines
    observedPoints = processedData.observedPoints
    forecastPoints = processedData.forecastPoints

    if (!lines || lines.length === 0) {
      console.warn('No data to render')
      return
    }

    // Create scales
    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, width || DEFAULT_WIDTH)
    xScale = xScaleNew
    xExtent = xExtentNew

    yScale = createYScale(lines, dataCache.type, height || DEFAULT_HEIGHT)

    // Calculate margins
    const numChars = yScale.domain()[1].toFixed(1).length - DECIMAL_PLACES
    margin = { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT, right: (isMobile ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE) + (numChars * MARGIN_CHAR_MULTIPLIER) }

    // Calculate dimensions
    const containerBoundingRect = container.getBoundingClientRect()
    width = Math.floor(containerBoundingRect.width) - margin.left - margin.right
    height = Math.floor(containerBoundingRect.height) - margin.top - margin.bottom

    // Update scales with new dimensions
    xScale.range([0, width])
    yScale.range([height, 0])

    // Apply margin transform
    mainGroup.attr('transform', `translate(${margin.left},${margin.top})`)

    // Render chart elements
    renderAxes(svg, xScale, yScale, width, height, isMobile)
    renderGridLines(svg, xScale, yScale, height, width, xExtent)
    updateTimeIndicator(svg, timeLabel, timeLine, xScale, height, isMobile)
    hideOverlappingTicks(timeLabel)
    renderLines(svg, observedPoints, forecastPoints, xScale, yScale, height, dataCache.type)
    renderSignificantPoints(significantContainer, observedPoints, forecastPoints, xScale, yScale)

    // Update locator line height
    svgElements.inner.select('.locator__line').attr('y1', 0).attr('y2', height)
  }

  // Create tooltip manager
  const tooltipManager = createTooltipManager({
    tooltip,
    tooltipPath,
    tooltipValue,
    tooltipDescription,
    locator,
    xScale,
    yScale,
    height,
    dataType: dataCache.type,
    latestDateTime: dataCache.latestDateTime
  })

  // Initial render
  renderChart()

  // Setup event handlers
  setupEventHandlers(container, svg, margin, tooltipManager, lines, xScale, dataCache.type)

  // Responsive handlers
  const mobileMediaQuery = globalThis.matchMedia(MOBILE_BREAKPOINT)
  mobileMediaQuery[mobileMediaQuery.addEventListener ? 'addEventListener' : 'addListener']('change', (e) => {
    isMobile = e.matches
    tooltipManager.hide()
    renderChart()
  })

  globalThis.addEventListener('resize', () => {
    tooltipManager.hide()
    renderChart()
  })

  this.chart = container
}
