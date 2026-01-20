import { simplify } from './utils.js'
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape'
import { axisBottom, axisLeft } from 'd3-axis'
import { scaleLinear, scaleTime } from 'd3-scale'
import { timeFormat } from 'd3-time-format'
import { timeHour } from 'd3-time'
import { select, selectAll, pointer } from 'd3-selection'
import { extent, bisector } from 'd3-array'

const DISPLAYED_HOUR_ON_X_AXIS = 6

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
  range = range < 1 ? 1 : range

  const yRangeUpperBuffered = yExtentDataMax + (range / 3)
  const yRangeLowerBuffered = yExtentDataMin - (range / 3)

  const upperBound = yExtentDataMax <= yRangeUpperBuffered ? yRangeUpperBuffered : yExtentDataMax
  const lowerBound = dataType === 'river'
    ? (yRangeLowerBuffered < 0 ? 0 : yRangeLowerBuffered)
    : yRangeLowerBuffered

  return {
    min: lowerBound,
    max: upperBound < 1 ? 1 : upperBound
  }
}

/**
 * Initialize X scale with padding
 */
function createXScale(observed, forecast, width) {
  const xExtent = extent(observed.concat(forecast), (d) => new Date(d.dateTime))
  const timeRange = xExtent[1] - xExtent[0]
  const paddedMax = new Date(xExtent[1].getTime() + (timeRange * 0.05))

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
    .nice(5)
}

/**
 * Render X and Y axes
 */
function renderAxes(svg, xScale, yScale, width, height, isMobile) {
  const xAxis = axisBottom()
    .scale(xScale)
    .ticks(timeHour.filter(d => d.getHours() === DISPLAYED_HOUR_ON_X_AXIS))
    .tickFormat('')
    .tickSizeOuter(0)

  const yAxis = axisLeft()
    .scale(yScale)
    .ticks(5)
    .tickFormat(d => parseFloat(d).toFixed(1))
    .tickSizeOuter(0)

  svg.select('.x.axis')
    .attr('transform', `translate(0,${height})`)
    .call(xAxis)

  svg.select('.y.axis')
    .attr('transform', `translate(${width}, 0)`)
    .call(yAxis)

  // Format X axis labels
  svg.select('.x.axis').selectAll('text').each(formatXAxisLabels)

  // Remove last tick label if it's 6am
  removeLastTickLabel(svg)

  // Position Y axis ticks
  svg.select('.y.axis').style('text-anchor', 'start')
  svg.selectAll('.y.axis .tick line').attr('x1', -5).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
  svg.selectAll('.y.axis .tick text').attr('x', 9)
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
      .ticks(5)
      .tickSize(-width, 0, 0)
      .tickFormat('')
    )
}

/**
 * Update time indicator line and label
 */
