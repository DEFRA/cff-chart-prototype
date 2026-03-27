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
    ; (async () => {
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
          // Mark all filters except 5d as disabled if no historic data
          if (filter !== DEFAULT_FILTER) {
            if (!hasHistoricData) {
              // Use aria-disabled and class instead of disabled attribute
              // so click events still fire for the prompt
              btn.setAttribute('aria-disabled', 'true')
              btn.classList.add('govuk-button--disabled')
              btn.style.pointerEvents = 'auto' // Ensure clicks work
            } else {
              btn.removeAttribute('aria-disabled')
              btn.classList.remove('govuk-button--disabled')
              btn.style.pointerEvents = ''
            }
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

        // Get chart style
        const chartStyle = window.flood.model.chartStyle

        // Handle Chart Style C (zoom/pan) differently
        if (chartStyle === 'styleC') {
          // For Style C, use all available data without filtering
          const finalObserved = mergedObserved

          // Create telemetry object with all data
          const fullTelemetry = {
            ...realtimeTelemetry,
            observed: finalObserved
          }

          // Update the time range label
          const timeRangeLabel = document.getElementById('chart-time-range')
          const dataPointsLabel = document.getElementById('chart-data-points')
          if (timeRangeLabel) {
            const dataPoints = finalObserved.length
            const hasHistoric = historicData && historicData.length > 0
            timeRangeLabel.textContent = ''
            if (dataPointsLabel && hasHistoric) {
              dataPointsLabel.textContent = ` (${dataPoints.toLocaleString()} total points)`
            }
          }

          // Render the chart with zoom enabled
          const chart = lineChart('line-chart', stationId, fullTelemetry, {
            timeRange: '5y',
            enableZoom: true
          })

          // Initialize chart info display
          if (chart && chart.updateChartInfo) {
            // Initial display shows downsampled points (around 500)
            setTimeout(() => {
              const container = document.getElementById('line-chart')
              if (container && container.updateChartInfo) {
                // Get the actual displayed points from the initial render
                container.updateChartInfo(500, null) // Will be updated on first zoom event
              }
            }, 100)
          }

          // Setup zoom control buttons
          const container = document.getElementById('line-chart')
          const zoomInBtn = document.getElementById('zoom-in-btn')
          const zoomOutBtn = document.getElementById('zoom-out-btn')
          const zoomResetBtn = document.getElementById('zoom-reset-btn')

          if (zoomInBtn && container && container.zoomIn) {
            zoomInBtn.onclick = () => container.zoomIn()
          }
          if (zoomOutBtn && container && container.zoomOut) {
            zoomOutBtn.onclick = () => container.zoomOut()
          }
          if (zoomResetBtn && container && container.resetZoom) {
            zoomResetBtn.onclick = () => container.resetZoom()
          }

          return
        }

        // For Style A and B, use existing filter logic
        // Apply time filter
        const filteredObserved = filterDataByTimeRange(mergedObserved, currentFilter)

        // Apply downsampling for chart style B to improve performance
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

      // Initialize async - load historic data for this station
      try {
        historicData = await loadHistoricData(stationId) || []
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
        button.addEventListener('click', function (e) {
          // Check if button is marked as disabled (no historic data)
          if (this.getAttribute('aria-disabled') === 'true') {
            e.preventDefault()
            alert('To view historic data beyond 5 days, please upload a historic data CSV file using the "Upload Historic Data CSV" button below.')
            return
          }

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

        // Save to IndexedDB for this station (replaces any previous upload for this station)
        historicData = parsedData
        const saved = await saveHistoricData(stationId, parsedData)

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
    })()
  }
}

