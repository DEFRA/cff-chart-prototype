import { initAll } from 'govuk-frontend'
import './utils.js'
import './toggletip.js'
import { lineChart } from './line-chart.js'

initAll()

// Initialize chart if telemetry data is available
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.getElementById('line-chart') && window.flood && window.flood.model) {
    lineChart('line-chart', window.flood.model.id, window.flood.model.telemetry)
  }
}
