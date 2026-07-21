import { initAll } from 'govuk-frontend'
import './utils.js'
import './toggletip.js'
import { lineChart } from './line-chart.js'
import {
  mergeData,
  filterDataByTimeRange,
  downsampleForStyleB
} from './historic-data.js'
import {
  LINE_CHART_ID,
  DEFAULT_FILTER,
  ARIA_DISABLED,
  CHART_STYLE_B,
  CHART_STYLE_C,
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
  setupChartStyleRadioKeyboardSupport,
  updateDownloadCsvState,
  updateFilterButtonStates,
  setTimeFilterLinksTemporarilyDisabled,
  updateZoomControlsVisibility,
  updateTimeRangeLabel,
  updateActiveButtonState,
  setupZoomControls
} from './application-ui.js'

initAll()

async function fetchHistoricData(stationId) {
  const response = await fetch(`${HISTORIC_DATA_ENDPOINT}?stationId=${encodeURIComponent(stationId)}`, {
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

function renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, currentFilter, thresholdContext, renderOptions = {}) {
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

  const chartContainer = lineChart(LINE_CHART_ID, stationId, fullTelemetry, {
    timeRange: currentFilter,
    enableZoom: currentFilter !== DEFAULT_FILTER,
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

function renderStyleCChartFlow(stationId, realtimeTelemetry, mergedObserved, currentFilter, thresholdState, activeThresholdRef, renderOptions) {
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
    renderStyleCChart(
      stationId,
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

function renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter, chartStyle) {
  const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)
  const processedObserved = chartStyle === CHART_STYLE_B
    ? downsampleForStyleB(filteredObserved, currentFilter)
    : filteredObserved

  const filteredTelemetry = {
    ...realtimeTelemetry,
    observed: processedObserved
  }

  updateTimeRangeLabel(currentFilter)
  updateActiveButtonState(currentFilter)
  updateDownloadCsvState(currentFilter)

  lineChart(LINE_CHART_ID, stationId, filteredTelemetry, { timeRange: currentFilter })
}

function createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef) {
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
      
      const chartStyle = globalThis.flood?.model?.chartStyle

      if (chartStyle === CHART_STYLE_C) {
        renderStyleCChartFlow(stationId, realtimeTelemetry, mergedObserved, currentFilter, thresholdState, activeThresholdRef, renderOptions)
        return
      }

      renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, chartStyle)
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

  const currentFilter = { value: DEFAULT_FILTER }
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

  // If realtime data is empty but historic data is available, eagerly fetch it
  // so the initial 5-day chart can render using the most recent historic readings
  const hasNoRealtimeData = !realtimeTelemetry?.observed?.length
  if (hasNoRealtimeData && historicDataRef.available && !historicDataRef.loaded) {
    try {
      const historicData = await fetchHistoricData(stationId)
      historicDataRef.data = historicData
      historicDataRef.loaded = true
      historicDataRef.available = historicData.length > 0
    } catch (error) {
      console.error('Failed to fetch historic data for initial render:', error)
    }
  }

  const renderChart = createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef)

  renderChart()
  updateFilterButtonStates(historicDataRef)

  // Attach listeners after initial render and any eager-fetch completes to avoid render race conditions
  setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart)
  setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart)
  setupDownloadCsvReverseTabHandler()
}

if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  setupChartStyleRadioKeyboardSupport()

  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    initializeChartApp().catch(error => {
      console.error('Failed to initialize chart application:', error)
    })
  }
}
