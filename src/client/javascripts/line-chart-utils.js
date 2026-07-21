import { getYAxisLabelFormatter } from './line-chart-layout.js'
import {
  MARGIN_TOP,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  DESKTOP_MARGIN_RIGHT_BASE,
  MARGIN_CHAR_MULTIPLIER
} from './line-chart-constants.js'

const Y_AXIS_SAMPLE_TICK_COUNT = 6
const MIN_Y_AXIS_LABEL_LENGTH = 3
const MOBILE_MARGIN_LEFT = 8
const MOBILE_MARGIN_RIGHT_BASE = 14
const MOBILE_Y_LABEL_CHAR_WIDTH = 6

export function assignProcessedDataToState(stateRef, processedData) {
  stateRef.lines = processedData.lines
  stateRef.observedPoints = processedData.observedPoints
  stateRef.forecastPoints = processedData.forecastPoints
}

export function getLongestYAxisLabelLength(yScale) {
  const yDomain = yScale.domain()
  const yRange = yDomain[1] - yDomain[0]
  const yAxisFormatter = getYAxisLabelFormatter(yRange)
  const yLabelSamples = yScale.ticks(Y_AXIS_SAMPLE_TICK_COUNT).map(tick => yAxisFormatter(tick))

  return yLabelSamples.reduce((max, label) => Math.max(max, label.length), MIN_Y_AXIS_LABEL_LENGTH)
}

export function setChartMargins(stateRef, isMobile, longestYAxisLabelLength) {
  const rightBase = isMobile ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE
  const yLabelCharWidth = isMobile ? MOBILE_Y_LABEL_CHAR_WIDTH : MARGIN_CHAR_MULTIPLIER

  stateRef.margin = {
    top: MARGIN_TOP,
    bottom: MARGIN_BOTTOM,
    left: isMobile ? MOBILE_MARGIN_LEFT : MARGIN_LEFT,
    right: rightBase + (longestYAxisLabelLength * yLabelCharWidth)
  }
}

export function setChartDimensionsFromContainer(container, stateRef) {
  const containerRect = container.getBoundingClientRect()
  stateRef.width = Math.floor(containerRect.width) - stateRef.margin.left - stateRef.margin.right
  stateRef.height = Math.floor(containerRect.height) - stateRef.margin.top - stateRef.margin.bottom
}

export function updateZoomViewport(zoomRef, stateRef) {
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

export function syncZoomBaseScales(zoomRef, stateRef) {
  if (zoomRef.baseXScaleRef) {
    zoomRef.baseXScaleRef.current = stateRef.xScale.copy()
  }

  if (zoomRef.baseYScaleRef) {
    zoomRef.baseYScaleRef.current = stateRef.yScale.copy()
  }
}

export function calculateFinalExtent(visibleDomain, lines, xExtentNew) {
  if (!visibleDomain || !lines || lines.length === 0) {
    return xExtentNew
  }

  const snappedTimes = lines.map(d => new Date(d.dateTime).getTime())
  if (snappedTimes.length === 0) {
    return xExtentNew
  }

  const minTime = Math.min(...snappedTimes)
  const maxTime = Math.max(...snappedTimes)

  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime) {
    return xExtentNew
  }

  return [new Date(minTime), new Date(maxTime)]
}

export function createStateRef() {
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
