import { initAll } from 'govuk-frontend'
import './utils.js'
import './toggletip.js'
import { lineChart } from './line-chart.js'
import {
  parseHistoricCSV,
  saveHistoricData,
  loadHistoricData,
  mergeData,
  filterDataByTimeRange,
  getTimeRangeLabel,
  downsampleForStyleB
} from './historic-data.js'

initAll()

// Constants
const LINE_CHART_ID = 'line-chart'
const DEFAULT_FILTER = '5d'
const TIME_FILTER_BTN_SELECTOR = '.time-filter-btn'
const ARIA_DISABLED = 'aria-disabled'
const CHART_STYLE_C = 'styleC'
const CHART_STYLE_B = 'styleB'
const INITIAL_DISPLAYED_POINTS = 500
const CHART_INFO_UPDATE_DELAY = 100

/**
 * Update filter button states based on historic data availability
 */
function updateFilterButtonStates(hasHistoricData) {
  document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(btn => {
    const filter = btn.dataset.filter
    // Mark all filters except 5d as disabled if no historic data
    if (filter !== DEFAULT_FILTER) {
      if (hasHistoricData) {
        btn.removeAttribute(ARIA_DISABLED)
        btn.classList.remove('govuk-button--disabled')
        btn.style.pointerEvents = ''
      } else {
        // Use aria-disabled and class instead of disabled attribute
        // so click events still fire for the prompt
        btn.setAttribute(ARIA_DISABLED, 'true')
        btn.classList.add('govuk-button--disabled')
        btn.style.pointerEvents = 'auto' // Ensure clicks work
      }
    }
  })
}

/**
 * Update time range display labels
 */
function updateTimeRangeLabel(filter, dataPoints, hasHistoric) {
  const timeRangeLabel = document.getElementById('chart-time-range')
  const dataPointsLabel = document.getElementById('chart-data-points')

  if (!timeRangeLabel) {
    return
  }

  if (filter) {
    timeRangeLabel.textContent = getTimeRangeLabel(filter)
  } else {
    // Style C - no filter
    timeRangeLabel.textContent = ''
    if (dataPointsLabel && hasHistoric) {
      dataPointsLabel.textContent = ` (${dataPoints.toLocaleString()} total points)`
    }
  }
}

/**
 * Update active button state
 */
function updateActiveButtonState(currentFilter) {
  document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.classList.remove('govuk-button--secondary')
      btn.classList.add('govuk-button--primary')
    } else {
      btn.classList.remove('govuk-button--primary')
      btn.classList.add('govuk-button--secondary')
    }
  })
}

/**
 * Setup zoom control buttons for Chart Style C
 */
function setupZoomControls() {
  const chartContainer = document.getElementById(LINE_CHART_ID)
  const zoomInBtn = document.getElementById('zoom-in-btn')
  const zoomOutBtn = document.getElementById('zoom-out-btn')
  const zoomResetBtn = document.getElementById('zoom-reset-btn')

  if (zoomInBtn && chartContainer?.zoomIn) {
    zoomInBtn.onclick = () => chartContainer.zoomIn()
  }
  if (zoomOutBtn && chartContainer?.zoomOut) {
    zoomOutBtn.onclick = () => chartContainer.zoomOut()
  }
  if (zoomResetBtn && chartContainer?.resetZoom) {
    zoomResetBtn.onclick = () => chartContainer.resetZoom()
  }
}

/**
 * Initialize chart info display for Style C
 */
function initializeChartInfo(chart) {
  if (!chart?.updateChartInfo) {
    return
  }

  setTimeout(() => {
    const chartContainer = document.getElementById(LINE_CHART_ID)
    if (chartContainer?.updateChartInfo) {
      chartContainer.updateChartInfo(INITIAL_DISPLAYED_POINTS, null)
    }
  }, CHART_INFO_UPDATE_DELAY)
}

/**
 * Render chart for Style C (zoom/pan)
 */
function renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, historicData) {
  const fullTelemetry = {
    ...realtimeTelemetry,
    observed: mergedObserved
  }

  updateTimeRangeLabel(null, mergedObserved.length, historicData && historicData.length > 0)

  const chart = lineChart(LINE_CHART_ID, stationId, fullTelemetry, {
    timeRange: '5y',
    enableZoom: true
  })

  initializeChartInfo(chart)
  setupZoomControls()
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

  // Render the chart with filtered telemetry and time range
  lineChart(LINE_CHART_ID, stationId, filteredTelemetry, { timeRange: currentFilter })
}

