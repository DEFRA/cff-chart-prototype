import { createZoomHandler, setupZoomBehavior, setupZoomControls } from './chart-zoom.js'
import { setupSteppedZoom, TIMELINE_ZOOM_STEPS } from './chart-stepped-zoom.js'
import {
  MOBILE_BREAKPOINT,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT
} from './line-chart-constants.js'
import { processData } from './line-chart-data.js'
import { createXScale, createYScaleForRange, renderAxes, renderGridLines, updateTimeIndicator, hideOverlappingTicks, getTickConfigForRender } from './line-chart-layout.js'
import { renderLines, renderSignificantPoints, renderThresholds, initializeSVG } from './line-chart-render.js'
import { createTooltipManager, setupResponsiveHandlers } from './line-chart-interaction.js'
import {
  createThresholdDismissHandler,
  getEnabledThresholds,
  ensureActiveThreshold,
  createActivateThresholdHandler,
  renderThresholdLayerOnly
} from './line-chart-threshold.js'
import {
  assignProcessedDataToState,
  getLongestYAxisLabelLength,
  setChartMargins,
  setChartDimensionsFromContainer,
  updateZoomViewport,
  syncZoomBaseScales,
  calculateFinalExtent,
  createStateRef
} from './line-chart-utils.js'

function initializeZoom (config) {
  const {
    svg,
    mainGroup,
    stateRef,
    dataCache,
    processData,
    timeRange,
    significantContainer,
    timeLine,
    timeLabel,
    isMobileRef,
    tooltipManager,
    container,
    zoomRef,
    initialZoomDomain,
    steppedZoom,
    onRangeChange
  } = config

  zoomRef.baseXScaleRef = zoomRef.baseXScaleRef || { current: stateRef.xScale.copy() }
  zoomRef.baseXScaleRef.current = stateRef.xScale.copy()
  zoomRef.baseYScaleRef = zoomRef.baseYScaleRef || { current: stateRef.yScale.copy() }
  zoomRef.baseYScaleRef.current = stateRef.yScale.copy()
  const dismissThreshold = createThresholdDismissHandler(stateRef)

  const handleZoomEvent = (event) => {
    const result = createZoomHandler({
      svg,
      baseXScale: zoomRef.baseXScaleRef.current,
      baseYScale: zoomRef.baseYScaleRef.current,
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
      getTickConfigForRender,
      renderLines,
      renderThresholds,
      renderSignificantPoints,
      createYScaleForRange,
      updateTimeIndicator,
      hideOverlappingTicks,
      thresholds: stateRef.thresholds,
      onThresholdDismiss: dismissThreshold,
      onThresholdActivate: (thresholdId) => {
        stateRef.activeThresholdId = thresholdId
        if (typeof stateRef.onThresholdActivate === 'function') {
          stateRef.onThresholdActivate(thresholdId)
        }
      },
      getActiveThresholdId: () => stateRef.activeThresholdId,
      getLockedState: () => ({ isLocked: stateRef.isLocked, dataPoint: stateRef.lockedDataPoint }),
      onAutoUnlock: () => {
        if (typeof stateRef.unlockPoint === 'function') {
          stateRef.unlockPoint()
        }
      }
    })(event, stateRef.lines)

    stateRef.xScale = result.xScale
    stateRef.yScale = result.yScale
    stateRef.lines = result.lines
    stateRef.observedPoints = result.observedPoints
    stateRef.forecastPoints = result.forecastPoints

    if (stateRef.isLocked && stateRef.lockedDataPoint) {
      stateRef.lockedX = result.xScale(new Date(stateRef.lockedDataPoint.dateTime))
    }
  }

  const zoomSetup = setupZoomBehavior({
    svg,
    mainGroup,
    width: stateRef.width,
    height: stateRef.height,
    margin: stateRef.margin,
    handleZoomEvent,
    baseXScale: zoomRef.baseXScaleRef.current,
    steppedZoom
  })

  zoomRef.behavior = zoomSetup.zoomBehavior
  zoomRef.rect = zoomSetup.zoomRect

  const getZoomFocalPoint = () => {
    if (stateRef.isLocked && Number.isFinite(stateRef.lockedX)) {
      return [stateRef.lockedX, stateRef.height / 2]
    }

    return null
  }

  setupZoomControls(container, mainGroup, zoomRef.behavior, zoomSetup.maxScale, getZoomFocalPoint)

  if (steppedZoom) {
    setupSteppedZoom({
      container,
      mainGroup,
      zoomBehavior: zoomRef.behavior,
      getBaseScale: () => zoomRef.baseXScaleRef.current,
      onRangeChange
    })
    return
  }

  if (Array.isArray(initialZoomDomain) && initialZoomDomain.length === 2) {
    const [visibleStart, visibleEnd] = initialZoomDomain.map(value => new Date(value))
    const [baseStart, baseEnd] = zoomRef.baseXScaleRef.current.domain().map(value => new Date(value))
    const visibleDuration = visibleEnd.getTime() - visibleStart.getTime()
    const baseDuration = baseEnd.getTime() - baseStart.getTime()

    if (visibleDuration > 0 && baseDuration > visibleDuration) {
      const scale = baseDuration / visibleDuration
      container.applyZoomTransform({
        k: scale,
        x: -scale * zoomRef.baseXScaleRef.current(visibleStart),
        y: 0
      })
    }
  }
}