function updateTimeIndicator(svg, timeLabel, timeLine, xScale, height, isMobile) {
  const now = new Date()
  const timeX = Math.floor(xScale(now))

  timeLine.attr('y1', 0).attr('y2', height).attr('transform', `translate(${timeX},0)`)

  timeLabel
    .attr('y', height + 9)
    .attr('transform', `translate(${timeX},0)`)
    .attr('dy', '0.71em')
    .attr('x', isMobile ? -20 : -24)

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

  for (let i = 0; i < tickNodes.length; i++) {
    const tick = tickNodes[i]
    const tickX = tick.getBoundingClientRect().left
    const tickWidth = tick.getBoundingClientRect().width
    const isOverlap = (tickX + tickWidth + 5) > timeNowX && tickX <= (timeNowX + timeNowWidth + 5)
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

  if (dataCache.observed && dataCache.observed.length) {
    let processedObserved = dataCache.observed

    // Simplify non-river data
    if (dataCache.type !== 'river') {
      const tolerance = dataCache.type === 'tide' ? 10000000 : 1000000
      processedObserved = simplify(processedObserved, tolerance)
    }

    // Filter errors and negative values
    const shouldFilterNegatives = !['groundwater', 'tide', 'sea'].includes(dataCache.type)
    const filtered = processedObserved.filter(l => {
      if (l.err) return false
      return true
    })

    observedPoints = filtered.map(l => ({ ...l, type: 'observed' })).reverse()
    lines = observedPoints
  }

  if (dataCache.forecast && dataCache.forecast.length) {
    let processedForecast = dataCache.forecast

    // Simplify non-river data
    if (dataCache.type !== 'river') {
      const tolerance = dataCache.type === 'tide' ? 10000000 : 1000000
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
    .attr('tabindex', (d, i) => i === significantPoints.length - 1 ? 0 : -1)
    .attr('data-point', '')
    .attr('data-index', (d, i) => i)

  cells.append('circle')
    .attr('aria-hidden', true)
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
function createTooltipManager(tooltip, tooltipPath, tooltipValue, tooltipDescription, locator, xScale, yScale, height, dataType, latestDateTime) {
  let currentDataPoint = null

  function setPosition(x, y) {
    const text = tooltip.select('text')
    const txtHeight = Math.round(text.node().getBBox().height) + 23
    const pathLength = 140
    const pathCentre = `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`

    if (x > pathLength) {
      tooltipPath.attr('d', pathCentre)
      x -= pathLength
    } else {
      tooltipPath.attr('d', pathCentre)
    }

    const tooltipHeight = tooltipPath.node().getBBox().height
    const tooltipMarginTop = 10
    const tooltipMarginBottom = height - (tooltipHeight + 10)
    y -= tooltipHeight + 40
    y = y < tooltipMarginTop ? tooltipMarginTop : y > tooltipMarginBottom ? tooltipMarginBottom : y

    tooltip.attr('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`)
    tooltip.classed('tooltip--visible', true)

    if (currentDataPoint) {
      const locatorX = Math.floor(xScale(new Date(currentDataPoint.dateTime)))
      const locatorY = Math.floor(yScale(dataType === 'river' && currentDataPoint.value < 0 ? 0 : currentDataPoint.value))
      const isForecast = new Date(currentDataPoint.dateTime) > new Date(latestDateTime)

      locator.classed('locator--forecast', isForecast)
      locator.attr('transform', `translate(${locatorX},0)`)
      locator.select('.locator__line').attr('y2', height)
      locator.select('.locator-point').attr('transform', `translate(0,${locatorY})`)
    }
  }

  function show(dataPoint, tooltipY = 10) {
    if (!dataPoint) return

    currentDataPoint = dataPoint
    const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0 ? '0' : dataPoint.value.toFixed(2)

    tooltipValue.text(`${value}m`)
    tooltipDescription.text(`${timeFormat('%-I:%M%p')(new Date(dataPoint.dateTime)).toLowerCase()}, ${timeFormat('%e %b')(new Date(dataPoint.dateTime))}`)

    locator.classed('locator--visible', true)

    const tooltipX = xScale(new Date(dataPoint.dateTime))
    setPosition(tooltipX, tooltipY)
  }

  function hide() {
    tooltip.classed('tooltip--visible', false)
    locator.classed('locator--visible', false)
    currentDataPoint = null
  }

  function setDataPoint(dataPoint) {
    currentDataPoint = dataPoint
  }

  return { show, hide, setDataPoint }
}

/**
 * Find data point by X coordinate
 */
function findDataPointByX(x, lines, xScale) {
  if (!lines || lines.length === 0 || !xScale) return null

  const mouseDate = xScale.invert(x)
  const bisectDate = bisector((d) => new Date(d.dateTime)).left
  const i = bisectDate(lines, mouseDate, 1)
  const d0 = lines[i - 1]
  const d1 = lines[i] || lines[i - 1]

  if (!d0 || !d1) return null

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

  mainGroup.append('g').attr('class', 'y grid').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'x grid').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'x axis').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'y axis').attr('aria-hidden', true).style('text-anchor', 'start')

  const inner = mainGroup.append('g').attr('class', 'inner').attr('aria-hidden', true)
  inner.append('g').attr('class', 'observed observed-focus')
  inner.append('g').attr('class', 'forecast')
  inner.select('.observed').append('path').attr('class', 'observed-area')
  inner.select('.observed').append('path').attr('class', 'observed-line')
  inner.select('.forecast').append('path').attr('class', 'forecast-area')
  inner.select('.forecast').append('path').attr('class', 'forecast-line')

  const timeLine = mainGroup.append('line').attr('class', 'time-line').attr('aria-hidden', true)
  const timeLabel = mainGroup.append('text').attr('class', 'time-now-text').attr('aria-hidden', true)
  timeLabel.append('tspan').attr('class', 'time-now-text__time').attr('text-anchor', 'middle').attr('x', 0)
  timeLabel.append('tspan').attr('class', 'time-now-text__date').attr('text-anchor', 'middle').attr('x', 0).attr('dy', '15')

  const locator = inner.append('g').attr('class', 'locator')
  locator.append('line').attr('class', 'locator__line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 0)
  locator.append('circle').attr('r', 5).attr('class', 'locator-point')

  const significantContainer = mainGroup.append('g').attr('class', 'significant').attr('role', 'grid').append('g').attr('role', 'row')

  const tooltip = mainGroup.append('g').attr('class', 'tooltip').attr('aria-hidden', true)
  const tooltipPath = tooltip.append('path').attr('class', 'tooltip-bg')
  const tooltipText = tooltip.append('text').attr('class', 'tooltip-text')
  const tooltipValue = tooltipText.append('tspan').attr('class', 'tooltip-text__strong').attr('x', 12).attr('dy', '0.5em')
  const tooltipDescription = tooltipText.append('tspan').attr('class', 'tooltip-text').attr('x', 12).attr('dy', '1.4em')

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
function setupEventHandlers(container, svg, margin, tooltipManager, lines, xScale, dataType) {
  let interfaceType = null
  let lastClientX, lastClientY

  const handleMouseMove = (e) => {
    if (lastClientX === e.clientX && lastClientY === e.clientY) return
    lastClientX = e.clientX
    lastClientY = e.clientY
    if (!xScale) return
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
    if (!xScale) return
    const touchEvent = e.targetTouches[0]
    const elementOffsetX = svg.node().getBoundingClientRect().left
    const dataPoint = findDataPointByX(pointer(touchEvent)[0] - elementOffsetX - margin.left, lines, xScale)
    tooltipManager.setDataPoint(dataPoint)
    tooltipManager.show(dataPoint, 10)
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
export function LineChart(containerId, stationId, data, options = {}) {
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

  let isMobile = window.matchMedia('(max-width: 640px)').matches
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
    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, width || 800)
    xScale = xScaleNew
    xExtent = xExtentNew

    yScale = createYScale(lines, dataCache.type, height || 400)

    // Calculate margins
    const numChars = yScale.domain()[1].toFixed(1).length - 2
    margin = { top: 20, bottom: 45, left: 15, right: (isMobile ? 31 : 36) + (numChars * 9) }

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
  const tooltipManager = createTooltipManager(
    tooltip, tooltipPath, tooltipValue, tooltipDescription, locator,
    xScale, yScale, height, dataCache.type, dataCache.latestDateTime
  )

  // Initial render
  renderChart()

  // Setup event handlers
  setupEventHandlers(container, svg, margin, tooltipManager, lines, xScale, dataCache.type)

  // Responsive handlers
  const mobileMediaQuery = window.matchMedia('(max-width: 640px)')
  mobileMediaQuery[mobileMediaQuery.addEventListener ? 'addEventListener' : 'addListener']('change', (e) => {
    isMobile = e.matches
    tooltipManager.hide()
    renderChart()
  })

  window.addEventListener('resize', () => {
    tooltipManager.hide()
    renderChart()
  })

  this.chart = container
}
