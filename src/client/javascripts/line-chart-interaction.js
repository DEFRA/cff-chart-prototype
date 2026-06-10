import { timeFormat } from 'd3-time-format'
import { select } from 'd3-selection'
import { TOOLTIP_TEXT_HEIGHT_OFFSET, TOOLTIP_PATH_LENGTH, TOOLTIP_PATH_LENGTH_WIDE, TOOLTIP_MARGIN_TOP, TOOLTIP_MARGIN_BOTTOM_OFFSET, TOOLTIP_VERTICAL_OFFSET } from './line-chart-constants.js'

const THRESHOLD_DETECTION_TOLERANCE_PX = 12
const TOUCH_EDGE_PAN_THRESHOLD_PX = 16
const WIDE_TIME_RANGES = new Set(['6m', '1y', '3y', '5y'])

function getPathLength(timeRange) {
  return WIDE_TIME_RANGES.has(timeRange) ? TOOLTIP_PATH_LENGTH_WIDE : TOOLTIP_PATH_LENGTH
}

function clampTooltipX(x, pathLength, chartWidth) {
  if (chartWidth === null) {
    return x
  }

  if (x < 0) {
    return 0
  }

  if (x + pathLength > chartWidth) {
    return chartWidth - pathLength
  }

  return x
}

function clampTooltipY(y, tooltipHeight, currentHeight) {
  const marginBottom = currentHeight - (tooltipHeight + TOOLTIP_MARGIN_BOTTOM_OFFSET)

  if (y < TOOLTIP_MARGIN_TOP) {
    return TOOLTIP_MARGIN_TOP
  }

  if (y > marginBottom) {
    return marginBottom
  }

  return y
}