function renderChartComponents (config) {
  const { svg, svgElements, stateRef, dataCache, timeRange, isMobileRef } = config
  const { activateThreshold, dismissThreshold } = config.handlers
  const tickConfig = getTickConfigForRender(stateRef.xScale, timeRange, stateRef.width)

  if (stateRef.observedPoints.length > 0) {
    const first = stateRef.observedPoints[0]
    const last = stateRef.observedPoints[stateRef.observedPoints.length - 1]
    console.log(`[renderChartComponents] timeRange=${timeRange}, points=${stateRef.observedPoints.length}, first=${first?.value}@${first?.dateTime}, last=${last?.value}@${last?.dateTime}`)
  }

  renderAxes(svg, { xScale: stateRef.xScale, yScale: stateRef.yScale, width: stateRef.width, height: stateRef.height, timeRange, tickConfig })
  renderGridLines(svg, stateRef.xScale, stateRef.yScale, stateRef.height, stateRef.width, timeRange, tickConfig)
  updateTimeIndicator(svgElements.timeLabel, svgElements.timeLine, stateRef.xScale, stateRef.height, isMobileRef.current, timeRange)
  hideOverlappingTicks(svgElements.timeLabel)
  renderLines(svg, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, stateRef.height, dataCache.type)
  renderThresholds(
    svgElements.thresholdsContainer,
    stateRef.width,
    stateRef.yScale,
    dismissThreshold,
    activateThreshold,
    stateRef.activeThresholdId,
    stateRef.thresholds
  )
  renderSignificantPoints(svgElements.significantContainer, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, timeRange)

  svgElements.inner.select('.locator__line').attr('y1', 0).attr('y2', stateRef.height)
}

