import { timeFormat } from 'd3-time-format'
import { DEFAULT_TOOLTIP_Y, TOOLTIP_TEXT_HEIGHT_OFFSET, TOOLTIP_PATH_LENGTH, TOOLTIP_PATH_LENGTH_WIDE, TOOLTIP_MARGIN_TOP, TOOLTIP_MARGIN_BOTTOM_OFFSET, TOOLTIP_VERTICAL_OFFSET } from './line-chart-constants.js'

export function createTooltipManager(tooltipConfig) {
  const { tooltip, tooltipPath, tooltipValue, tooltipDescription, locator, getHeight, dataType, latestDateTime, timeRange } = tooltipConfig

  function setPosition(x, y, dataPoint, yScaleFunc) {
    const currentHeight = getHeight()
    const locatorX = x
    const text = tooltip.select('text')
    const txtHeight = Math.round(text.node().getBBox().height) + TOOLTIP_TEXT_HEIGHT_OFFSET
    const pathLength = (timeRange === '1y' || timeRange === '5y') ? TOOLTIP_PATH_LENGTH_WIDE : TOOLTIP_PATH_LENGTH
    const pathCentre = `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`

    tooltipPath.attr('d', pathCentre)
    x -= (pathLength / 2)

    const tooltipHeight = tooltipPath.node().getBBox().height
    const tooltipMarginBottom = currentHeight - (tooltipHeight + TOOLTIP_MARGIN_BOTTOM_OFFSET)
    y -= tooltipHeight + TOOLTIP_VERTICAL_OFFSET

    if (y < TOOLTIP_MARGIN_TOP) {
      y = TOOLTIP_MARGIN_TOP
    } else if (y > tooltipMarginBottom) {
      y = tooltipMarginBottom
    } else {
      // Keep existing calculated y when already inside tooltip bounds.
    }

    tooltip.attr('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`)
    tooltip.classed('tooltip--visible', true)

    const locatorY = Math.floor(yScaleFunc(dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value))
    const isForecast = (new Date(dataPoint.dateTime)) > (new Date(latestDateTime))
    locator.classed('locator--forecast', isForecast)
    locator.attr('transform', `translate(${locatorX.toFixed(0)},0)`)
    locator.select('.locator__line').attr('y2', currentHeight)
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

function findDataPointByX(x, lines, xScale) {
  if (!lines || lines.length === 0 || !xScale) {
    return null
  }

  const mouseDate = xScale.invert(x)
  const mouseTime = mouseDate.getTime()

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

export function setupEventHandlers(container, svg, getState, tooltipManager) {
  let interfaceType = null
  let lastClientX
  let lastClientY

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

  const svgNode = svg.node()
  svgNode.addEventListener('click', handleClick)
  svgNode.addEventListener('mousemove', handleMouseMove)
  svgNode.addEventListener('touchstart', () => { interfaceType = 'touch' })
  svgNode.addEventListener('touchmove', handleTouchMove)
  svgNode.addEventListener('touchend', () => { interfaceType = null })
  container.addEventListener('mouseleave', () => { tooltipManager.hide() })
}

export function setupResponsiveHandlers(config) {
  const { container, svg, mobileMediaQuery, isMobileRef, tooltipManager, renderChart, stateRef } = config

  const getState = () => ({
    margin: stateRef.margin,
    lines: stateRef.lines,
    xScale: stateRef.xScale,
    yScale: stateRef.yScale
  })

  setupEventHandlers(container, svg, getState, tooltipManager)

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
