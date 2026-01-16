import fetch from 'node-fetch'
import { config } from '../config/config.js'

const API_BASE_URL = config.get('api.floodMonitoring.baseUrl')

/**
 * Fetch station details by RLOI ID (Check for Flooding ID)
 */
export async function getStation (stationId) {
  try {
    const response = await fetch(`${API_BASE_URL}/id/stations?RLOIid=${stationId}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch station: ${response.statusText}`)
    }
    const data = await response.json()
    // The API returns an array of stations in items
    if (data.items && data.items.length > 0) {
      return data.items[0]
    }
    return null
  } catch (error) {
    console.error('Error fetching station:', error)
    return null
  }
}

/**
 * Fetch station readings/measurements
 */
export async function getStationReadings (stationId, since = null) {
  try {
    // First get the station to find its measures
    const stationResponse = await fetch(`${API_BASE_URL}/id/stations?RLOIid=${stationId}`)
    if (!stationResponse.ok) {
      throw new Error('Station not found')
    }
    const stationData = await stationResponse.json()
    if (!stationData.items || stationData.items.length === 0) {
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
    const response = await fetch(url)

    if (!response.ok) {
      console.error('Readings API error:', response.status, response.statusText)
      throw new Error(`Failed to fetch readings: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('Readings data:', data.items?.length, 'items')
    return data.items || []
  } catch (error) {
    console.error('Error fetching readings:', error)
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
    const response = await fetch(url)

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
