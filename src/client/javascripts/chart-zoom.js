import { zoom as d3Zoom, zoomIdentity, zoomTransform } from 'd3-zoom'

// Constants
const ZOOM_TRANSITION_DURATION = 300
const ZOOM_IN_FACTOR = 1.5
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR
const PAN_STEP_RATIO = 0.1
const TOUCH_PAN_STEP_PX = 8
const ZOOM_MIN_SCALE = 1
const ZOOM_MAX_SCALE_SAFETY = 1000
const FIVE_DAYS_SPAN = 5
const FIVE_DAYS_MS = FIVE_DAYS_SPAN * 24 * 60 * 60 * 1000
const SNAP_INTERVAL_MINUTES = 15
const SNAP_INTERVAL_MS = SNAP_INTERVAL_MINUTES * 60 * 1000

function getBoundedMaxZoomScale(maxScale) {
  if (!Number.isFinite(maxScale)) {
    return ZOOM_MIN_SCALE
  }

  return Math.max(ZOOM_MIN_SCALE, Math.min(maxScale, ZOOM_MAX_SCALE_SAFETY))
}

function calculateMaxZoomScaleFromDomain(baseXScale) {
  const [start, end] = baseXScale.domain() || []
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const spanMs = endMs - startMs

  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return ZOOM_MIN_SCALE
  }

  return getBoundedMaxZoomScale(spanMs / FIVE_DAYS_MS)
}

/**
 * Create zoom event handler
 */
export function createZoomHandler(config) {
  const { svg, baseXScale, baseYScale, width, height, timeRange, dataCache,
    significantContainer, timeLine, timeLabel, isMobile, tooltipManager, container,
    processData, renderAxes, renderGridLines, renderLines, renderSignificantPoints,
    renderThresholds, updateTimeIndicator, hideOverlappingTicks,
    thresholds, onThresholdDismiss, onThresholdActivate, getActiveThresholdId } = config

  return (event, _lines) => {
    tooltipManager.hide()

    // Get the transform
    const transform = event.transform

    // Only zoom/pan on X-axis (time dimension)
    const newXScale = transform.rescaleX(baseXScale)

    const newYScale = baseYScale.copy().range([height, 0])

    // Re-render with appropriate level of detail based on visible time window
    const visibleDomain = newXScale.domain()
    const processedData = processData(dataCache, visibleDomain, timeRange)
    const newObservedPoints = processedData.observedPoints
    const newForecastPoints = processedData.forecastPoints
    const newLines = processedData.lines

    // Adjust scale domain to match snapped data extent and align to nice intervals
    if (newLines && newLines.length > 0) {
      const snappedTimes = newLines.map(d => new Date(d.dateTime).getTime())
      const minTime = Math.min(...snappedTimes)
      const maxTime = Math.max(...snappedTimes)
      if (Number.isFinite(minTime) && Number.isFinite(maxTime) && minTime !== maxTime) {
        // Snap domain boundaries to nice intervals
        const snapIntervalMs = SNAP_INTERVAL_MS
        
        // Round domain start down to nearest interval
        const domainStart = Math.floor(minTime / snapIntervalMs) * snapIntervalMs
        // Round domain end up to nearest interval
        const domainEnd = Math.ceil(maxTime / snapIntervalMs) * snapIntervalMs
        
        newXScale.domain([new Date(domainStart), new Date(domainEnd)])
      }
    }


    // Re-render axes and chart elements
    renderAxes(svg, { xScale: newXScale, yScale: newYScale, width, height, timeRange })
    renderGridLines(svg, newXScale, newYScale, height, width, baseXScale.domain(), timeRange)
    renderLines(svg, newObservedPoints, newForecastPoints, newXScale, newYScale, height, dataCache.type)
    renderThresholds(
      svg.select('.thresholds'),
      width,
      newYScale,
      onThresholdDismiss,
      onThresholdActivate,
      typeof getActiveThresholdId === 'function' ? getActiveThresholdId() : null,
      thresholds
    )
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
  const { svg, mainGroup, width, height, margin, handleZoomEvent, baseXScale } = config
  const maxScale = calculateMaxZoomScaleFromDomain(baseXScale)

  const zoomBehavior = d3Zoom()
    .scaleExtent([ZOOM_MIN_SCALE, maxScale])  // Keep visible time window at or above 5 days
    .translateExtent([[0, 0], [width, height]])  // Constrain panning to chart bounds
    .extent([[0, 0], [width, height]])  // Define the viewport extent
    .filter((event) => {
      // Prevent default wheel behavior to stop page scrolling
      if (event.type === 'wheel') {
        event.preventDefault()
        event.stopPropagation()
        return true
      }
      
      // For touch events, only allow multi-touch (2+ fingers) for zooming/panning.
      // Single touch (1 finger) is handled by interaction handlers for showing tooltip.
      if (event.type === 'touchstart' || event.type === 'touchmove') {
        return event.touches && event.touches.length > 1
      }

      // Always allow end/cancel events so d3-zoom can complete gesture lifecycles.
      if (event.type === 'touchend' || event.type === 'touchcancel') {
        return true
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

  return { zoomBehavior, zoomRect, maxScale }
}

/**
 * Setup zoom control methods on container
 */
export function setupZoomControls(container, mainGroup, zoomBehavior, maxZoomScale = ZOOM_MIN_SCALE) {
  const boundedMaxZoomScale = getBoundedMaxZoomScale(maxZoomScale)

  const getPanStep = () => {
    const chartWidth = container.getBoundingClientRect().width
    const currentScale = zoomTransform(mainGroup.node()).k || ZOOM_MIN_SCALE
    const visibleWindowWidth = chartWidth / currentScale

    return Math.max(1, visibleWindowWidth * PAN_STEP_RATIO)
  }

  container.panBy = (deltaX) => {
    if (!Number.isFinite(deltaX) || deltaX === 0) {
      return
    }

    mainGroup.call(zoomBehavior.translateBy, deltaX, 0)
  }

  container.getTouchPanStep = () => TOUCH_PAN_STEP_PX
  container.getMaxZoomScale = () => boundedMaxZoomScale

  container.applyZoomTransform = (transform) => {
    if (!transform || !Number.isFinite(transform.k)) {
      return
    }

    const scale = getBoundedMaxZoomScale(transform.k)
    const x = Number.isFinite(transform.x) ? transform.x : 0
    const y = Number.isFinite(transform.y) ? transform.y : 0

    mainGroup.call(zoomBehavior.transform, zoomIdentity.translate(x, y).scale(scale))

    if (container.updateZoomControls) {
      container.updateZoomControls(scale)
    }
  }

  container.resetZoom = () => {
    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.transform, zoomIdentity)
      .on('end', () => {
        // Touch/wheel sequences can leave a residual transform; apply again after transition.
        globalThis.requestAnimationFrame(() => {
          mainGroup.call(zoomBehavior.transform, zoomIdentity)
        })
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
    const panStep = getPanStep()

    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.translateBy, panStep, 0)
  }

  container.panRight = () => {
    const panStep = getPanStep()

    mainGroup.transition()
      .duration(ZOOM_TRANSITION_DURATION)
      .call(zoomBehavior.translateBy, -panStep, 0)
  }
}

