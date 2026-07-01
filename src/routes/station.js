import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { getStation, getStationReadings, formatStationData, formatTelemetryData } from '../lib/flood-service.js'
import { config } from '../config/config.js'

const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500

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

async function hasHistoricData(stationId) {
  try {
    const historicPath = path.resolve(config.get('root'), 'data', 'historic', `${stationId}.json`)
    await access(historicPath)
    return true
  } catch {
    return false
  }
}

export const station = {
  method: 'GET',
  path: '/station',
  handler: async function (request, h) {
    const { stationId = '3089', chartStyle = 'styleA' } = request.query

    try {
      request.logger.info(`Fetching station data for ID: ${stationId}, style: ${chartStyle}`)

      // Fetch only station + latest telemetry for initial chart render
      const [stationData, readings] = await Promise.all([
        getStation(stationId),
        getStationReadings(stationId)
      ])

      if (!stationData) {
        request.logger.warn(`Station not found or API call failed for ID: ${stationId}`)
        return h.view('error.njk', {
          error: 'Station not found',
          message: `Could not find station with ID: ${stationId}`
        }).code(404)
      }

      const historicDataAvailable = await hasHistoricData(stationId)

      // Format data for the template
      const station = formatStationData(stationData, readings)
      const telemetry = formatTelemetryData(readings)

      return h.view('station.njk', {
        station,
        telemetry,
        chartStyle,
        historicData: [],
        historicDataAvailable
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

export const stationHistoricData = {
  method: 'GET',
  path: '/station/historic-data',
  handler: async function (request, h) {
    const { stationId = '3089' } = request.query

    try {
      const historicData = await loadHistoricData(stationId)
      request.logger.info(`Loaded ${historicData.length} historic readings for station ${stationId}`)

      return h.response({
        stationId,
        readings: historicData
      }).code(HTTP_OK)
    } catch (error) {
      request.logger.error('Error loading historic station data:', error)

      return h.response({
        stationId,
        readings: [],
        error: 'Failed to load historic data'
      }).code(HTTP_INTERNAL_SERVER_ERROR)
    }
  }
}
