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
const ARIA_DISABLED = 'aria-disabled'
const ARIA_CURRENT = 'aria-current'
const CHART_STYLE_C = 'styleC'
const CHART_STYLE_B = 'styleB'

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

      if (this.getAttribute(ARIA_DISABLED) === 'true') {
        return
      }

      currentFilter.value = this.dataset.filter
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

  const historicDataRef = { data: globalThis.flood?.model?.historicData || [] }

  // Create render function
  const renderChart = createRenderChart(stationId, realtimeTelemetry, historicDataRef, currentFilter)

  // Initial render with default filter (5 days)
  renderChart()

  // Set initial button states based on historic data availability
  const hasHistoricData = historicDataRef.data && historicDataRef.data.length > 0
  updateFilterButtonStates(hasHistoricData)

  // Setup event handlers
  setupTimeFilterHandlers(currentFilter, renderChart)
}

// Initialize chart with historic data support
if (typeof document !== 'undefined' && typeof globalThis !== 'undefined') {
  const chartElement = document.getElementById(LINE_CHART_ID)
  if (chartElement && globalThis.flood?.model) {
    initializeChartApp()
  }
}

