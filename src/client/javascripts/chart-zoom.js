import { zoom as d3Zoom, zoomIdentity, zoomTransform } from 'd3-zoom'

// Constants
const ZOOM_TRANSITION_DURATION = 300
const ZOOM_IN_FACTOR = 1.5
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR
const PAN_STEP_RATIO = 0.1
const TOUCH_PAN_STEP_PX = 8
const ZOOM_MIN_SCALE = 1
const ZOOM_MAX_SCALE_SAFETY = 1000
const MIN_ZOOM_WINDOW_DAYS = 5
const MIN_ZOOM_WINDOW_MS = MIN_ZOOM_WINDOW_DAYS * 24 * 60 * 60 * 1000

function getBoundedMaxZoomScale (maxScale) {
  if (!Number.isFinite(maxScale)) {
    return ZOOM_MIN_SCALE
  }

  return Math.max(ZOOM_MIN_SCALE, Math.min(maxScale, ZOOM_MAX_SCALE_SAFETY))
}

function calculateMaxZoomScaleFromDomain (baseXScale) {
  const [start, end] = baseXScale.domain() || []
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const spanMs = endMs - startMs

  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return ZOOM_MIN_SCALE
  }

  return getBoundedMaxZoomScale(spanMs / MIN_ZOOM_WINDOW_MS)
}

function callIfFunction (fn, ...args) {
  return typeof fn === 'function' ? fn(...args) : null
}

// Returns the locked state if the locked point is still within the visible chart,
// otherwise releases the lock and returns null.
function resolveVisibleLock (getLockedState, onAutoUnlock, xScale, width) {
  const lockedState = callIfFunction(getLockedState)
  if (!lockedState?.isLocked || !lockedState.dataPoint) {
    return null
  }

  const lockedPixelX = xScale(new Date(lockedState.dataPoint.dateTime))
  if (lockedPixelX < 0 || lockedPixelX > width) {
    callIfFunction(onAutoUnlock)
    return null
  }

  return lockedState
}

function createZoomYScale ({ createYScaleForRange, baseYScale, dataCache, height, timeRange }, lines) {
  if (typeof createYScaleForRange === 'function') {
    return createYScaleForRange(lines, dataCache.type, height, timeRange)
  }

  return baseYScale.copy().range([height, 0])
}

/**
 * Create zoom event handler
 */
export function createZoomHandler (config) {
  const { svg, baseXScale, width, height, timeRange, dataCache,
    significantContainer, timeLine, timeLabel, isMobile, tooltipManager, container,
    processData, renderAxes, renderGridLines, renderLines, renderSignificantPoints,
    getTickConfigForRender,
    renderThresholds, updateTimeIndicator, hideOverlappingTicks,
    thresholds, onThresholdDismiss, onThresholdActivate, getActiveThresholdId, getLockedState, onAutoUnlock } = config

  return (event) => {
    const { transform } = event
    // Only zoom/pan on X-axis (time dimension)
    const newXScale = transform.rescaleX(baseXScale)
    const lockedState = resolveVisibleLock(getLockedState, onAutoUnlock, newXScale, width)

    if (!lockedState) {
      tooltipManager.hide()
    }

    // Re-render with appropriate level of detail based on visible time window
    const { observedPoints, forecastPoints, lines } = processData(dataCache, newXScale.domain(), timeRange)
    const newYScale = createZoomYScale(config, lines)
    const tickConfig = callIfFunction(getTickConfigForRender, newXScale, timeRange, width)

    // Re-render axes and chart elements
    renderAxes(svg, { xScale: newXScale, yScale: newYScale, width, height, timeRange, tickConfig })
    renderGridLines(svg, newXScale, newYScale, height, width, timeRange, tickConfig)
    renderLines(svg, observedPoints, forecastPoints, newXScale, newYScale, height, dataCache.type)
    renderThresholds(
      svg.select('.thresholds'),
      width,
      newYScale,
      onThresholdDismiss,
      onThresholdActivate,
      callIfFunction(getActiveThresholdId),
      thresholds
    )
    renderSignificantPoints(significantContainer, observedPoints, forecastPoints, newXScale, newYScale, timeRange)
    updateTimeIndicator(timeLabel, timeLine, newXScale, height, isMobile, timeRange)
    hideOverlappingTicks(timeLabel)

    if (lockedState) {
      tooltipManager.show(lockedState.dataPoint, newXScale, newYScale, true)
    }

    container.updateZoomControls?.(transform.k)

    return { xScale: newXScale, yScale: newYScale, lines, observedPoints, forecastPoints }
  }
}

/**
 * Setup zoom behavior for the chart
 */
export function setupZoomBehavior (config) {
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
      // All other events (including touchend/touchcancel) are allowed so d3-zoom can
      // complete gesture lifecycles.
      if (event.type === 'touchstart' || event.type === 'touchmove') {
        return event.touches?.length > 1
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
export function setupZoomControls (container, mainGroup, zoomBehavior, maxZoomScale = ZOOM_MIN_SCALE, getZoomFocalPoint = null) {
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
    const focalPoint = typeof getZoomFocalPoint === 'function' ? getZoomFocalPoint() : null

    if (focalPoint) {
      mainGroup.call(zoomBehavior.scaleBy, ZOOM_IN_FACTOR, focalPoint)
    } else {
      mainGroup.call(zoomBehavior.scaleBy, ZOOM_IN_FACTOR)
    }
  }

  container.zoomOut = () => {
    const focalPoint = typeof getZoomFocalPoint === 'function' ? getZoomFocalPoint() : null

    if (focalPoint) {
      mainGroup.call(zoomBehavior.scaleBy, ZOOM_OUT_FACTOR, focalPoint)
    } else {
      mainGroup.call(zoomBehavior.scaleBy, ZOOM_OUT_FACTOR)
    }
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