export function createTooltipManager(tooltipConfig) {
  const { tooltip, tooltipPath, tooltipValue, tooltipDescription, locator, getHeight, getWidth, dataType, latestDateTime, timeRange } = tooltipConfig

  function setThresholdHoverState(isHovering) {
    const svgNode = tooltip.node()?.ownerSVGElement
    if (!svgNode) {
      return
    }

    select(svgNode).select('.thresholds').classed('thresholds--hovering', isHovering)
  }

  function setPosition(x, y, dataPoint, yScaleFunc) {
    const currentHeight = getHeight()
    const locatorX = x
    const txtHeight = Math.round(tooltip.select('text').node().getBBox().height) + TOOLTIP_TEXT_HEIGHT_OFFSET
    const pathLength = getPathLength(timeRange)

    tooltipPath.attr('d', `M${pathLength},${txtHeight}l0,-${txtHeight}l-${pathLength},0l0,${txtHeight}l${pathLength},0Z`)

    const chartWidth = typeof getWidth === 'function' ? getWidth() : null
    x = clampTooltipX(x - (pathLength / 2), pathLength, chartWidth)
    y = clampTooltipY(y - tooltipPath.node().getBBox().height - TOOLTIP_VERTICAL_OFFSET, tooltipPath.node().getBBox().height, currentHeight)

    tooltip.attr('transform', `translate(${x.toFixed(0)},${y.toFixed(0)})`)
    tooltip.classed('tooltip--visible', true)
    tooltip.raise()

    const locatorY = Math.floor(yScaleFunc(dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value))
    locator.classed('locator--forecast', new Date(dataPoint.dateTime) > new Date(latestDateTime))
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
    const includeYear = timeRange === '6m' || timeRange === '1y' || timeRange === '3y' || timeRange === '5y'
    const dateFormat = includeYear ? '%e %b %Y' : '%e %b'

    tooltipValue.text(`${value}m`)
    tooltipDescription.text(`${timeFormat('%-I:%M%p')(dateObj).toLowerCase()}, ${timeFormat(dateFormat)(dateObj)}`)

    setThresholdHoverState(true)
    locator.classed('locator--visible', true)

    const tooltipX = xScaleFunc(new Date(dataPoint.dateTime))
    setPosition(tooltipX, tooltipY, dataPoint, yScaleFunc)
  }

  function hide() {
    tooltip.classed('tooltip--visible', false)
    locator.classed('locator--visible', false)
    setThresholdHoverState(false)
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

function detectNearestThreshold(chartY, yScale, thresholds) {
  const enabledThresholds = thresholds?.filter(t => t.enabled) || []
  let nearestThresholdId = null
  let nearestDiff = Number.POSITIVE_INFINITY

  for (const threshold of enabledThresholds) {
    const thresholdY = yScale(threshold.value)
    const diff = Math.abs(chartY - thresholdY)
    if (diff <= THRESHOLD_DETECTION_TOLERANCE_PX && diff < nearestDiff) {
      nearestDiff = diff
      nearestThresholdId = threshold.id
    }
  }

  return nearestThresholdId
}

function updateThresholdHover(chartY, yScale, thresholds, hoveredThresholdIdRef, onThresholdLineHover) {
  if (typeof onThresholdLineHover !== 'function' || !yScale) {
    return
  }

  const nearestThresholdId = detectNearestThreshold(chartY, yScale, thresholds)

  if (nearestThresholdId !== hoveredThresholdIdRef.value) {
    hoveredThresholdIdRef.value = nearestThresholdId
    onThresholdLineHover(nearestThresholdId)
  }
}

function handleTouchPan(touchX, touchWidth, container) {
  if (!Number.isFinite(touchWidth) || touchWidth <= 0 || typeof container.panBy !== 'function') {
    return
  }

  const touchPanStep = typeof container.getTouchPanStep === 'function' ? container.getTouchPanStep() : 8

  if (touchX <= TOUCH_EDGE_PAN_THRESHOLD_PX) {
    container.panBy(touchPanStep)
  } else if (touchX >= touchWidth - TOUCH_EDGE_PAN_THRESHOLD_PX) {
    container.panBy(-touchPanStep)
  } else {
    // Touch is not near edges; do not pan
  }
}

function attachEventListeners(svgNode, container, eventConfig) {
  const { handleClick, handleMouseMove, handleTouchMove, tooltipManager, onThresholdLineHover, interfaceTypeRef, hoveredThresholdIdRef } = eventConfig

  svgNode.addEventListener('click', handleClick)
  svgNode.addEventListener('mousemove', handleMouseMove)
  svgNode.addEventListener('touchstart', () => { interfaceTypeRef.value = 'touch' })
  svgNode.addEventListener('touchmove', handleTouchMove, { passive: false })
  svgNode.addEventListener('touchend', () => { interfaceTypeRef.value = null })
  container.addEventListener('mouseleave', () => {
    tooltipManager.hide()
    if (hoveredThresholdIdRef.value && typeof onThresholdLineHover === 'function') {
      hoveredThresholdIdRef.value = null
      onThresholdLineHover(null)
    }
  })
}

function getMousePosition(e, svgElement) {
  const rect = svgElement.getBoundingClientRect()
  return [e.clientX - rect.left, e.clientY - rect.top]
}

export function setupEventHandlers(container, svg, getState, tooltipManager, onThresholdLineHover) {
  const interfaceTypeRef = { value: null }
  const hoveredThresholdIdRef = { value: null }
  let lastClientX, lastClientY

  const handleMouseMove = (e) => {
    if (lastClientX === e.clientX && lastClientY === e.clientY) {
      return
    }

    lastClientX = e.clientX
    lastClientY = e.clientY

    const { margin, lines, xScale, yScale, thresholds } = getState()
    if (!xScale) {
      return
    }

    if (interfaceTypeRef.value === 'touch') {
      interfaceTypeRef.value = 'mouse'
      return
    }

    interfaceTypeRef.value = 'mouse'
    const [mouseX, mouseY] = getMousePosition(e, svg.node())
    const chartX = mouseX - margin.left
    const chartY = mouseY - margin.top
    const dataPoint = findDataPointByX(chartX, lines, xScale)
    tooltipManager.show(dataPoint, chartY, xScale, yScale)
    updateThresholdHover(chartY, yScale, thresholds, hoveredThresholdIdRef, onThresholdLineHover)
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
    if (!e.touches || e.touches.length !== 1) {
      return
    }

    e.preventDefault()
    let { margin, lines, xScale, yScale } = getState()
    if (!xScale) {
      return
    }

    const touchEvent = e.touches[0]
    const [mouseX, mouseY] = getMousePosition(touchEvent, svg.node())
    let chartX = mouseX - margin.left
    const chartY = mouseY - margin.top
    const chartWidth = Array.isArray(xScale.range()) ? xScale.range()[1] : null

    handleTouchPan(chartX, chartWidth, container)
    // Refresh state after pan; xScale may have updated
    const updatedState = getState();
    ({ margin, lines, xScale, yScale } = updatedState)
    chartX = mouseX - margin.left

    const dataPoint = findDataPointByX(chartX, lines, xScale)
    tooltipManager.show(dataPoint, chartY, xScale, yScale)
  }

  const svgNode = svg.node()
  attachEventListeners(svgNode, container, {
    handleClick,
    handleMouseMove,
    handleTouchMove,
    tooltipManager,
    onThresholdLineHover,
    interfaceTypeRef,
    hoveredThresholdIdRef
  })
}

export function setupResponsiveHandlers(config) {
  const { container, svg, mobileMediaQuery, isMobileRef, tooltipManager, renderChart, stateRef } = config

  const getState = () => ({
    margin: stateRef.margin,
    lines: stateRef.lines,
    xScale: stateRef.xScale,
    yScale: stateRef.yScale,
    thresholds: stateRef.thresholds
  })

  setupEventHandlers(container, svg, getState, tooltipManager, config.onThresholdLineHover)

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
