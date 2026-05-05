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
const TIME_FILTER_LINK_SELECTOR = '.time-filter-link'
const ARIA_DISABLED = 'aria-disabled'
const ARIA_CURRENT = 'aria-current'
const CHART_STYLE_C = 'styleC'
const CHART_STYLE_B = 'styleB'
const INITIAL_DISPLAYED_POINTS = 500
const CHART_INFO_UPDATE_DELAY = 100

/**
 * Update filter link states based on historic data availability
 */
function updateFilterButtonStates(hasHistoricData) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    const filter = link.dataset.filter
    // Mark all filters except 5d as disabled if no historic data
    if (filter !== DEFAULT_FILTER) {
      if (hasHistoricData) {
        link.removeAttribute(ARIA_DISABLED)
        link.classList.remove('time-filter-link--disabled')
        link.removeAttribute('tabindex')
      } else {
        link.setAttribute(ARIA_DISABLED, 'true')
        link.classList.add('time-filter-link--disabled')
        link.setAttribute('tabindex', '-1')
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

    panLeftBtn.disabled = scale <= 1
    panRightBtn.disabled = scale <= 1
    zoomInBtn.disabled = scale >= 100
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
function renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, currentFilter) {
  const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)

  const fullTelemetry = {
    ...realtimeTelemetry,
    observed: filteredObserved
  }

  updateTimeRangeLabel(currentFilter)
  updateActiveButtonState(currentFilter)

  const chart = lineChart(LINE_CHART_ID, stationId, fullTelemetry, {
    timeRange: currentFilter,
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
      renderStyleCChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value)
      return
    }

    // For Style A and B, use existing filter logic
    renderFilteredChart(stationId, realtimeTelemetry, mergedObserved, currentFilter.value, chartStyle)
  }
}

/**
 * Setup time filter link handlers
 */
function setupTimeFilterHandlers(currentFilter, renderChart) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault()

      // Check if link is marked as disabled (no historic data)
      if (this.getAttribute(ARIA_DISABLED) === 'true') {
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

