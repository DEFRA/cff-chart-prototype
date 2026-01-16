import { simplify } from './utils.js'
import { area as d3Area, line as d3Line, curveMonotoneX } from 'd3-shape'
import { axisBottom, axisLeft } from 'd3-axis'
import { scaleLinear, scaleTime } from 'd3-scale'
import { timeFormat } from 'd3-time-format'
import { timeHour } from 'd3-time'
import { select, selectAll, pointer } from 'd3-selection'
import { extent, bisector } from 'd3-array'

const DISPLAYED_HOUR_ON_X_AXIS = 6

export function LineChart (containerId, stationId, data, options = {}) {
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

  const renderChart = () => {
    // Set scales
    setScaleX()
    setScaleY()

    // Set right margin depending on length of labels
    const numChars = yScale.domain()[1].toFixed(1).length - 2
    margin = { top: 20, bottom: 45, left: 15, right: (isMobile ? 31 : 36) + (numChars * 9) }

    // Get width and height
    const containerBoundingRect = container.getBoundingClientRect()
    width = Math.floor(containerBoundingRect.width) - margin.left - margin.right
    height = Math.floor(containerBoundingRect.height) - margin.top - margin.bottom

    // Calculate new xScale and yScales height and width
    xScale.range([0, width])
    yScale.range([height, 0])

    // Apply margin transform to main group
    svg.select('.chart-main').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

    // Draw axis
    const xAxis = axisBottom().tickSizeOuter(0)
    xAxis.scale(xScale).ticks(timeHour.filter(d => { return d.getHours() === DISPLAYED_HOUR_ON_X_AXIS })).tickFormat('')

    yAxis = axisLeft().ticks(5).tickFormat(d => {
      return parseFloat(d).toFixed(1)
    }).tickSizeOuter(0)
    yAxis.scale(yScale)

    // Position axis bottom and right
    svg.select('.x.axis').attr('transform', 'translate(0,' + height + ')').call(xAxis)
    svg.select('.y.axis').attr('transform', 'translate(' + width + ', 0)').call(yAxis)

    // Format X Axis ticks
    svg.select('.x.axis').selectAll('text').each(formatLabelsX)

    // Remove the last 6am tick label (current day's 6am) but keep the line
    const xAxisTicks = svg.select('.x.axis').selectAll('.tick')
    if (xAxisTicks.size() > 0) {
      // Get last tick and check if it's 6am on the last day
      const lastTick = xAxisTicks.nodes()[xAxisTicks.size() - 1]
      const lastTickData = select(lastTick).datum()
      if (lastTickData && lastTickData.getHours() === DISPLAYED_HOUR_ON_X_AXIS) {
        // Remove only the text element, keep the line
        select(lastTick).select('text').remove()
      }
    }

    // Position y ticks
    svg.select('.y.axis').style('text-anchor', 'start')
    svg.selectAll('.y.axis .tick line').attr('x1', -5).attr('x2', DISPLAYED_HOUR_ON_X_AXIS)
    svg.selectAll('.y.axis .tick text').attr('x', 9)

    svg.select('.x.grid')
      .attr('transform', 'translate(0,' + height + ')')
      .call(axisBottom(xScale)
        .ticks(timeHour.filter(d => { return d.getHours() === DISPLAYED_HOUR_ON_X_AXIS }))
        .tickSize(-height, 0, 0)
        .tickFormat('')
      )

    // Grid lines don't have labels, so we don't need to remove anything from grid

    svg.select('.y.grid')
      .attr('transform', 'translate(0,' + 0 + ')')
      .call(axisLeft(yScale)
        .ticks(5)
        .tickSize(-width, 0, 0)
        .tickFormat('')
      )

    // Update time line
    const timeX = Math.floor(xScale(new Date()))
    svg.select('.time-line').attr('y1', 0).attr('y2', height)
    timeLine.attr('y1', 0).attr('y2', height).attr('transform', 'translate(' + timeX + ',0)')
    timeLabel.attr('y', height + 9).attr('transform', 'translate(' + timeX + ',0)')
      .attr('dy', '0.71em')
      .attr('x', isMobile ? -20 : -24)

    // X Axis time label
    timeLabel.select('.time-now-text__time')
      .text(timeFormat('%-I:%M%p')(new Date()).toLowerCase())
    timeLabel.select('.time-now-text__date')
      .text(timeFormat('%-e %b')(new Date()))

    // Add height to locator line
    svg.select('.locator-line').attr('y1', 0).attr('y2', height)

    // Draw lines and areas
    if (dataCache.observed.length) {
      observedArea.datum(observedPoints).attr('d', area)
      observedLine.datum(observedPoints).attr('d', line)
    }
    if (dataCache.forecast.length) {
      forecastArea.datum(forecastPoints).attr('d', area)
      forecastLine.datum(forecastPoints).attr('d', line)
    }

    // Add significant points
    significantContainer.selectAll('*').remove()
    const significantObserved = observedPoints.filter(x => x.isSignificant).map(p => ({ ...p, type: 'observed' }))
    const significantForecast = forecastPoints.filter(x => x.isSignificant).map(p => ({ ...p, type: 'forecast' }))
    significantPoints = significantObserved.concat(significantForecast)
    const significantCells = significantContainer
      .attr('aria-rowcount', 1)
      .attr('aria-colcount', significantPoints.length)
      .selectAll('.point').data(significantPoints).enter()
      .append('g')
      .attr('role', 'gridcell')
      .attr('class', d => { return 'point point--' + d.type })
      .attr('tabindex', (d, i) => i === significantPoints.length - 1 ? 0 : -1)
      .attr('data-point', '')
      .attr('data-index', (d, i) => { return i })
    significantCells.append('circle').attr('aria-hidden', true)
      .attr('r', '5')
      .attr('cx', d => xScale(new Date(d.dateTime)))
      .attr('cy', d => yScale(dataCache.type === 'river' && d.value < 0 ? 0 : d.value))
    significantCells.insert('text')
      .attr('x', d => xScale(new Date(d.dateTime)))
      .attr('y', d => yScale(dataCache.type === 'river' && d.value < 0 ? 0 : d.value))
      .text(d => {
        const value = `${dataCache.type === 'river' && d.value < 0 ? 0 : d.value.toFixed(2)}m`
        const time = timeFormat('%-I:%M%p')(new Date(d.dateTime)).toLowerCase()
        const date = timeFormat('%e %b')(new Date(d.dateTime))
        return `${value} ${time}, ${date}`
      })

    // Hide x axis labels that overlap with time now label
    const timeNowX = timeLabel.node().getBoundingClientRect().left
    const timeNowWidth = timeLabel.node().getBoundingClientRect().width
    const ticks = selectAll('.x .tick')
    ticks.each((d, i, n) => {
      const tick = n[i]
      const tickX = tick.getBoundingClientRect().left
      const tickWidth = tick.getBoundingClientRect().width
      const isOverlap = (tickX + tickWidth + 5) > timeNowX && tickX <= (timeNowX + timeNowWidth + 5)
      select(tick).classed('tick--hidden', isOverlap)
    })
  }

  const getDataPointByX = (x) => {
    if (!lines || lines.length === 0) return
    const mouseDate = xScale.invert(x)
    const bisectDate = bisector((d) => { return new Date(d.dateTime) }).left
    const i = bisectDate(lines, mouseDate, 1)
    const d0 = lines[i - 1]
    const d1 = lines[i] || lines[i - 1]
    if (!d0 || !d1) return
    const d = mouseDate - new Date(d0.dateTime) > new Date(d1.dateTime) - mouseDate ? d1 : d0
    dataPoint = d
  }

  const setTooltipPosition = (x, y) => {
    const text = tooltip.select('text')
    const txtHeight = Math.round(text.node().getBBox().height) + 23
    const pathLength = 140
    const pathCentre = `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`
    tooltipText.attr('x', 0).attr('y', 20)
    tooltipPath.attr('d', pathCentre)
    x -= pathLength / 2
    if (x <= 0) {
      x = 0
    } else if (x + pathLength >= (width + margin.right) - 15) {
      x = (width + margin.right) - 15 - pathLength
    }
    const tooltipHeight = tooltipPath.node().getBBox().height
    const tooltipMarginTop = 10
    const tooltipMarginBottom = height - (tooltipHeight + 10)
    y -= tooltipHeight + 40
    y = y < tooltipMarginTop ? tooltipMarginTop : y > tooltipMarginBottom ? tooltipMarginBottom : y
    tooltip.attr('transform', 'translate(' + x.toFixed(0) + ',' + y.toFixed(0) + ')')
    tooltip.classed('tooltip--visible', true)
    const locatorX = Math.floor(xScale(new Date(dataPoint.dateTime)))
    const locatorY = Math.floor(yScale(dataCache.type === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value))
    const isForecast = (new Date(dataPoint.dateTime)) > (new Date(dataCache.latestDateTime))
    locator.classed('locator--forecast', isForecast)
    locator.attr('transform', 'translate(' + locatorX + ',' + 0 + ')')
    locator.select('.locator-point').attr('transform', 'translate(' + 0 + ',' + locatorY + ')')
  }

  const showTooltip = (tooltipY = 10) => {
    if (!dataPoint) return
    const value = dataCache.type === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0 ? '0' : dataPoint.value.toFixed(2)
    tooltipValue.text(`${value}m`)
    tooltipDescription.text(`${timeFormat('%-I:%M%p')(new Date(dataPoint.dateTime)).toLowerCase()}, ${timeFormat('%e %b')(new Date(dataPoint.dateTime))}`)
    locator.classed('locator--visible', true)
    const tooltipX = xScale(new Date(dataPoint.dateTime))
    setTooltipPosition(tooltipX, tooltipY)
  }

  const hideTooltip = () => {
    tooltip.classed('tooltip--visible', false)
    locator.classed('locator--visible', false)
  }

  const setScaleX = () => {
    xExtent = extent(dataCache.observed.concat(dataCache.forecast), (d, i) => { return new Date(d.dateTime) })
    // Don't extend beyond the last recorded time
    xScaleInitial = scaleTime().domain(xExtent)
    xScaleInitial.range([0, width])
    xScale = scaleTime().domain(xExtent)
  }

  const setScaleY = () => {
    yExtent = extent(lines, (d, i) => { return d.value })
    yExtentDataMin = yExtent[0]
    yExtentDataMax = yExtent[1]
    let range = yExtentDataMax - yExtentDataMin
    range = range < 1 ? 1 : range
    const yRangeUpperBuffered = (yExtentDataMax + (range / 3))
    const yRangeLowerBuffered = (yExtentDataMin - (range / 3))
    yExtent[1] = yExtentDataMax <= yRangeUpperBuffered ? yRangeUpperBuffered : yExtentDataMax
    yExtent[0] = dataCache.type === 'river' ? (yRangeLowerBuffered < 0 ? 0 : yRangeLowerBuffered) : yRangeLowerBuffered
    yExtent[1] = yExtent[1] < 1 ? 1 : yExtent[1]
    yScale = scaleLinear().domain(yExtent).nice(5)
    yScale.range([height, 0])
    yAxis = axisLeft()
    yAxis.ticks(5).tickFormat((d) => { return parseFloat(d).toFixed(2) + 'm' })
    yAxis.scale(yScale)
  }

  const getDataPage = (start, end) => {
    lines = []

    if (dataCache.observed && dataCache.observed.length) {
      dataCache.observed = simplify(dataCache.observed, dataCache.type === 'tide' ? 10000000 : 1000000)
      const errorFilter = l => !l.err
      const errorAndNegativeFilter = l => errorFilter(l)
      const filterNegativeValues = ['groundwater', 'tide', 'sea'].includes(dataCache.type) ? errorFilter : errorAndNegativeFilter
      lines = dataCache.observed.filter(filterNegativeValues).map(l => ({ ...l, type: 'observed' })).reverse()
      dataPoint = lines[lines.length - 1] || null
    }
    if (dataCache.forecast && dataCache.forecast.length) {
      dataCache.forecast = simplify(dataCache.forecast, dataCache.type === 'tide' ? 10000000 : 1000000)
      const latestTime = (new Date(dataCache.observed[0].dateTime).getTime())
      const forecastStartTime = (new Date(dataCache.forecast[0].dateTime).getTime())
      const latestValue = dataCache.observed[0].value
      const forecastStartValue = dataCache.forecast[0].value
      const isSame = latestTime === forecastStartTime && latestValue === forecastStartValue
      dataCache.forecast[0].isSignificant = !isSame
      lines = lines.concat(dataCache.forecast.map(l => ({ ...l, type: 'forecast' })))
    }

    observedPoints = lines.filter(l => l.type === 'observed')
    forecastPoints = lines.filter(l => l.type === 'forecast')

    area = d3Area().curve(curveMonotoneX)
      .x(d => { return xScale(new Date(d.dateTime)) })
      .y0(d => { return height })
      .y1(d => { return yScale(dataCache.type === 'river' && d.value < 0 ? 0 : d.value) })

    line = d3Line().curve(curveMonotoneX)
      .x((d) => { return xScale(new Date(d.dateTime)) })
      .y((d) => { return yScale(dataCache.type === 'river' && d.value < 0 ? 0 : d.value) })

    yExtent = extent(lines, (d, i) => { return d.value })
    yExtentDataMin = yExtent[0]
    yExtentDataMax = yExtent[1]
  }

  const formatLabelsX = (d, i, nodes) => {
    const element = select(nodes[i])
    const formattedTime = timeFormat('%-I%p')(new Date(d.setHours(DISPLAYED_HOUR_ON_X_AXIS, 0, 0, 0))).toLocaleLowerCase()
    const formattedDate = timeFormat('%-e %b')(new Date(d))
    element.append('tspan').text(formattedTime)
    element.append('tspan').attr('x', 0).attr('dy', '15').text(formattedDate)
  }

  const initChart = () => {
    getDataPage(pageStart, pageEnd)
    renderChart()
  }

  // Container already declared at top of function

  const description = document.createElement('span')
  description.className = 'govuk-visually-hidden'
  description.setAttribute('aria-live', 'polite')
  description.setAttribute('id', 'line-chart-description')
  container.appendChild(description)

  const svg = select(`#${containerId}`).append('svg')
    .attr('id', `${containerId}-visualisation`)
    .attr('aria-label', 'Line chart')
    .attr('aria-describedby', 'line-chart-description')
    .attr('focusable', 'false')

  // Create a main group that will be transformed by margins
  const mainGroup = svg.append('g').attr('class', 'chart-main')

  mainGroup.append('g').attr('class', 'y grid').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'x grid').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'x axis').attr('aria-hidden', true)
  mainGroup.append('g').attr('class', 'y axis').attr('aria-hidden', true).style('text-anchor', 'start')

  const inner = mainGroup.append('g').attr('class', 'inner').attr('aria-hidden', true)
  inner.append('g').attr('class', 'observed observed-focus')
  inner.append('g').attr('class', 'forecast')
  const observedArea = inner.select('.observed').append('path').attr('class', 'observed-area')
  const observedLine = inner.select('.observed').append('path').attr('class', 'observed-line')
  const forecastArea = inner.select('.forecast').append('path').attr('class', 'forecast-area')
  const forecastLine = inner.select('.forecast').append('path').attr('class', 'forecast-line')

  const timeLine = mainGroup.append('line').attr('class', 'time-line').attr('aria-hidden', true)
  const timeLabel = mainGroup.append('text').attr('class', 'time-now-text').attr('aria-hidden', true)
  timeLabel.append('tspan').attr('class', 'time-now-text__time').attr('text-anchor', 'middle').attr('x', 0)
  timeLabel.append('tspan').attr('class', 'time-now-text__date').attr('text-anchor', 'middle').attr('x', 0).attr('dy', '15')

  const locator = inner.append('g').attr('class', 'locator')
  locator.append('line').attr('class', 'locator-line')
  locator.append('circle').attr('r', 4.5).attr('class', 'locator-point')

  const significantContainer = mainGroup.append('g').attr('class', 'significant').attr('role', 'grid').append('g').attr('role', 'row')

  const tooltip = mainGroup.append('g').attr('class', 'tooltip').attr('aria-hidden', true)
  const tooltipPath = tooltip.append('path').attr('class', 'tooltip-bg')
  const tooltipText = tooltip.append('text').attr('class', 'tooltip-text')
  const tooltipValue = tooltipText.append('tspan').attr('class', 'tooltip-text__strong').attr('x', 12).attr('dy', '0.5em')
  const tooltipDescription = tooltipText.append('tspan').attr('class', 'tooltip-text').attr('x', 12).attr('dy', '1.4em')

  let isMobile, interfaceType
  let dataPoint
  let width, height, margin, xScaleInitial, xScale, yScale, xExtent, yAxis, yExtent, yExtentDataMin, yExtentDataMax
  let lines, area, line, observedPoints, forecastPoints, significantPoints

  const mobileMediaQuery = window.matchMedia('(max-width: 640px)')
  isMobile = mobileMediaQuery.matches

  let pageStart = new Date()
  let pageEnd = new Date()
  pageStart.setHours(pageStart.getHours() - (5 * 24))
  pageStart = pageStart.toISOString().replace(/.\d+Z$/g, 'Z')
  pageEnd = pageEnd.toISOString().replace(/.\d+Z$/g, 'Z')

  const dataCache = data
  initChart()

  this.chart = container

  mobileMediaQuery[mobileMediaQuery.addEventListener ? 'addEventListener' : 'addListener']('change', (e) => {
    isMobile = e.matches
    hideTooltip()
    renderChart()
  })

  window.addEventListener('resize', () => {
    if (interfaceType === 'touch') return
    hideTooltip()
    renderChart()
  })

  container.addEventListener('mouseleave', (e) => {
    hideTooltip()
  })

  svg.on('click', (e) => {
    getDataPointByX(pointer(e)[0])
    showTooltip(pointer(e)[1])
  })

  let lastClientX, lastClientY
  svg.on('mousemove', (e) => {
    if (lastClientX === e.clientX && lastClientY === e.clientY) return
    lastClientX = e.clientX
    lastClientY = e.clientY
    if (!xScale) return
    if (interfaceType === 'touch') {
      interfaceType = 'mouse'
      return
    }
    interfaceType = 'mouse'
    getDataPointByX(pointer(e)[0])
    showTooltip(pointer(e)[1])
  })

  svg.on('touchstart', (e) => {
    interfaceType = 'touch'
  })

  svg.on('touchmove', (e) => {
    if (!xScale) return
    const touchEvent = e.targetTouches[0]
    const elementOffsetX = svg.node().getBoundingClientRect().left
    getDataPointByX(pointer(touchEvent)[0] - elementOffsetX)
    showTooltip(10)
  })

  svg.on('touchend', (e) => {
    interfaceType = null
  })
}