function createChartRenderer (config) {
  const {
    container,
    svg,
    mainGroup,
    svgElements,
    dataCache,
    processData,
    steppedZoom,
    initialZoomDomain,
    timeRange,
    isMobileRef,
    stateRef,
    zoomRef
  } = config

  const render = (visibleDomain = null) => {
    const savedDomain = steppedZoom ? container.getVisibleDomain?.() : null
    const enabledThresholds = getEnabledThresholds(stateRef.thresholds)
    ensureActiveThreshold(stateRef, enabledThresholds)

    const activateThreshold = createActivateThresholdHandler(stateRef, () => render(visibleDomain))
    const dismissThreshold = createThresholdDismissHandler(stateRef)

    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, stateRef.width || DEFAULT_WIDTH, timeRange)
    if (steppedZoom) {
      const end = initialZoomDomain?.[1] || xScaleNew.domain()[1]
      xScaleNew.domain([TIMELINE_ZOOM_STEPS.at(-1).start(end), end])
    }
    const effectiveVisibleDomain = visibleDomain || xExtentNew

    const processedData = processData(dataCache, effectiveVisibleDomain, timeRange)
    assignProcessedDataToState(stateRef, processedData)

    if (!stateRef.lines || stateRef.lines.length === 0) {
      console.warn('No data to render')
      return
    }

    stateRef.xScale = xScaleNew
    stateRef.xExtent = calculateFinalExtent(visibleDomain, stateRef.lines, xExtentNew)
    stateRef.yScale = createYScaleForRange(stateRef.lines, dataCache.type, stateRef.height || DEFAULT_HEIGHT, timeRange)

    const longestYAxisLabelLength = getLongestYAxisLabelLength(stateRef.yScale)
    setChartMargins(stateRef, isMobileRef.current, longestYAxisLabelLength)
    setChartDimensionsFromContainer(container, stateRef)

    stateRef.xScale.range([0, stateRef.width])
    stateRef.yScale.range([stateRef.height, 0])

    mainGroup.attr('transform', `translate(${stateRef.margin.left},${stateRef.margin.top})`)

    svg.select('.clip-rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', stateRef.width)
      .attr('height', stateRef.height)

    renderChartComponents({
      svg,
      svgElements,
      stateRef,
      dataCache,
      timeRange,
      isMobileRef,
      handlers: { activateThreshold, dismissThreshold }
    })

    updateZoomViewport(zoomRef, stateRef)
    syncZoomBaseScales(zoomRef, stateRef)
    if (savedDomain) container.restoreZoomView(savedDomain)
  }

  return render
}

function setupChartContext (containerId, data, options) {
  const dataCache = data
  const timeRange = options.timeRange || '5d'
  const enableZoom = options.enableZoom || false
  const svgElements = initializeSVG(containerId)
  const {
    svg,
    mainGroup,
    timeLine,
    timeLabel,
    thresholdsContainer,
    locator,
    significantContainer,
    tooltip,
    tooltipPath,
    tooltipValue,
    tooltipDescription
  } = svgElements

  const mobileMediaQuery = globalThis.matchMedia(MOBILE_BREAKPOINT)
  const isMobileRef = { current: mobileMediaQuery.matches }
  const stateRef = createStateRef()
  stateRef.thresholds = Array.isArray(options.thresholds) ? options.thresholds : []
  const initiallyEnabledThresholds = stateRef.thresholds.filter(threshold => threshold.enabled)
  const hasExternalActive = typeof options.activeThresholdId === 'string' &&
    initiallyEnabledThresholds.some(threshold => threshold.id === options.activeThresholdId)
  const labelPreferred = initiallyEnabledThresholds.filter(threshold => threshold.showLabel)

  if (hasExternalActive) {
    stateRef.activeThresholdId = options.activeThresholdId
  } else if (labelPreferred.length) {
    stateRef.activeThresholdId = labelPreferred[labelPreferred.length - 1].id
  } else if (initiallyEnabledThresholds.length) {
    stateRef.activeThresholdId = initiallyEnabledThresholds[initiallyEnabledThresholds.length - 1].id
  } else {
    stateRef.activeThresholdId = null
  }

  stateRef.onThresholdDismiss = typeof options.onThresholdDismiss === 'function' ? options.onThresholdDismiss : null
  stateRef.onThresholdActivate = typeof options.onThresholdActivate === 'function' ? options.onThresholdActivate : null
  const zoomRef = { behavior: null, rect: null }

  return {
    dataCache,
    processData: (cache, visibleDomain, range) => processData(cache, visibleDomain, range, {
      preserveAllPoints: options.preserveAllPoints === true
    }),
    timeRange,
    enableZoom,
    initialZoomDomain: options.initialZoomDomain,
    steppedZoom: options.steppedZoom === true,
    onRangeChange: options.onRangeChange,
    svgElements,
    svg,
    mainGroup,
    timeLine,
    timeLabel,
    thresholdsContainer,
    locator,
    significantContainer,
    tooltip,
    tooltipPath,
    tooltipValue,
    tooltipDescription,
    mobileMediaQuery,
    isMobileRef,
    stateRef,
    zoomRef
  }
}

