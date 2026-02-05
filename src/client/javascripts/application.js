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

// Initialize chart with historic data support
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.getElementById('line-chart') && window.flood && window.flood.model) {
    const stationId = window.flood.model.id
    const realtimeTelemetry = window.flood.model.telemetry

    // Constants
    const DEFAULT_FILTER = '5d'
    const TIME_FILTER_BTN_SELECTOR = '.time-filter-btn'

    // Current filter state (default to 5 days)
    let currentFilter = DEFAULT_FILTER

    // Load any stored historic data
    let historicData = []

    /**
     * Update filter button states based on historic data availability
     */
    const updateFilterButtonStates = () => {
      const hasHistoricData = historicData && historicData.length > 0
      document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(btn => {
        const filter = btn.dataset.filter
        // Disable all filters except 5d if no historic data
        if (filter !== DEFAULT_FILTER) {
          btn.disabled = !hasHistoricData
        }
      })
    }

    /**
     * Render the chart with current filter and data
     */
    const renderChart = () => {
      // Get the observed data array from telemetry
      const realtimeObserved = realtimeTelemetry?.observed || []

      // Merge historic and realtime observed data
      const mergedObserved = mergeData(historicData, realtimeObserved) || []

      // Apply time filter
      const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)

      // Apply downsampling for chart style B to improve performance
      const chartStyle = window.flood.model.chartStyle
      const finalObserved = chartStyle === 'styleB'
        ? downsampleForStyleB(filteredObserved, currentFilter)
        : filteredObserved

      // Create telemetry object with filtered observed data
      const filteredTelemetry = {
        ...realtimeTelemetry,
        observed: finalObserved
      }

      // Update the time range label
      const timeRangeLabel = document.getElementById('chart-time-range')
      if (timeRangeLabel) {
        timeRangeLabel.textContent = getTimeRangeLabel(currentFilter)
      }

      // Update active button state
      document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(btn => {
        if (btn.dataset.filter === currentFilter) {
          btn.classList.remove('govuk-button--secondary')
          btn.classList.add('govuk-button--primary')
        } else {
          btn.classList.remove('govuk-button--primary')
          btn.classList.add('govuk-button--secondary')
        }
      })

      // Render the chart with filtered telemetry and time range
      lineChart('line-chart', stationId, filteredTelemetry, { timeRange: currentFilter })
    }

    // Initialize async - load historic data
    try {
      historicData = await loadHistoricData() || []
    } catch (err) {
      console.error('Failed to load historic data:', err)
      // Continue with empty historic data
    }

    // Initial render with default filter (5 days)
    renderChart()

    // Set initial button states based on historic data availability
    updateFilterButtonStates()

    // Set up time filter button handlers
    document.querySelectorAll(TIME_FILTER_BTN_SELECTOR).forEach(button => {
      button.addEventListener('click', function () {
        currentFilter = this.dataset.filter
        renderChart()
      })
    })

    /**
     * Process and save uploaded historic data
     */
    const processUploadedData = async (parsedData) => {
      if (parsedData.length === 0) {
        alert('No valid data found in the CSV file (or all data is older than 5 years)')
        return false
      }

      // Save to IndexedDB (replaces any previous upload)
      historicData = parsedData
      const saved = await saveHistoricData(parsedData)

      if (!saved) {
        alert('Failed to upload historic data. Please try again.')
        return false
      }

      // Re-render the chart with the new data
      renderChart()

      // Enable all filter buttons now that we have historic data
      updateFilterButtonStates()

      alert(`Successfully uploaded ${parsedData.length} data points from the last 5 years`)
      return true
    }

    /**
     * Handle file upload for historic data
     */
    const handleFileUpload = async (event) => {
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
        await processUploadedData(parsedData)
      } catch (error) {
        console.error('Error processing CSV file:', error)
        alert(`Error processing CSV file: ${error.message}`)
      } finally {
        // Reset file input
        event.target.value = ''
      }
    }

    // Set up upload button handler
    const uploadBtn = document.getElementById('upload-historic-btn')
    const fileInput = document.getElementById('historic-data-upload')

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.click()
      })

      fileInput.addEventListener('change', handleFileUpload)
    }
  }
}

