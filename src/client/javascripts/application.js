import { initAll } from 'govuk-frontend'
import './utils.js'
import './toggletip.js'
import { lineChart } from './line-chart.js'
import {
  mergeData,
  filterDataByTimeRange
} from './historic-data.js'
import {
  LINE_CHART_ID,
  DEFAULT_FILTER,
  ARIA_DISABLED,
  HISTORIC_DATA_ENDPOINT,
  THRESHOLD_CURRENT_LEVEL_ID,
  THRESHOLD_HIGHEST_LEVEL_ID,
  THRESHOLD_TOP_NORMAL_ID,
  TIME_FILTER_LINK_SELECTOR,
  HISTORIC_DATA_REQUIRED_FILTERS
} from './application-constants.js'
import {
  getDefaultActiveThresholdId,
  getThresholdMetrics,
  buildThresholds,
  updateThresholdControls,
  setupThresholdControlHandlers
} from './application-thresholds.js'
import {
  setupDownloadCsvReverseTabHandler,
  updateDownloadCsvState,
  updateFilterButtonStates,
  setTimeFilterLinksTemporarilyDisabled,
  updateZoomControlsVisibility,
  updateTimeRangeLabel,
  updateActiveButtonState,
  setupZoomControls
} from './application-ui.js'

initAll()

const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000

function getRecentVisibleDomain(telemetry) {
  const getLatestTimestamp = (points) => points.reduce((latestTimestamp, point) => {
    const timestamp = new Date(point.dateTime).getTime()
    return Number.isFinite(timestamp) ? Math.max(latestTimestamp, timestamp) : latestTimestamp
  }, Number.NEGATIVE_INFINITY)

  const latestObserved = getLatestTimestamp(telemetry.observed || [])
  const latestForecast = getLatestTimestamp(telemetry.forecast || [])

  if (!Number.isFinite(latestObserved) && !Number.isFinite(latestForecast)) {
    return null
  }

  const latestAvailable = Math.max(latestObserved, latestForecast)
  const visibleStart = (Number.isFinite(latestObserved) ? latestObserved : latestAvailable) - FIVE_DAYS_MS
  return [new Date(visibleStart), new Date(latestAvailable)]
}

async function fetchHistoricData(stationId, refresh = false) {
  const refreshQuery = refresh ? '&refresh=true' : ''
  const response = await fetch(`${HISTORIC_DATA_ENDPOINT}?stationId=${encodeURIComponent(stationId)}${refreshQuery}`, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Historic data request failed with status ${response.status}`)
  }

  const payload = await response.json()
  return Array.isArray(payload?.readings) ? payload.readings : []
}

function renderInteractiveChart(realtimeTelemetry, mergedObserved, currentFilter, thresholdContext, renderOptions = {}) {
  const { thresholds, onThresholdDismiss, activeThresholdRef } = thresholdContext
  const preserveZoom = renderOptions.preserveZoom === true

  const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)
  const fullTelemetry = {
    ...realtimeTelemetry,
    observed: filteredObserved
  }

  updateTimeRangeLabel(currentFilter)
  updateActiveButtonState(currentFilter)
  updateDownloadCsvState(currentFilter)

  const previousChartMain = document.querySelector(`#${LINE_CHART_ID} .chart-main`)
  const previousZoom = previousChartMain?.__zoom
  const preservedZoomTransform = (preserveZoom && currentFilter !== DEFAULT_FILTER && previousZoom)
    ? {
        k: previousZoom.k,
        x: previousZoom.x,
        y: previousZoom.y
      }
    : null

  const chartContainer = lineChart(LINE_CHART_ID, fullTelemetry, {
    timeRange: currentFilter,
    enableZoom: currentFilter !== DEFAULT_FILTER,
    preserveAllPoints: globalThis.flood?.model?.chartStyle === 'styleB',
    steppedZoom: globalThis.flood?.model?.chartStyle === 'styleB',
    onRangeChange: ({ label }) => {
      const headingRange = document.getElementById('chart-visible-range')
      if (headingRange) headingRange.textContent = label
    },
    initialZoomDomain: globalThis.flood?.model?.chartStyle === 'styleB'
      ? getRecentVisibleDomain(fullTelemetry)
      : null,
    thresholds,
    activeThresholdId: activeThresholdRef.value,
    onThresholdDismiss,
    onThresholdActivate: (thresholdId) => {
      activeThresholdRef.value = thresholdId
    }
  })

  if (preservedZoomTransform && typeof chartContainer?.applyZoomTransform === 'function') {
    chartContainer.applyZoomTransform(preservedZoomTransform)
  }

  setupZoomControls()
  updateZoomControlsVisibility(currentFilter)
}

function updateThresholdsOnly(chartContainer, thresholds, activeThresholdId, onThresholdDismiss) {
  if (typeof chartContainer?.updateThresholds !== 'function') {
    return false
  }

  chartContainer.updateThresholds({
    thresholds,
    activeThresholdId,
    onThresholdDismiss,
    onThresholdActivate: (thresholdId) => {
      activeThresholdId = thresholdId
    }
  })

  return true
}

function renderChartFlow(realtimeTelemetry, mergedObserved, currentFilter, thresholdState, activeThresholdRef, renderOptions) {
  const thresholdMetrics = getThresholdMetrics(mergedObserved)
  const thresholds = buildThresholds(thresholdMetrics, thresholdState)
  
  const onThresholdDismiss = (thresholdId) => {
    thresholdState[thresholdId] = false
    if (activeThresholdRef.value === thresholdId) {
      activeThresholdRef.value = getDefaultActiveThresholdId(thresholdState)
    }
    updateThresholdControls(thresholdMetrics, thresholdState)
  }

  updateThresholdControls(thresholdMetrics, thresholdState)

  if (renderOptions.thresholdsOnly !== true) {
    renderInteractiveChart(
      realtimeTelemetry,
      mergedObserved,
      currentFilter.value,
      { thresholds, onThresholdDismiss, activeThresholdRef },
      renderOptions
    )
    return
  }

  const chartContainer = document.getElementById(LINE_CHART_ID)
  updateThresholdsOnly(chartContainer, thresholds, activeThresholdRef.value, onThresholdDismiss)
}

function createRenderChart(realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef) {
  let isRendering = false
  
  return (renderOptions = {}) => {
    // Guard against concurrent renders
    if (isRendering) {
      console.warn('Render already in progress, skipping concurrent render')
      return
    }
    
    isRendering = true
    try {
      const realtimeObserved = realtimeTelemetry?.observed || []
      
      // Only merge historic data for views that require it (6m, 1y, 3y)
      // For 5-day views, use only realtime data to avoid stale historic records
      const shouldUseHistoric = HISTORIC_DATA_REQUIRED_FILTERS.has(currentFilter.value)
      const mergedObserved = (shouldUseHistoric && historicDataRef.data?.length)
        ? mergeData(historicDataRef.data, realtimeObserved) || []
        : realtimeObserved || []
      
      renderChartFlow(realtimeTelemetry, mergedObserved, currentFilter, thresholdState, activeThresholdRef, renderOptions)
    } finally {
      isRendering = false
    }
  }
}

async function loadHistoricDataIfNeeded(stationId, historicDataRef) {
  if (historicDataRef.loaded) {
    return true
  }

  setTimeFilterLinksTemporarilyDisabled(true)

  try {
    const historicData = await fetchHistoricData(stationId)
    historicDataRef.data = historicData
    historicDataRef.loaded = true
    historicDataRef.available = historicData.length > 0
    return true
  } catch (error) {
    console.error('Failed to fetch historic data:', error)
    setTimeFilterLinksTemporarilyDisabled(false)
    updateFilterButtonStates(historicDataRef)
    return false
  }
}

function handleTimeFilterClick(link, stationId, currentFilter, historicDataRef, renderChart) {
  const isDisabled = link.getAttribute(ARIA_DISABLED) === 'true'
  if (isDisabled) {
    return
  }

  const nextFilter = link.dataset.filter
  const needsHistoricData = nextFilter !== DEFAULT_FILTER && !historicDataRef.loaded

  if (!needsHistoricData) {
    currentFilter.value = nextFilter
    renderChart()
    return
  }

  // Historic data needed - handle async load
  loadHistoricDataIfNeeded(stationId, historicDataRef).then(success => {
    if (success) {
      setTimeFilterLinksTemporarilyDisabled(false)
      updateFilterButtonStates(historicDataRef)
      currentFilter.value = nextFilter
      renderChart()
    }
  })
}

function setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    link.addEventListener('click', function (event) {
      event.preventDefault()
      handleTimeFilterClick(this, stationId, currentFilter, historicDataRef, renderChart)
    })
  })
}

