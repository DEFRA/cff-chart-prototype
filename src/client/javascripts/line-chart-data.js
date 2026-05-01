import { simplify } from './utils.js'
import {
  FORECAST_POINTS_RATIO,
  TOLERANCE_TIDE,
  TOLERANCE_DEFAULT
} from './line-chart-constants.js'

function downsampleData(data, targetPoints) {
  if (!data || data.length <= targetPoints) {
    return data
  }

  const step = Math.ceil(data.length / targetPoints)
  const result = []

  for (let i = 0; i < data.length; i += step) {
    result.push(data[i])
  }

  if (result.at(-1) !== data.at(-1)) {
    result.push(data.at(-1))
  }

  return result
}

function getTargetPointsForZoom(zoomLevel, basePoints = 500) {
  // Be more conservative with point density, especially at high zoom levels
  // to prevent overlapping labels on mobile screens

  if (zoomLevel <= 1) {
    return basePoints
  }

  if (zoomLevel <= 3) {
    // Moderate zoom: reduce multiplier to prevent too much detail
    return Math.floor(basePoints * 1.5)
  }

  if (zoomLevel <= 10) {
    // Higher zoom: cap multiplier at 3x for readability
    return Math.floor(basePoints * 3)
  }

  // Very high zoom (>10x): cap at 4x to keep labels readable
  return Math.floor(basePoints * 4)
}

function simplifyByType(data, dataType) {
  if (dataType === 'river') {
    return data
  }

  const tolerance = dataType === 'tide' ? TOLERANCE_TIDE : TOLERANCE_DEFAULT
  return simplify(data, tolerance)
}

function markFirstForecastSignificance(observed, forecast) {
  if (!observed || observed.length === 0) {
    return
  }

  const latestObserved = observed[0]
  const firstForecast = forecast[0]
  const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
    latestObserved.value === firstForecast.value
  forecast[0].isSignificant = !isSame
}

function processObservedData(observed, dataType) {
  const processed = simplifyByType(observed, dataType)
  const filtered = processed.filter(l => !l.err)
  return filtered.map(l => ({ ...l, type: 'observed' })).reverse()
}

function processForecastData(forecast, dataType, observed) {
  const processed = simplifyByType(forecast, dataType)
  markFirstForecastSignificance(observed, processed)
  return processed.map(l => ({ ...l, type: 'forecast' }))
}

export function processData(dataCache, zoomLevel = 1) {
  let observedPoints = []
  let forecastPoints = []

  if (dataCache.observed?.length) {
    observedPoints = processObservedData(dataCache.observed, dataCache.type)
  }

  if (dataCache.forecast?.length) {
    forecastPoints = processForecastData(dataCache.forecast, dataCache.type, dataCache.observed)
  }

  const targetPoints = getTargetPointsForZoom(zoomLevel)
  observedPoints = downsampleData(observedPoints, targetPoints)
  forecastPoints = downsampleData(forecastPoints, Math.floor(targetPoints * FORECAST_POINTS_RATIO))

  const lines = observedPoints.concat(forecastPoints)
  return { lines, observedPoints, forecastPoints }
}
