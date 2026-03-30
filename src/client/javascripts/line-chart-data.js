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
  const multiplier = Math.min(zoomLevel, 10)
  return Math.floor(basePoints * multiplier)
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
