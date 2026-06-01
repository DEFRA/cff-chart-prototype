import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'

// Constants
const ZOOM_TRANSITION_DURATION = 300
const ZOOM_IN_FACTOR = 1.5
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR
const PAN_STEP_RATIO = 0.2
const ZOOM_MIN_SCALE = 1
const ZOOM_MAX_SCALE = 100

/**
 * Create zoom event handler
 */
export function createZoomHandler(config) {
  const { svg, baseXScale, baseYScale, width, height, timeRange, dataCache,
    significantContainer, timeLine, timeLabel, isMobile, tooltipManager, container,
    processData, renderAxes, renderGridLines, renderLines, renderSignificantPoints,
    updateTimeIndicator, hideOverlappingTicks } = config

  return (event, _lines) => {
    tooltipManager.hide()

    // Get the transform
    const transform = event.transform

    // Only zoom/pan on X-axis (time dimension)
    const newXScale = transform.rescaleX(baseXScale)

    const newYScale = baseYScale.copy().range([height, 0])

    // Re-render with appropriate level of detail
    const zoomLevel = transform.k
    const processedData = processData(dataCache, zoomLevel)
    const newObservedPoints = processedData.observedPoints
    const newForecastPoints = processedData.forecastPoints
    const newLines = processedData.lines

    // Re-render axes and chart elements
    renderAxes(svg, { xScale: newXScale, yScale: newYScale, width, height, timeRange })
    renderGridLines(svg, newXScale, newYScale, height, width, baseXScale.domain(), timeRange)
    renderLines(svg, newObservedPoints, newForecastPoints, newXScale, newYScale, height, dataCache.type)
    renderSignificantPoints(significantContainer, newObservedPoints, newForecastPoints, newXScale, newYScale, timeRange)
    updateTimeIndicator(svg, timeLabel, timeLine, newXScale, height, isMobile, timeRange)
    hideOverlappingTicks(timeLabel, timeRange)

    if (container.updateZoomControls) {
      container.updateZoomControls(transform.k)
    }

    // Return updated state
    return { xScale: newXScale, yScale: newYScale, lines: newLines, observedPoints: newObservedPoints, forecastPoints: newForecastPoints }
  }
}

/**
 * Setup zoom behavior for the chart
 */
export function setupZoomBehavior(config) {
  const { svg, mainGroup, width, height, margin, handleZoomEvent } = config

  const zoomBehavior = d3Zoom()
    .scaleExtent([ZOOM_MIN_SCALE, ZOOM_MAX_SCALE])  // Min 1x (full view), Max 100x zoom for granular detail
    .translateExtent([[0, 0], [width, height]])  // Constrain panning to chart bounds
    .extent([[0, 0], [width, height]])  // Define the viewport extent
    .filter((event) => {
      // Prevent default wheel behavior to stop page scrolling
      if (event.type === 'wheel') {
        event.preventDefault()
        event.stopPropagation()
      }
      return true
    })
    .on('zoom', (event) => {
      handleZoomEvent(event)
    })

  // Apply zoom behavior to main group
  mainGroup.call(zoomBehavior)

  // Create invisible rect for capturing wheel events
  const zoomRect = mainGroup.insert('rect', ':first-child')
    .attr('class', 'zoom-capture')
    .attr('x', -margin.left)
    .attr('y', -margin.top)
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .style('fill', 'none')
    .style('pointer-events', 'all')

  // Add wheel event listener to SVG to ensure preventDefault
  svg.node().addEventListener('wheel', (event) => {
    event.preventDefault()
  }, { passive: false })

  return { zoomBehavior, zoomRect }
}

/**
 * Setup zoom control methods on container
 */
export function setupZoomControls(container, mainGroup, zoomBehavior) {
  container.resetZoom = () => {
    mainGroup.interrupt()
    mainGroup.call(zoomBehavior.transform, zoomIdentity)

    // Touch/wheel sequences can leave a residual transform; apply again next frame.
    globalThis.requestAnimationFrame(() => {
      mainGroup.call(zoomBehavior.transform, zoomIdentity)
    })

    if (container.updateZoomControls) {
      container.updateZoomControls(1)
    }
  }

  container.zoomIn = () => {
    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.scaleBy, ZOOM_IN_FACTOR)
  }

  container.zoomOut = () => {
    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.scaleBy, ZOOM_OUT_FACTOR)
  }

  container.panLeft = () => {
    const chartWidth = container.getBoundingClientRect().width
    const panStep = Math.max(1, chartWidth * PAN_STEP_RATIO)

    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.translateBy, panStep, 0)
  }

  container.panRight = () => {
    const chartWidth = container.getBoundingClientRect().width
    const panStep = Math.max(1, chartWidth * PAN_STEP_RATIO)

    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.translateBy, -panStep, 0)
  }
}

