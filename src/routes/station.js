import { getStation, getStationReadings, formatStationData, formatTelemetryData } from '../lib/flood-service.js'

export const station = {
  method: 'GET',
  path: '/station',
  handler: async function (request, h) {
    const { dataType, stationType, stationId = '8085' } = request.query

    try {
      // Fetch real data from Environment Agency API
      const [stationData, readings] = await Promise.all([
        getStation(stationId),
        getStationReadings(stationId)
      ])

      if (!stationData) {
        return h.view('error.njk', {
          error: 'Station not found',
          message: `Could not find station with ID: ${stationId}`
        }).code(404)
      }

      // Format data for the template
      const station = formatStationData(stationData, readings)
      const telemetry = formatTelemetryData(readings)

      return h.view('station.njk', {
        station,
        telemetry,
        dataType: dataType || 'existing',
        stationType: stationType || station.type
      })
    } catch (error) {
      request.logger.error('Error loading station data:', error)

      return h.view('error.njk', {
        error: 'Failed to load station data',
        message: error.message
      }).code(500)
    }
  }
}