async function initializeChartApp() {
  const stationId = globalThis.flood?.model?.id
  const realtimeTelemetry = globalThis.flood?.model?.telemetry

  if (!stationId || !realtimeTelemetry) {
    console.warn('Missing station data')
    return
  }

  const isSingleTimeline = globalThis.flood.model.chartStyle === 'styleB'
  const currentFilter = { value: isSingleTimeline ? '3y' : DEFAULT_FILTER }
  const thresholdState = {
    [THRESHOLD_CURRENT_LEVEL_ID]: false,
    [THRESHOLD_HIGHEST_LEVEL_ID]: false,
    [THRESHOLD_TOP_NORMAL_ID]: true
  }
  const activeThresholdRef = { value: THRESHOLD_TOP_NORMAL_ID }

  const initialHistoricData = globalThis.flood?.model?.historicData || []
  const historicDataRef = {
    data: initialHistoricData,
    loaded: initialHistoricData.length > 0,
    available: Boolean(globalThis.flood?.model?.historicDataAvailable) || initialHistoricData.length > 0
  }

  const hasNoRealtimeData = !realtimeTelemetry?.observed?.length
  if (isSingleTimeline || (hasNoRealtimeData && historicDataRef.available && !historicDataRef.loaded)) {
    const status = isSingleTimeline ? document.createElement('p') : null
    if (status) {
      status.className = 'govuk-body'
      status.setAttribute('role', 'status')
      status.textContent = 'Loading historic readings. This may take a moment.'
      document.getElementById(LINE_CHART_ID).before(status)
    }
    try {
      const historicData = await fetchHistoricData(stationId, isSingleTimeline)
      if (isSingleTimeline && historicData.length === 0) {
        throw new Error('No historic readings are available for this station')
      }
      historicDataRef.data = historicData
      historicDataRef.loaded = true
      historicDataRef.available = historicData.length > 0
      status?.remove()
    } catch (error) {
      console.error('Failed to fetch historic data for initial render:', error)
      if (status) {
        status.setAttribute('role', 'alert')
        status.textContent = 'Historic readings could not be loaded. Only currently available readings are shown. Reload the page to try again.'
      }
    }
  }

  const renderChart = createRenderChart(realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef)

  renderChart()
  updateFilterButtonStates(historicDataRef)

  // Attach listeners after initial render and any eager-fetch completes to avoid render race conditions
  setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart)
  setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart)
  setupDownloadCsvReverseTabHandler()
}

if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    initializeChartApp().catch(error => {
      console.error('Failed to initialize chart application:', error)
    })
  }
}
