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
  TIME_FILTER_LINK_SELECTOR
} from './application-constants.js'
import {
  getDefaultActiveThresholdId,
  getThresholdMetrics,
  buildThresholds,
  updateThresholdControls,
  setupThresholdControlHandlers,
  applyThresholdDefaultsForFilter
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
  return (renderOptions = {}) => {
    const realtimeObserved = realtimeTelemetry?.observed || []
    const mergedObserved = mergeData(historicDataRef.data, realtimeObserved) || []
    const chartStyle = globalThis.flood?.model?.chartStyle

    if (chartStyle === CHART_STYLE_C) {
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

      if (renderOptions.thresholdsOnly === true) {
        const chartContainer = document.getElementById(LINE_CHART_ID)
        if (typeof chartContainer?.updateThresholds === 'function') {
          chartContainer.updateThresholds({
            thresholds,
            activeThresholdId: activeThresholdRef.value,
            onThresholdDismiss,
            onThresholdActivate: (thresholdId) => {
              activeThresholdRef.value = thresholdId
            }
          })
          return
        }
      }

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

    renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, chartStyle)
  }
}

function setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart, thresholdState, activeThresholdRef) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    link.addEventListener('click', async function (event) {
      event.preventDefault()

      if (this.getAttribute(ARIA_DISABLED) === 'true') {
        return
      }

      const nextFilter = this.dataset.filter

      if (nextFilter !== DEFAULT_FILTER && !historicDataRef.loaded) {
        setTimeFilterLinksTemporarilyDisabled(true)

        try {
          const historicData = await fetchHistoricData(stationId)
          historicDataRef.data = historicData
          historicDataRef.loaded = true
          historicDataRef.available = historicData.length > 0
        } catch (error) {
          console.error('Failed to fetch historic data:', error)
          setTimeFilterLinksTemporarilyDisabled(false)
          updateFilterButtonStates(historicDataRef)
          return
        }

        setTimeFilterLinksTemporarilyDisabled(false)
        updateFilterButtonStates(historicDataRef)
      }

      currentFilter.value = nextFilter

      if (globalThis.flood?.model?.chartStyle === CHART_STYLE_C) {
        applyThresholdDefaultsForFilter(nextFilter, thresholdState, activeThresholdRef)
      }

      renderChart()
    })
  })
}

function initializeChartApp() {
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

  const renderChart = createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef)

  renderChart()
  updateFilterButtonStates(historicDataRef)

  setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart, thresholdState, activeThresholdRef)
  setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart)
  setupDownloadCsvReverseTabHandler()
}

if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  setupChartStyleRadioKeyboardSupport()

  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    initializeChartApp()
  }
}
