import { initAll } from 'govuk-frontend'
import './utils.js'
import './toggletip.js'
import { lineChart } from './line-chart.js'
import {
  mergeData,
  filterDataByTimeRange,
  getTimeRangeLabel,
  downsampleForStyleB
} from './historic-data.js'

initAll()

// Constants
const LINE_CHART_ID = 'line-chart'
const DEFAULT_FILTER = '5d'
const TIME_FILTER_LINK_SELECTOR = '.time-filter-link'
const TIME_FILTER_LINK_DISABLED_CLASS = 'time-filter-link--disabled'
const ARIA_DISABLED = 'aria-disabled'
const ARIA_CURRENT = 'aria-current'
const CHART_STYLE_C = 'styleC'
const CHART_STYLE_B = 'styleB'
const HISTORIC_DATA_ENDPOINT = '/station/historic-data'
const DOWNLOAD_CSV_BTN_ID = 'download-csv-btn'
const DEFAULT_CURRENT_LEVEL = 0.28
const DEFAULT_HIGHEST_LEVEL = 0.64
const DEFAULT_TOP_NORMAL_LEVEL = 0.5
const THRESHOLD_CURRENT_LEVEL_ID = 'current-level'
const THRESHOLD_HIGHEST_LEVEL_ID = 'highest-level'
const THRESHOLD_TOP_NORMAL_ID = 'top-normal'

const THRESHOLD_CONTROL_CONFIG = {
  [THRESHOLD_CURRENT_LEVEL_ID]: {
    inputId: 'threshold-current-level',
    labelId: 'threshold-current-level-label'
  },
  [THRESHOLD_HIGHEST_LEVEL_ID]: {
    inputId: 'threshold-highest-level',
    labelId: 'threshold-highest-level-label'
  },
  [THRESHOLD_TOP_NORMAL_ID]: {
    inputId: 'threshold-top-normal',
    labelId: 'threshold-top-normal-label'
  }
}

function formatMetres(value, decimals = 2) {
  return `${Number(value).toFixed(decimals)}m`
}

function getDefaultActiveThresholdId(thresholdState) {
  if (thresholdState[THRESHOLD_TOP_NORMAL_ID]) {
    return THRESHOLD_TOP_NORMAL_ID
  }

  if (thresholdState[THRESHOLD_HIGHEST_LEVEL_ID]) {
    return THRESHOLD_HIGHEST_LEVEL_ID
  }

  if (thresholdState[THRESHOLD_CURRENT_LEVEL_ID]) {
    return THRESHOLD_CURRENT_LEVEL_ID
  }

  return null
}

function getThresholdMetrics(observed = []) {
  const latestValue = observed.length > 0
    ? Number(observed[observed.length - 1].value)
    : DEFAULT_CURRENT_LEVEL

  const highestValue = observed.length > 0
    ? observed.reduce((max, point) => Math.max(max, Number(point.value)), Number.NEGATIVE_INFINITY)
    : DEFAULT_HIGHEST_LEVEL

  const typicalRangeHigh = globalThis.flood?.model?.typicalRangeHigh

  return {
    currentLevel: Number.isFinite(latestValue) ? latestValue : DEFAULT_CURRENT_LEVEL,
    highestLevel: Number.isFinite(highestValue) ? highestValue : DEFAULT_HIGHEST_LEVEL,
    topNormal: (typicalRangeHigh != null && Number.isFinite(Number(typicalRangeHigh))) ? Number(typicalRangeHigh) : DEFAULT_TOP_NORMAL_LEVEL
  }
}

