import { createZoomHandler, setupZoomBehavior, setupZoomControls } from './chart-zoom.js'
import {
  MARGIN_TOP,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  DESKTOP_MARGIN_RIGHT_BASE,
  MARGIN_CHAR_MULTIPLIER,
  MOBILE_BREAKPOINT,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT
} from './line-chart-constants.js'
import { processData } from './line-chart-data.js'
import { createXScale, createYScale, renderAxes, renderGridLines, updateTimeIndicator, hideOverlappingTicks, getYAxisLabelFormatter } from './line-chart-layout.js'
import { renderLines, renderSignificantPoints, renderThresholds, initializeSVG } from './line-chart-render.js'
import { createTooltipManager, setupResponsiveHandlers } from './line-chart-interaction.js'

const Y_AXIS_SAMPLE_TICK_COUNT = 6
const MIN_Y_AXIS_LABEL_LENGTH = 3
const MOBILE_MARGIN_LEFT = 8
const MOBILE_MARGIN_RIGHT_BASE = 14
const MOBILE_Y_LABEL_CHAR_WIDTH = 6

function createThresholdDismissHandler(stateRef) {
  return (thresholdId) => {
    if (Array.isArray(stateRef.thresholds)) {
      stateRef.thresholds = stateRef.thresholds.map(threshold => {
        if (threshold.id !== thresholdId) {
          return threshold
        }

        return {
          ...threshold,
          enabled: false,
          showLabel: false
        }
      })

      const enabledThresholds = stateRef.thresholds.filter(threshold => threshold.enabled)
      if (!enabledThresholds.some(threshold => threshold.id === stateRef.activeThresholdId)) {
        stateRef.activeThresholdId = enabledThresholds.length ? enabledThresholds[enabledThresholds.length - 1].id : null
      }
    }

    if (typeof stateRef.onThresholdDismiss === 'function') {
      stateRef.onThresholdDismiss(thresholdId)
    }
  }
}

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
      renderLines,
      renderThresholds,
      renderSignificantPoints,
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
      getActiveThresholdId: () => stateRef.activeThresholdId
    })(event, stateRef.lines)

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
    margin: stateRef.margin,
    handleZoomEvent
  })

  zoomRef.behavior = zoomSetup.zoomBehavior
  zoomRef.rect = zoomSetup.zoomRect

  setupZoomControls(container, mainGroup, zoomRef.behavior)
}

function assignProcessedDataToState(stateRef, processedData) {
  stateRef.lines = processedData.lines
  stateRef.observedPoints = processedData.observedPoints
  stateRef.forecastPoints = processedData.forecastPoints
}

function getLongestYAxisLabelLength(yScale) {
  const yDomain = yScale.domain()
  const yRange = yDomain[1] - yDomain[0]
  const yAxisFormatter = getYAxisLabelFormatter(yRange)
  const yLabelSamples = yScale.ticks(Y_AXIS_SAMPLE_TICK_COUNT).map(tick => yAxisFormatter(tick))

  return yLabelSamples.reduce((max, label) => Math.max(max, label.length), MIN_Y_AXIS_LABEL_LENGTH)
}

function setChartMargins(stateRef, isMobile, longestYAxisLabelLength) {
  const rightBase = isMobile ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE
  const yLabelCharWidth = isMobile ? MOBILE_Y_LABEL_CHAR_WIDTH : MARGIN_CHAR_MULTIPLIER

  stateRef.margin = {
    top: MARGIN_TOP,
    bottom: MARGIN_BOTTOM,
    left: isMobile ? MOBILE_MARGIN_LEFT : MARGIN_LEFT,
    right: rightBase + (longestYAxisLabelLength * yLabelCharWidth)
  }
}

function setChartDimensionsFromContainer(container, stateRef) {
  const containerRect = container.getBoundingClientRect()
  stateRef.width = Math.floor(containerRect.width) - stateRef.margin.left - stateRef.margin.right
  stateRef.height = Math.floor(containerRect.height) - stateRef.margin.top - stateRef.margin.bottom
}

function updateZoomViewport(zoomRef, stateRef) {
  if (!zoomRef.rect || !zoomRef.behavior) {
    return
  }

  zoomRef.rect
    .attr('x', -stateRef.margin.left)
    .attr('y', -stateRef.margin.top)
    .attr('width', stateRef.width + stateRef.margin.left + stateRef.margin.right)
    .attr('height', stateRef.height + stateRef.margin.top + stateRef.margin.bottom)

  zoomRef.behavior
    .translateExtent([[0, 0], [stateRef.width, stateRef.height]])
    .extent([[0, 0], [stateRef.width, stateRef.height]])
}

function syncZoomBaseScales(zoomRef, stateRef) {
  if (zoomRef.baseXScaleRef) {
    zoomRef.baseXScaleRef.current = stateRef.xScale.copy()
  }

  if (zoomRef.baseYScaleRef) {
    zoomRef.baseYScaleRef.current = stateRef.yScale.copy()
  }
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

  const render = (zoomLevel = 1) => {
        const enabledThresholds = Array.isArray(stateRef.thresholds)
          ? stateRef.thresholds.filter(threshold => threshold.enabled)
          : []

        if (!enabledThresholds.some(threshold => threshold.id === stateRef.activeThresholdId)) {
          const labelPreferred = enabledThresholds.filter(threshold => threshold.showLabel)
          
          if (labelPreferred.length) {
            stateRef.activeThresholdId = labelPreferred[labelPreferred.length - 1].id
          } else if (enabledThresholds.length) {
            stateRef.activeThresholdId = enabledThresholds[enabledThresholds.length - 1].id
          } else {
            stateRef.activeThresholdId = null
          }
        }

        const activateThreshold = (thresholdId) => {
          if (stateRef.activeThresholdId === thresholdId) {
            return
          }

          stateRef.activeThresholdId = thresholdId
          if (typeof stateRef.onThresholdActivate === 'function') {
            stateRef.onThresholdActivate(thresholdId)
          }
          render(zoomLevel)
        }

    const dismissThreshold = createThresholdDismissHandler(stateRef)
    const processedData = processData(dataCache, zoomLevel)
    assignProcessedDataToState(stateRef, processedData)

    if (!stateRef.lines || stateRef.lines.length === 0) {
      console.warn('No data to render')
      return
    }

    const { scale: xScaleNew, extent: xExtentNew } = createXScale(dataCache.observed, dataCache.forecast, stateRef.width || DEFAULT_WIDTH)
    stateRef.xScale = xScaleNew
    stateRef.xExtent = xExtentNew
    stateRef.yScale = createYScale(stateRef.lines, dataCache.type, stateRef.height || DEFAULT_HEIGHT)

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

    renderAxes(svg, { xScale: stateRef.xScale, yScale: stateRef.yScale, width: stateRef.width, height: stateRef.height, timeRange })
    renderGridLines(svg, stateRef.xScale, stateRef.yScale, stateRef.height, stateRef.width, stateRef.xExtent, timeRange)
    updateTimeIndicator(svg, svgElements.timeLabel, svgElements.timeLine, stateRef.xScale, stateRef.height, isMobileRef.current, timeRange)
    hideOverlappingTicks(svgElements.timeLabel, timeRange)
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

    updateZoomViewport(zoomRef, stateRef)
    syncZoomBaseScales(zoomRef, stateRef)
  }

  return render
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
    forecastPoints: null,
    activeThresholdId: null
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
    timeRange,
    enableZoom,
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
    return null
  }

  if (!data) {
    console.error('LineChart: No data provided')
    return null
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
