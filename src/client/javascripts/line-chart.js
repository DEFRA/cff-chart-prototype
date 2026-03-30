import { createZoomHandler, setupZoomBehavior, setupZoomControls, setupChartInfoUpdate } from './chart-zoom.js'
import {
  MARGIN_TOP,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MOBILE_MARGIN_RIGHT_BASE,
  DESKTOP_MARGIN_RIGHT_BASE,
  MARGIN_CHAR_MULTIPLIER,
  MOBILE_BREAKPOINT,
  DECIMAL_PLACES,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT
} from './line-chart-constants.js'
import { processData } from './line-chart-data.js'
import { createXScale, createYScale, renderAxes, renderGridLines, updateTimeIndicator, hideOverlappingTicks } from './line-chart-layout.js'
import { renderLines, renderSignificantPoints, initializeSVG } from './line-chart-render.js'
import { createTooltipManager, setupResponsiveHandlers } from './line-chart-interaction.js'

function initializeZoom(config) {
  const {
    svg,
    mainGroup,
    stateRef,
    dataCache,
    timeRange,
    significantContainer,
    timeLine,
    timeLabel,
    isMobileRef,
    tooltipManager,
    container,
    zoomRef
  } = config

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

function createChartRenderer(config) {
  const {
    container,
    svg,
    mainGroup,
    svgElements,
    dataCache,
    timeRange,
    isMobileRef,
    stateRef,
    zoomRef
  } = config

  return (zoomLevel = 1) => {
    const processedData = processData(dataCache, zoomLevel)
    stateRef.lines = processedData.lines
    stateRef.observedPoints = processedData.observedPoints
    stateRef.forecastPoints = processedData.forecastPoints

    if (!stateRef.lines || stateRef.lines.length === 0) {
      console.warn('No data to render')
      return
    }

    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, stateRef.width || DEFAULT_WIDTH)
    stateRef.xScale = xScaleNew
    stateRef.xExtent = xExtentNew
    stateRef.yScale = createYScale(stateRef.lines, dataCache.type, stateRef.height || DEFAULT_HEIGHT)

    const numChars = stateRef.yScale.domain()[1].toFixed(1).length - DECIMAL_PLACES
    stateRef.margin = {
      top: MARGIN_TOP,
      bottom: MARGIN_BOTTOM,
      left: MARGIN_LEFT,
      right: (isMobileRef.current ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE) + (numChars * MARGIN_CHAR_MULTIPLIER)
    }

    const containerRect = container.getBoundingClientRect()
    stateRef.width = Math.floor(containerRect.width) - stateRef.margin.left - stateRef.margin.right
    stateRef.height = Math.floor(containerRect.height) - stateRef.margin.top - stateRef.margin.bottom

    stateRef.xScale.range([0, stateRef.width])
    stateRef.yScale.range([stateRef.height, 0])

    mainGroup.attr('transform', `translate(${stateRef.margin.left},${stateRef.margin.top})`)

    svg.select('.clip-rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', stateRef.width)
      .attr('height', stateRef.height)

    renderAxes(svg, { xScale: stateRef.xScale, yScale: stateRef.yScale, width: stateRef.width, height: stateRef.height, timeRange })
    renderGridLines(svg, stateRef.xScale, stateRef.yScale, stateRef.height, stateRef.width, stateRef.xExtent)
    updateTimeIndicator(svg, svgElements.timeLabel, svgElements.timeLine, stateRef.xScale, stateRef.height, isMobileRef.current)
    hideOverlappingTicks(svgElements.timeLabel)
    renderLines(svg, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, stateRef.height, dataCache.type)
    renderSignificantPoints(svgElements.significantContainer, stateRef.observedPoints, stateRef.forecastPoints, stateRef.xScale, stateRef.yScale, timeRange)

    svgElements.inner.select('.locator__line').attr('y1', 0).attr('y2', stateRef.height)

    if (zoomRef.rect && zoomRef.behavior) {
      zoomRef.rect.attr('width', stateRef.width).attr('height', stateRef.height)
      zoomRef.behavior
        .translateExtent([[0, 0], [stateRef.width, stateRef.height]])
        .extent([[0, 0], [stateRef.width, stateRef.height]])
    }
  }
}

function createStateRef() {
  return {
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
}

function setupChartContext(containerId, data, options) {
  const dataCache = data
  const timeRange = options.timeRange || '5d'
  const enableZoom = options.enableZoom || false
  const svgElements = initializeSVG(containerId)
  const {
    svg,
    mainGroup,
    timeLine,
    timeLabel,
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
  const zoomRef = { behavior: null, rect: null }

  return {
    dataCache,
    timeRange,
    enableZoom,
    svgElements,
    svg,
    mainGroup,
    timeLine,
    timeLabel,
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

function setupTooltipManager(context) {
  return createTooltipManager({
    tooltip: context.tooltip,
    tooltipPath: context.tooltipPath,
    tooltipValue: context.tooltipValue,
    tooltipDescription: context.tooltipDescription,
    locator: context.locator,
    getHeight: () => context.stateRef.height,
    dataType: context.dataCache.type,
    latestDateTime: context.dataCache.latestDateTime,
    timeRange: context.timeRange
  })
}

function initializeZoomIfEnabled(context, container, tooltipManager) {
  if (!context.enableZoom) {
    return
  }

  initializeZoom({
    svg: context.svg,
    mainGroup: context.mainGroup,
    stateRef: context.stateRef,
    dataCache: context.dataCache,
    timeRange: context.timeRange,
    significantContainer: context.significantContainer,
    timeLine: context.timeLine,
    timeLabel: context.timeLabel,
    isMobileRef: context.isMobileRef,
    tooltipManager,
    container,
    zoomRef: context.zoomRef
  })
}

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

  const context = setupChartContext(containerId, data, _options)
  const renderChart = createChartRenderer({
    container,
    svg: context.svg,
    mainGroup: context.mainGroup,
    svgElements: context.svgElements,
    dataCache: context.dataCache,
    timeRange: context.timeRange,
    isMobileRef: context.isMobileRef,
    stateRef: context.stateRef,
    zoomRef: context.zoomRef
  })

  const tooltipManager = setupTooltipManager(context)

  renderChart()

  initializeZoomIfEnabled(context, container, tooltipManager)

  setupResponsiveHandlers({
    container,
    svg: context.svg,
    mobileMediaQuery: context.mobileMediaQuery,
    isMobileRef: context.isMobileRef,
    tooltipManager,
    renderChart,
    stateRef: context.stateRef
  })

  this.chart = container
}
