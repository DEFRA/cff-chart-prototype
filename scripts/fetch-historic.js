import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProxyAgent } from 'undici'
import { stationMapping } from '../src/config/station-mapping.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '..')
const outputDir = path.resolve(projectRoot, 'data', 'historic')

const HYDROLOGY_BASE_URL = process.env.API_HYDROLOGY_BASE_URL || 'https://environment.data.gov.uk/hydrology'
const HTTP_PROXY = process.env.HTTP_PROXY || null

function buildFetchOptions() {
  const options = {
    headers: {
      'User-Agent': 'cff-chart-prototype/1.0 (https://github.com/DEFRA/cff-chart-prototype)'
    }
  }

  if (HTTP_PROXY) {
    console.log(`Using proxy: ${HTTP_PROXY}`)
    options.dispatcher = new ProxyAgent({
      uri: HTTP_PROXY,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    })
  }

  return options
}

function getDateRange() {
  const end = new Date()
  const start = new Date()
  start.setFullYear(start.getFullYear() - 3)

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  }
}

function downsampleToThirtyMinutes(readings) {
  const bucketMap = new Map()

  for (const reading of readings) {
    const date = new Date(reading.dateTime)
    const minutes = date.getMinutes() < 30 ? '00' : '30'
    const bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${minutes}:00`

    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, { dateTime: reading.dateTime, value: reading.value })
    }
  }

  return Array.from(bucketMap.values())
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
}

async function fetchStationData(rloiId, stationConfig) {
  const { measureId, name } = stationConfig
  const { startDate, endDate } = getDateRange()

  const url = `${HYDROLOGY_BASE_URL}/id/measures/${measureId}/readings.json?mineq-date=${startDate}&maxeq-date=${endDate}&_limit=200000`

  console.log(`\nFetching data for station ${rloiId} (${name})`)
  console.log(`  URL: ${url}`)
  console.log(`  Date range: ${startDate} to ${endDate}`)

  const response = await fetch(url, buildFetchOptions())

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  const rawReadings = data.items || []
  console.log(`  Raw readings: ${rawReadings.length}`)

  const thirtyMinReadings = downsampleToThirtyMinutes(rawReadings)
  console.log(`  30-minute readings: ${thirtyMinReadings.length}`)

  return {
    meta: {
      rloiId,
      measureId,
      name,
      fetchedAt: new Date().toISOString(),
      startDate,
      endDate,
      rawPointCount: rawReadings.length,
      thirtyMinPointCount: thirtyMinReadings.length
    },
    readings: thirtyMinReadings
  }
}

async function main() {
  const stations = Object.entries(stationMapping)

  if (stations.length === 0) {
    console.error('No stations configured in station-mapping.js')
    process.exit(1)
  }

  console.log(`Fetching historic data for ${stations.length} station(s)...`)

  await mkdir(outputDir, { recursive: true })

  let failures = 0

  for (const [rloiId, stationConfig] of stations) {
    try {
      const result = await fetchStationData(rloiId, stationConfig)
      const outputPath = path.resolve(outputDir, `${rloiId}.json`)
      await writeFile(outputPath, JSON.stringify(result, null, 2))

      const fileSizeKB = (JSON.stringify(result).length / 1024).toFixed(1)
      console.log(`  Saved to: ${outputPath} (${fileSizeKB} KB)`)
    } catch (error) {
      console.error(`  FAILED for station ${rloiId}: ${error.message}`)
      failures++
    }
  }

  console.log(`\nDone. ${stations.length - failures}/${stations.length} stations fetched successfully.`)

  if (failures > 0) {
    process.exit(1)
  }
}

main()
