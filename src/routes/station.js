import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { getStation, getStationReadings, formatStationData, formatTelemetryData } from '../lib/flood-service.js'
import { config } from '../config/config.js'
import { lookupStationByRLOI, fetchHistoricReadings } from '../lib/hydrology-service.js'

const HTTP_OK = 200
const HTTP_INTERNAL_SERVER_ERROR = 500
const HISTORIC_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const historicRefreshes = new Map()

async function loadHistoricData(stationId) {
  try {
    const historicPath = path.resolve(config.get('root'), 'data', 'historic', `${stationId}.json`)
    const raw = await readFile(historicPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.readings)) {
      throw new Error(`Invalid historic readings for station ${stationId}`)
    }
    return parsed
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function getHistoricReadings(stationId, refresh, logger) {
  const cached = await loadHistoricData(stationId)
  const fetchedAt = new Date(cached?.meta?.fetchedAt).getTime()
  const isFresh = cached?.readings.length > 0 &&
    Number.isFinite(fetchedAt) && Date.now() - fetchedAt < HISTORIC_CACHE_MAX_AGE_MS

  if (!refresh || isFresh) {
    return cached?.readings || []
  }

  if (!historicRefreshes.has(stationId)) {
    const pending = (async () => {
      logger.info(`Refreshing historic data for station ${stationId}`)
      const stationInfo = await lookupStationByRLOI(stationId)
      if (!stationInfo) {
        throw new Error(`No 15-minute historic level measure found for station ${stationId}`)
      }
      const result = await fetchHistoricReadings(stationId, stationInfo)
      return result.readings
    })()
    historicRefreshes.set(stationId, pending)
  }

  const pending = historicRefreshes.get(stationId)
  try {
    return await pending
  } finally {
    if (historicRefreshes.get(stationId) === pending) {
      historicRefreshes.delete(stationId)
    }
  }
}

async function hasHistoricData(stationId) {
  try {
    const historicPath = path.resolve(config.get('root'), 'data', 'historic', `${stationId}.json`)
    await access(historicPath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function renderStation(request, h, chartStyle) {
    const { stationId = '3089' } = request.query

    try {
      request.logger.info(`Fetching station data for ID: ${stationId}`)

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
        historicData: [],
        historicDataAvailable,
        chartStyle
      })
    } catch (error) {
      request.logger.error('Error loading station data:', error)

      return h.view('error.njk', {
        error: 'Failed to load station data',
        message: error.message
      }).code(500)
    }
}

export const station = {
  method: 'GET',
  path: '/station',
  handler: (request, h) => renderStation(request, h, 'styleA')
}

export const stationSingleChart = {
  method: 'GET',
  path: '/station/single-chart',
  handler: (request, h) => renderStation(request, h, 'styleB')
}

export const stationHistoricData = {
  method: 'GET',
  path: '/station/historic-data',
  handler: async function (request, h) {
    const { stationId = '3089' } = request.query

    try {
      const historicData = await getHistoricReadings(stationId, request.query.refresh === 'true', request.logger)
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
