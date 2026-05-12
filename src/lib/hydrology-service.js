import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { proxyFetch } from './flood-service.js'
import { config } from '../config/config.js'

const HYDROLOGY_BASE_URL = config.get('api.hydrology.baseUrl')
const THREE_YEARS = 3
const READINGS_LIMIT = 200000
const FIFTEEN_MIN_PERIOD = 900

export async function lookupStationByRLOI(rloiId) {
  const url = `${HYDROLOGY_BASE_URL}/id/stations?RLOIid=${rloiId}`
  const response = await proxyFetch(url)

  if (!response.ok) {
    throw new Error(`Hydrology API returned ${response.status}`)
  }

  const data = await response.json()
  const stations = data.items || []

  if (stations.length === 0) {
    return null
  }

  const station = stations[0]
  const guid = station.notation || station.stationGuid

  const measuresUrl = `${HYDROLOGY_BASE_URL}/id/stations/${guid}/measures.json`
  const measuresResponse = await proxyFetch(measuresUrl)

  if (!measuresResponse.ok) {
    throw new Error(`Failed to fetch measures: ${measuresResponse.status}`)
  }

  const measuresData = await measuresResponse.json()
  const measures = measuresData.items || []

  const levelMeasure = measures.find(m => m.parameter === 'level' && m.period === FIFTEEN_MIN_PERIOD)

  if (!levelMeasure) {
    return null
  }

  return {
    guid,
    name: station.label || 'Unknown',
    measureId: levelMeasure.notation
  }
}

function downsampleToHourly(readings) {
  const hourlyMap = new Map()

  for (const reading of readings) {
    const date = new Date(reading.dateTime)
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:00:00`

    if (!hourlyMap.has(hourKey)) {
      hourlyMap.set(hourKey, { dateTime: reading.dateTime, value: reading.value })
    }
  }

  return Array.from(hourlyMap.values())
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
}

export async function fetchHistoricReadings(rloiId, stationInfo) {
  const { measureId, name, guid } = stationInfo

  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - THREE_YEARS)

  const startDate = start.toISOString().split('T')[0]
  const endDate = end.toISOString().split('T')[0]

  const url = `${HYDROLOGY_BASE_URL}/id/measures/${measureId}/readings.json?mineq-date=${startDate}&maxeq-date=${endDate}&_limit=${READINGS_LIMIT}`
  const response = await proxyFetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch readings: ${response.status}`)
  }

  const data = await response.json()
  const rawReadings = data.items || []
  const hourlyReadings = downsampleToHourly(rawReadings)

  const result = {
    meta: {
      rloiId,
      hydrologyStationId: guid,
      measureId,
      name,
      fetchedAt: new Date().toISOString(),
      startDate,
      endDate,
      rawPointCount: rawReadings.length,
      hourlyPointCount: hourlyReadings.length
    },
    readings: hourlyReadings
  }

  const outputDir = path.resolve(config.get('root'), 'data', 'historic')
  await mkdir(outputDir, { recursive: true })
  const outputPath = path.resolve(outputDir, `${rloiId}.json`)
  await writeFile(outputPath, JSON.stringify(result))

  return result
}