function buildThresholds(metrics, thresholdState) {
  return [
    {
      id: THRESHOLD_CURRENT_LEVEL_ID,
      label: `current level (${formatMetres(metrics.currentLevel)})`,
      shortLabel: `${formatMetres(metrics.currentLevel)} Current level`,
      value: metrics.currentLevel,
      enabled: thresholdState[THRESHOLD_CURRENT_LEVEL_ID],
      showLabel: thresholdState[THRESHOLD_CURRENT_LEVEL_ID],
      dismissible: false
    },
    {
      id: THRESHOLD_HIGHEST_LEVEL_ID,
      label: `highest level (${formatMetres(metrics.highestLevel)})`,
      shortLabel: `${formatMetres(metrics.highestLevel)} Highest level`,
      value: metrics.highestLevel,
      enabled: thresholdState[THRESHOLD_HIGHEST_LEVEL_ID],
      showLabel: thresholdState[THRESHOLD_HIGHEST_LEVEL_ID],
      dismissible: false
    },
    {
      id: THRESHOLD_TOP_NORMAL_ID,
      label: `top of normal range (${formatMetres(metrics.topNormal)})`,
      shortLabel: `${formatMetres(metrics.topNormal)} Top of normal range`,
      value: metrics.topNormal,
      enabled: thresholdState[THRESHOLD_TOP_NORMAL_ID],
      showLabel: thresholdState[THRESHOLD_TOP_NORMAL_ID],
      dismissible: true
    }
  ]
}

function updateThresholdControls(metrics, thresholdState) {
  const currentLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_CURRENT_LEVEL_ID].labelId)
  const highestLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_HIGHEST_LEVEL_ID].labelId)
  const topNormalLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_TOP_NORMAL_ID].labelId)

  if (currentLabel) {
    currentLabel.textContent = `Show current level (${formatMetres(metrics.currentLevel)})`
  }

  if (highestLabel) {
    highestLabel.textContent = `Show highest level recorded at this measuring station (${formatMetres(metrics.highestLevel)})`
  }

  if (topNormalLabel) {
    topNormalLabel.textContent = `Show top of normal range (${formatMetres(metrics.topNormal)}). Low-lying land flooding possible above this level`
  }

  for (const thresholdId of Object.keys(THRESHOLD_CONTROL_CONFIG)) {
    const checkbox = document.getElementById(THRESHOLD_CONTROL_CONFIG[thresholdId].inputId)
    if (checkbox) {
      checkbox.checked = !!thresholdState[thresholdId]
    }
  }
}

function setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart) {
  for (const thresholdId of Object.keys(THRESHOLD_CONTROL_CONFIG)) {
    const checkbox = document.getElementById(THRESHOLD_CONTROL_CONFIG[thresholdId].inputId)

    if (!checkbox || checkbox.dataset.listenersBound === 'true') {
      continue
    }

    checkbox.dataset.listenersBound = 'true'

    checkbox.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      this.click()
    })

    checkbox.addEventListener('change', function () {
      thresholdState[thresholdId] = this.checked

      if (this.checked) {
        activeThresholdRef.value = thresholdId
      } else if (activeThresholdRef.value === thresholdId) {
        activeThresholdRef.value = getDefaultActiveThresholdId(thresholdState)
      } else {
        // Unchecked but not the active threshold, no state change needed
      }

      renderChart()
    })
  }
}

function setupDownloadCsvReverseTabHandler() {
  const downloadBtn = document.getElementById(DOWNLOAD_CSV_BTN_ID)

  if (!downloadBtn || downloadBtn.dataset.reverseTabBound === 'true') {
    return
  }

  downloadBtn.dataset.reverseTabBound = 'true'

  downloadBtn.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || !event.shiftKey) {
      return
    }

    const activePoint = document.querySelector(`#${LINE_CHART_ID} [data-point-focusable][tabindex="0"]`)
    const fallbackPoint = document.querySelector(`#${LINE_CHART_ID} [data-point-focusable]`)
    const pointTarget = activePoint || fallbackPoint

    if (!pointTarget) {
      return
    }

    event.preventDefault()
    const significantRow = document.querySelector(`#${LINE_CHART_ID} .significant [role="row"]`)
    significantRow?.classList.add('significant--visible')
    pointTarget.focus()
  })
}

/**
 * Show or hide the download CSV link based on the current time filter
 * Only show for 5 day range, hide for 6 month, 1 year, and 3 year
 */