function setupTooltipManager (context) {
  return createTooltipManager({
    tooltip: context.tooltip,
    tooltipPath: context.tooltipPath,
    tooltipValue: context.tooltipValue,
    tooltipDescription: context.tooltipDescription,
    locator: context.locator,
    getHeight: () => context.stateRef.height,
    getWidth: () => context.stateRef.width,
    dataType: context.dataCache.type,
    latestDateTime: context.dataCache.latestDateTime,
    timeRange: context.timeRange
  })
}

function initializeZoomIfEnabled (context, container, tooltipManager) {
  if (!context.enableZoom) {
    container.panBy = undefined
    container.getTouchPanStep = undefined
    container.getMaxZoomScale = undefined
    container.applyZoomTransform = undefined
    container.resetZoom = undefined
    container.zoomIn = undefined
    container.zoomOut = undefined
    container.panLeft = undefined
    container.panRight = undefined

    if (typeof container.updateZoomControls === 'function') {
      container.updateZoomControls(1)
    }

    return
  }

  initializeZoom({
    svg: context.svg,
    mainGroup: context.mainGroup,
    stateRef: context.stateRef,
    dataCache: context.dataCache,
    processData: context.processData,
    timeRange: context.timeRange,
    significantContainer: context.significantContainer,
    timeLine: context.timeLine,
    timeLabel: context.timeLabel,
    isMobileRef: context.isMobileRef,
    tooltipManager,
    container,
    zoomRef: context.zoomRef,
    initialZoomDomain: context.initialZoomDomain,
    steppedZoom: context.steppedZoom,
    onRangeChange: context.onRangeChange
  })
}

export function lineChart (containerId, data, options = {}) {
  const container = document.getElementById(containerId)

  if (!container) {
    console.error('LineChart: Container not found:', containerId)
    return null
  }

  if (!data) {
    console.error('LineChart: No data provided')
    return null
  }

  const context = setupChartContext(containerId, data, options)
  const renderChart = createChartRenderer({
    container,
    svg: context.svg,
    mainGroup: context.mainGroup,
    svgElements: context.svgElements,
    dataCache: context.dataCache,
    processData: context.processData,
    steppedZoom: context.steppedZoom,
    initialZoomDomain: context.initialZoomDomain,
    timeRange: context.timeRange,
    isMobileRef: context.isMobileRef,
    stateRef: context.stateRef,
    zoomRef: context.zoomRef
  })

  const tooltipManager = setupTooltipManager(context)

  container.updateThresholds = ({
    thresholds,
    activeThresholdId,
    onThresholdDismiss,
    onThresholdActivate
  } = {}) => {
    if (Array.isArray(thresholds)) {
      context.stateRef.thresholds = thresholds
    }

    if (typeof activeThresholdId === 'string' || activeThresholdId === null) {
      context.stateRef.activeThresholdId = activeThresholdId
    }

    if (typeof onThresholdDismiss === 'function') {
      context.stateRef.onThresholdDismiss = onThresholdDismiss
    }

    if (typeof onThresholdActivate === 'function') {
      context.stateRef.onThresholdActivate = onThresholdActivate
    }

    const enabledThresholds = getEnabledThresholds(context.stateRef.thresholds)
    ensureActiveThreshold(context.stateRef, enabledThresholds)
    renderThresholdLayerOnly(context.thresholdsContainer, context.stateRef)
  }

  renderChart()

  initializeZoomIfEnabled(context, container, tooltipManager)

  setupResponsiveHandlers({
    container,
    svg: context.svg,
    mobileMediaQuery: context.mobileMediaQuery,
    isMobileRef: context.isMobileRef,
    tooltipManager,
    renderChart,
    stateRef: context.stateRef,
    onThresholdLineHover: (hoveredThresholdId) => {
      const svgNode = context.svg.node()
      if (!svgNode) {
        return
      }
      context.svg.classed('chart--threshold-line-hover', Boolean(hoveredThresholdId))
      context.svg.selectAll('.thresholds .threshold').classed('threshold--line-hover', false)

      if (hoveredThresholdId) {
        context.svg.select(`.thresholds .threshold--${hoveredThresholdId}`).classed('threshold--line-hover', true)
      }
    }
  })

  return container
}
