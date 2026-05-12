import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getStation, getStationReadings, formatStationData, formatTelemetryData } from '../lib/flood-service.js'
import { config } from '../config/config.js'

async function loadHistoricData(stationId) {
  try {
    const historicPath = path.resolve(config.get('root'), 'data', 'historic', `${stationId}.json`)
    const raw = await readFile(historicPath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed.readings || []
  } catch {
    return []
  }
}

export const station = {
  method: 'GET',
  path: '/station',
  handler: async function (request, h) {
    const { stationId = '8085', chartStyle = 'styleA' } = request.query

    try {
      request.logger.info(`Fetching station data for ID: ${stationId}, style: ${chartStyle}`)

      // Fetch real data from Environment Agency API + load pre-fetched historic data
      const [stationData, readings, historicData] = await Promise.all([
        getStation(stationId),
        getStationReadings(stationId),
        loadHistoricData(stationId)
      ])

      if (!stationData) {
        request.logger.warn(`Station not found or API call failed for ID: ${stationId}`)
        return h.view('error.njk', {
          error: 'Station not found',
          message: `Could not find station with ID: ${stationId}`
        }).code(404)
      }

      // Format data for the template
      const station = formatStationData(stationData, readings)
      const telemetry = formatTelemetryData(readings)

      if (historicData.length > 0) {
        request.logger.info(`Loaded ${historicData.length} pre-fetched historic readings for station ${stationId}`)
      }

      return h.view('station.njk', {
        station,
        telemetry,
        chartStyle,
        historicData
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