function updateDownloadCsvState(currentFilter) {
  const downloadBtn = document.getElementById(DOWNLOAD_CSV_BTN_ID)

  if (!downloadBtn) {
    return
  }

  if (currentFilter === DEFAULT_FILTER) {
    downloadBtn.style.display = ''
  } else {
    downloadBtn.style.display = 'none'
  }
}

/**
 * Update filter link states based on historic data availability
 */
function updateFilterButtonStates() {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    // All ranges are now always selectable and trigger lazy historic loading when needed.
    link.removeAttribute(ARIA_DISABLED)
    link.classList.remove(TIME_FILTER_LINK_DISABLED_CLASS)
    link.removeAttribute('tabindex')
  })
}

function setTimeFilterLinksTemporarilyDisabled(isDisabled) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    if (isDisabled) {
      link.dataset.tempDisabled = 'true'
      link.setAttribute(ARIA_DISABLED, 'true')
      link.classList.add(TIME_FILTER_LINK_DISABLED_CLASS)
      link.setAttribute('tabindex', '-1')
      return
    }

    if (link.dataset.tempDisabled === 'true') {
      delete link.dataset.tempDisabled
      link.removeAttribute(ARIA_DISABLED)
      link.classList.remove(TIME_FILTER_LINK_DISABLED_CLASS)
      link.removeAttribute('tabindex')
    }
  })
}

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

function updateZoomControlsVisibility(currentFilter) {
  const controlsRow = document.querySelector('.defra-line-chart__control-row')

  if (!controlsRow) {
    return
  }

  const isFiveDayRange = currentFilter === DEFAULT_FILTER
  controlsRow.style.display = isFiveDayRange ? 'none' : ''
}

/**
 * Update time range display labels
 */
function updateTimeRangeLabel(filter) {
  const timeRangeLabel = document.getElementById('chart-time-range')

  if (!timeRangeLabel) {
    return
  }

  timeRangeLabel.textContent = getTimeRangeLabel(filter)
}

/**
 * Update active link state
 */
function updateActiveButtonState(currentFilter) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    if (link.dataset.filter === currentFilter) {
      link.classList.add('time-filter-link--active')
      link.setAttribute(ARIA_CURRENT, 'page')
    } else {
      link.classList.remove('time-filter-link--active')
      link.removeAttribute(ARIA_CURRENT)
    }
  })
}

/**
 * Setup zoom control buttons for Chart Style C
 */
function setupZoomControls() {
  const panLeftBtn = document.getElementById('pan-left-btn')
  const panRightBtn = document.getElementById('pan-right-btn')
  const zoomInBtn = document.getElementById('zoom-in-btn')
  const zoomOutBtn = document.getElementById('zoom-out-btn')
  const zoomResetBtn = document.getElementById('zoom-reset-btn')
  const chartContainer = document.getElementById(LINE_CHART_ID)

  const updateZoomButtonStates = (scale = 1) => {
    if (!zoomInBtn || !zoomOutBtn || !zoomResetBtn || !panLeftBtn || !panRightBtn) {
      return
    }

    const maxZoomScale = typeof chartContainer?.getMaxZoomScale === 'function'
      ? chartContainer.getMaxZoomScale()
      : 100

    panLeftBtn.disabled = scale <= 1
    panRightBtn.disabled = scale <= 1
    zoomInBtn.disabled = scale >= maxZoomScale
    zoomOutBtn.disabled = scale <= 1
    zoomResetBtn.disabled = scale <= 1
  }

  if (chartContainer) {
    chartContainer.updateZoomControls = updateZoomButtonStates
  }

  updateZoomButtonStates(1)

  if (panLeftBtn) {
    panLeftBtn.onclick = () => {
      if (typeof chartContainer?.panLeft === 'function') {
        chartContainer.panLeft()
      }
    }
  }

  if (panRightBtn) {
    panRightBtn.onclick = () => {
      if (typeof chartContainer?.panRight === 'function') {
        chartContainer.panRight()
      }
    }
  }

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      if (typeof chartContainer?.zoomIn === 'function') {
        chartContainer.zoomIn()
      }
    }
  }
  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      if (typeof chartContainer?.zoomOut === 'function') {
        chartContainer.zoomOut()
      }
    }
  }
  if (zoomResetBtn) {
    zoomResetBtn.onclick = () => {
      if (typeof chartContainer?.resetZoom === 'function') {
        chartContainer.resetZoom()
      }
    }
  }
}