/**
 * Render the chart with current filter and data
 */
function createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter) {
  return () => {
    // Get the observed data array from telemetry
    const realtimeObserved = realtimeTelemetry?.observed || []

    // Merge historic and realtime observed data
    const mergedObserved = mergeData(historicDataRef.data, realtimeObserved) || []

    // Get chart style
    const chartStyle = globalThis.flood?.model?.chartStyle

    // Handle Chart Style C (zoom/pan) differently
    if (chartStyle === CHART_STYLE_C) {
      renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, historicDataRef.data)
      return
    }

    // For Style A and B, use existing filter logic
    renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, chartStyle)
  }
}

/**
 * Setup time filter button handlers
 */
function setupTimeFilterHandlers(currentFilter, renderChart) {
  document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(button => {
    button.addEventListener('click', function (e) {
      // Check if button is marked as disabled (no historic data)
      if (this.getAttribute(ARIA_DISABLED) === 'true') {
        e.preventDefault()
        alert('To view historic data beyond 5 days, please upload a historic data CSV file using the "Upload Historic Data CSV" button below.')
        return
      }

      currentFilter.value = this.dataset.filter
      renderChart()
    })
  })
}

/**
 * Process and save uploaded historic data
 */
async function processUploadedData(parsedData, stationId, historicDataRef, renderChart) {
  if (parsedData.length === 0) {
    alert('No valid data found in the CSV file (or all data is older than 5 years)')
    return false
  }

  // Save to IndexedDB for this station (replaces any previous upload for this station)
  historicDataRef.data = parsedData
  const saved = await saveHistoricData(stationId, parsedData)

  if (!saved) {
    alert('Failed to upload historic data. Please try again.')
    return false
  }

  // Re-render the chart with the new data
  renderChart()

  // Enable all filter buttons now that we have historic data
  updateFilterButtonStates(true)

  alert(`Successfully uploaded ${parsedData.length} data points from the last 5 years`)
  return true
}

/**
 * Handle file upload for historic data
 */
async function handleFileUpload(event, stationId, historicDataRef, renderChart) {
  const file = event.target.files[0]
  if (!file) {
    return
  }

  try {
    // Read the file
    const text = await file.text()

    // Parse the CSV
    const parsedData = parseHistoricCSV(text)

    // Process and save the data
    await processUploadedData(parsedData, stationId, historicDataRef, renderChart)
  } catch (error) {
    console.error('Error processing CSV file:', error)
    alert(`Error processing CSV file: ${error.message}`)
  } finally {
    // Reset file input
    event.target.value = ''
  }
}

/**
 * Setup upload button handler
 */
function setupUploadHandler(stationId, historicDataRef, renderChart) {
  const uploadBtn = document.getElementById('upload-historic-btn')
  const fileInput = document.getElementById('historic-data-upload')

  if (!uploadBtn || !fileInput) {
    return
  }

  uploadBtn.addEventListener('click', () => {
    fileInput.click()
  })

  fileInput.addEventListener('change', (event) =>
    handleFileUpload(event, stationId, historicDataRef, renderChart)
  )
}

/**
 * Initialize chart application
 */
async function initializeChartApp() {
  const stationId = globalThis.flood?.model?.id
  const realtimeTelemetry = globalThis.flood?.model?.telemetry

  if (!stationId || !realtimeTelemetry) {
    console.warn('Missing station data')
    return
  }

  // Current filter state (using object to allow mutation in closure)
  const currentFilter = { value: DEFAULT_FILTER }

  // Load any stored historic data
  const historicDataRef = { data: [] }

  try {
    historicDataRef.data = await loadHistoricData(stationId) || []
  } catch (err) {
    console.error('Failed to load historic data:', err)
    // Continue with empty historic data
  }

  // Create render function
  const renderChart = createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter)

  // Initial render with default filter (5 days)
  renderChart()

  // Set initial button states based on historic data availability
  const hasHistoricData = historicDataRef.data && historicDataRef.data.length > 0
  updateFilterButtonStates(hasHistoricData)

  // Setup event handlers
  setupTimeFilterHandlers(currentFilter, renderChart)
  setupUploadHandler(stationId, historicDataRef, renderChart)
}

// Initialize chart with historic data support
if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    await initializeChartApp()
  }
}

