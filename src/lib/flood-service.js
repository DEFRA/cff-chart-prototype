import { ProxyAgent } from 'undici'
import { config } from '../config/config.js'

const API_BASE_URL = config.get('api.floodMonitoring.baseUrl')

/**
 * Fetch via proxy using Node.js native fetch
 * To use the fetch dispatcher option on Node.js native fetch, Node.js v18.2.0 or greater is required
 */
export function proxyFetch (url, options = {}) {
  const proxyUrlConfig = config.get('httpProxy') // bound to HTTP_PROXY

  if (!proxyUrlConfig) {
    console.log(`[PROXY] No HTTP_PROXY set - using direct fetch for: ${url}`)
    return fetch(url, options)
  }

  console.log(`[PROXY] Using proxy ${proxyUrlConfig} for: ${url}`)
  try {
    return fetch(url, {
      ...options,
      dispatcher: new ProxyAgent({
        uri: proxyUrlConfig,
        keepAliveTimeout: 10,
        keepAliveMaxTimeout: 10
      })
    })
  } catch (error) {
    console.error(`[PROXY] Error setting up proxy for ${url}:`, error)
    throw error
  }
}

/**
 * Fetch station details by RLOI ID (Check for Flooding ID)
 */
export async function getStation (stationId) {
  const url = `${API_BASE_URL}/id/stations?RLOIid=${stationId}`
  try {
    console.log(`Fetching station from: ${url}`)
    const response = await proxyFetch(url)
    console.log(`Station API response status: ${response.status} ${response.statusText}`)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response')
      throw new Error(`Failed to fetch station: ${response.status} ${response.statusText} - ${errorText}`)
    }
    const data = await response.json()
    // The API returns an array of stations in items
    if (data.items && data.items.length > 0) {
      console.log(`Station data retrieved successfully for ${stationId}`)
      return data.items[0]
    }
    console.log(`No station items found for ${stationId}`)
    return null
  } catch (error) {
    // Log everything on the error object
    console.error(`Error fetching station from ${url}:`)
    console.error('Error details:', error)
    console.error('Error keys:', Object.keys(error))
    console.error('Error cause:', error.cause)
    if (error.cause) {
      console.error('Cause keys:', Object.keys(error.cause))
      console.error('Cause details:', JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause)))
    }
    return null
  }
}

/**
 * Fetch station readings/measurements
 */
export async function getStationReadings (stationId, since = null) {
  const stationUrl = `${API_BASE_URL}/id/stations?RLOIid=${stationId}`
  try {
    // First get the station to find its measures
    console.log(`Fetching station for readings from: ${stationUrl}`)
    const stationResponse = await proxyFetch(stationUrl)
    if (!stationResponse.ok) {
      console.error(`Station fetch for readings failed: ${stationResponse.status} ${stationResponse.statusText}`)
      throw new Error('Station not found')
    }
    const stationData = await stationResponse.json()
    if (!stationData.items || stationData.items.length === 0) {
      console.log(`No station items found for readings: ${stationId}`)
      return []
    }

    const station = stationData.items[0]
    if (!station.measures || station.measures.length === 0) {
      return []
    }

    // Find the level measure
    const levelMeasure = station.measures.find(m =>
      m.parameterName === 'Water Level' || m.parameter === 'level'
    )

    if (!levelMeasure) {
      return []
    }

    // Extract measure ID from the @id URL
    const measureId = levelMeasure['@id'].split('/').pop()

    // Get all available readings - filtering happens in formatTelemetryData
    const url = `${API_BASE_URL}/data/readings?measure=${measureId}&_sorted&_limit=10000`
    console.log('Fetching readings from:', url)
    const response = await proxyFetch(url)

    if (!response.ok) {
      console.error('Readings API error:', response.status, response.statusText)
      throw new Error(`Failed to fetch readings: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Readings data:', data.items?.length, 'items')
    return data.items || []
  } catch (error) {
    console.error('Error fetching readings:', JSON.stringify({
      name: error.name,
      message: error.message,
      cause: error.cause,
      code: error.code
    }, null, 2))
    return []
  }
}

/**
 * Format station data for the view
 */
export function formatStationData (station, readings) {
  if (!station) return null

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null
  const latestValue = latestReading?.value || 0

  // Calculate trend (simplified - compare to reading from 1 hour ago)
  let trend = 'steady'
  if (readings.length > 4) {
    const hourAgoReading = readings[readings.length - 5]?.value
    if (hourAgoReading) {
      if (latestValue > hourAgoReading + 0.05) trend = 'rising'
      else if (latestValue < hourAgoReading - 0.05) trend = 'falling'
    }
  }

  // Determine state based on percentiles (if available)
  let state = 'normal'
  if (station.stageScale) {
    const typical = station.stageScale.typicalRangeHigh || 1.0
    if (latestValue > typical) state = 'high'
    else if (latestValue < (station.stageScale.typicalRangeLow || 0)) state = 'low'
  }

  const latestDate = latestReading?.dateTime ? new Date(latestReading.dateTime) : new Date()

  // Extract RLOI ID (Check for Flooding ID)
  const stationRef = station.RLOIid || station.stationReference || station.notation || 'unknown'

  return {
    id: stationRef,
    name: station.label || station.town || station.stationReference || 'Unknown',
    river: station.riverName || 'Unknown River',
    type: station.stationType || 'S',
    recentValue: {
      value: latestValue.toFixed(2),
      formattedTime: latestDate.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }),
      latestDayFormatted: latestDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    },
    trend,
    state,
    stateInformation: station.stageScale
      ? `${station.stageScale.typicalRangeLow?.toFixed(2) || '0.00'}m to ${station.stageScale.typicalRangeHigh?.toFixed(2) || '1.00'}m`
      : 'Data not available',
    hasPercentiles: !!station.stageScale,
    isActive: station.status === 'Active' || !station.status,
    status: station.status?.toLowerCase() || 'active',
    lat: station.lat,
    long: station.long
  }
}

/**
 * Format readings for chart
 */
export function formatTelemetryData (readings) {
  // Filter to last 5 days only
  const fiveDaysAgo = new Date()
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

  const filteredReadings = readings.filter(reading => {
    const readingDate = new Date(reading.dateTime)
    return readingDate >= fiveDaysAgo
  })

  const observed = filteredReadings.map(reading => ({
    dateTime: reading.dateTime,
    value: reading.value,
    err: false
  }))

  return {
    observed,
    forecast: [],
    latestDateTime: filteredReadings.length > 0 ? filteredReadings[filteredReadings.length - 1].dateTime : new Date().toISOString(),
    type: 'river',
    cacheStartDateTime: filteredReadings.length > 0 ? filteredReadings[0].dateTime : new Date().toISOString(),
    cacheEndDateTime: filteredReadings.length > 0 ? filteredReadings[filteredReadings.length - 1].dateTime : new Date().toISOString()
  }
}

/**
 * Search for stations
 */
export async function searchStations (query = {}) {
  try {
    const params = new URLSearchParams()
    if (query.label) params.append('label', query.label)
    if (query.stationType) params.append('type', query.stationType)
    if (query.riverName) params.append('riverName', query.riverName)

    const url = `${API_BASE_URL}/id/stations?${params.toString()}&_limit=50`
    const response = await proxyFetch(url)

    if (!response.ok) {
      throw new Error(`Failed to search stations: ${response.statusText}`)
    }

    const data = await response.json()
    return data.items
  } catch (error) {
    console.error('Error searching stations:', error)
    return []
  }
}