/**
 * Render chart for Style C (zoom/pan)
 */
function renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, currentFilter, thresholds, onThresholdDismiss, activeThresholdRef) {
  const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)

  const fullTelemetry = {
    ...realtimeTelemetry,
    observed: filteredObserved
  }

  updateTimeRangeLabel(currentFilter)
  updateActiveButtonState(currentFilter)
  updateDownloadCsvState(currentFilter)

  lineChart(LINE_CHART_ID, stationId, fullTelemetry, {
    timeRange: currentFilter,
    enableZoom: currentFilter !== DEFAULT_FILTER,
    thresholds,
    activeThresholdId: activeThresholdRef.value,
    onThresholdDismiss,
    onThresholdActivate: (thresholdId) => {
      activeThresholdRef.value = thresholdId
    }
  })

  setupZoomControls()
  updateZoomControlsVisibility(currentFilter)
}

/**
 * Render chart for Style A or B (filtered)
 */
function renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter, chartStyle) {
  // Apply time filter
  const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)

  // Apply downsampling for chart style B to improve performance
  const processedObserved = chartStyle === CHART_STYLE_B
    ? downsampleForStyleB(filteredObserved, currentFilter)
    : filteredObserved

  // Create telemetry object with filtered observed data
  const filteredTelemetry = {
    ...realtimeTelemetry,
    observed: processedObserved
  }

  updateTimeRangeLabel(currentFilter)
  updateActiveButtonState(currentFilter)
  updateDownloadCsvState(currentFilter)

  // Render the chart with filtered telemetry and time range
  lineChart(LINE_CHART_ID, stationId, filteredTelemetry, { timeRange: currentFilter })
}

/**
 * Render the chart with current filter and data
 */
function createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef) {
  return () => {
    // Get the observed data array from telemetry
    const realtimeObserved = realtimeTelemetry?.observed || []

    // Merge historic and realtime observed data
    const mergedObserved = mergeData(historicDataRef.data, realtimeObserved) || []

    // Get chart style
    const chartStyle = globalThis.flood?.model?.chartStyle

    // Handle Chart Style C (zoom/pan) differently
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
      renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, thresholds, onThresholdDismiss, activeThresholdRef)
      return
    }

    // For Style A and B, use existing filter logic
    renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, chartStyle)
  }
}

/**
 * Setup time filter link handlers
 */
function setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    link.addEventListener('click', async function (e) {
      e.preventDefault()

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
        } catch (error) {
          console.error('Failed to fetch historic data:', error)
          setTimeFilterLinksTemporarilyDisabled(false)
          return
        }

        setTimeFilterLinksTemporarilyDisabled(false)
      }

      currentFilter.value = nextFilter
      renderChart()
    })
  })
}


/**
 * Initialize chart application
 */
function initializeChartApp() {
  const stationId = globalThis.flood?.model?.id
  const realtimeTelemetry = globalThis.flood?.model?.telemetry

  if (!stationId || !realtimeTelemetry) {
    console.warn('Missing station data')
    return
  }

  // Current filter state (using object to allow mutation in closure)
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
    loaded: initialHistoricData.length > 0
  }

  // Create render function
  const renderChart = createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter, thresholdState, activeThresholdRef)

  // Initial render with default filter (5 days)
  renderChart()

  // Set initial button states based on historic data availability
  updateFilterButtonStates()

  // Setup event handlers
  setupTimeFilterHandlers(stationId, currentFilter, historicDataRef, renderChart)
  setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart)
  setupDownloadCsvReverseTabHandler()
}

// Initialize chart with historic data support
if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    initializeChartApp()
  }
}

