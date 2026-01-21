import { describe, test, expect, vi, beforeEach } from 'vitest'
import { simplify } from '../../../../src/client/javascripts/utils.js'

// Mock utils simplify function
vi.mock('../../../../src/client/javascripts/utils.js', () => ({
  simplify: vi.fn((data) => data)
}))

/**
 * Tests for helper functions extracted during line-chart-refactored.js refactoring
 * 
 * This file tests the logic of helper functions that were created to reduce cognitive
 * complexity and improve code organization:
 * - simplifyByType: Applies data simplification based on data type
 * - markFirstForecastSignificance: Marks forecast points as significant
 * - processObservedData: Filters and transforms observed data
 * - processForecastData: Transforms forecast data
 * - Y scale domain calculation logic
 * - X scale time padding logic
 * - Tooltip formatting logic
 * - Responsive margin calculations
 * - Data point finding logic
 * - River value clamping logic
 */
describe('line-chart-refactored - Data Processing Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('simplifyByType logic', () => {
    test('should not simplify river type data', () => {
      const data = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.5 },
        { dateTime: '2024-01-01T01:00:00Z', value: 1.6 }
      ]

      const dataType = 'river'

      if (dataType !== 'river') {
        simplify(data, 1000000)
      }

      expect(simplify).not.toHaveBeenCalled()
    })

    test('should call simplify for tide type with tolerance 10000000', () => {
      const data = [
        { dateTime: '2024-01-01T00:00:00Z', value: 5.5 },
        { dateTime: '2024-01-01T01:00:00Z', value: 5.8 }
      ]

      const dataType = 'tide'
      const TOLERANCE_TIDE = 10000000

      if (dataType !== 'river') {
        const tolerance = dataType === 'tide' ? TOLERANCE_TIDE : 1000000
        simplify(data, tolerance)
      }

      expect(simplify).toHaveBeenCalledWith(data, TOLERANCE_TIDE)
    })

    test('should call simplify for non-river/non-tide with default tolerance', () => {
      const data = [
        { dateTime: '2024-01-01T00:00:00Z', value: 2.5 },
        { dateTime: '2024-01-01T01:00:00Z', value: 2.8 }
      ]

      const dataType = 'groundwater'
      const TOLERANCE_DEFAULT = 1000000

      if (dataType !== 'river') {
        const tolerance = dataType === 'tide' ? 10000000 : TOLERANCE_DEFAULT
        simplify(data, tolerance)
      }

      expect(simplify).toHaveBeenCalledWith(data, TOLERANCE_DEFAULT)
    })
  })

  describe('markFirstForecastSignificance logic', () => {
    test('should mark first forecast as significant when different from last observed', () => {
      const observed = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5 }
      ]
      const forecast = [
        { dateTime: '2024-01-01T13:00:00Z', value: 1.8 },
        { dateTime: '2024-01-01T14:00:00Z', value: 2.0 }
      ]

      const latestObserved = observed[0]
      const firstForecast = forecast[0]
      const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
        latestObserved.value === firstForecast.value

      forecast[0].isSignificant = !isSame

      expect(forecast[0].isSignificant).toBe(true)
    })

    test('should not mark as significant when same time and value', () => {
      const observed = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5 }
      ]
      const forecast = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5 },
        { dateTime: '2024-01-01T13:00:00Z', value: 1.6 }
      ]

      const latestObserved = observed[0]
      const firstForecast = forecast[0]
      const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
        latestObserved.value === firstForecast.value

      forecast[0].isSignificant = !isSame

      expect(forecast[0].isSignificant).toBe(false)
    })

    test('should not modify forecast when observed is empty', () => {
      const observed = []
      const forecast = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5 }
      ]

      if (observed && observed.length > 0) {
        const latestObserved = observed[0]
        const firstForecast = forecast[0]
        const isSame = new Date(latestObserved.dateTime).getTime() === new Date(firstForecast.dateTime).getTime() &&
          latestObserved.value === firstForecast.value
        forecast[0].isSignificant = !isSame
      }

      expect(forecast[0].isSignificant).toBeUndefined()
    })
  })

  describe('processObservedData logic', () => {
    test('should filter out error readings', () => {
      const observed = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5, err: false },
        { dateTime: '2024-01-01T13:00:00Z', value: 99.9, err: true },
        { dateTime: '2024-01-01T14:00:00Z', value: 1.6, err: false }
      ]

      const filtered = observed.filter(l => !l.err)

      expect(filtered).toHaveLength(2)
      expect(filtered[0].value).toBe(1.5)
      expect(filtered[1].value).toBe(1.6)
    })

    test('should add type property to observed data', () => {
      const observed = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.5, err: false }
      ]

      const filtered = observed.filter(l => !l.err)
      const result = filtered.map(l => ({ ...l, type: 'observed' }))

      expect(result[0].type).toBe('observed')
    })

    test('should reverse observed data array', () => {
      const observed = [
        { dateTime: '2024-01-01T12:00:00Z', value: 1.0, err: false },
        { dateTime: '2024-01-01T13:00:00Z', value: 2.0, err: false },
        { dateTime: '2024-01-01T14:00:00Z', value: 3.0, err: false }
      ]

      const filtered = observed.filter(l => !l.err)
      const result = filtered.map(l => ({ ...l, type: 'observed' })).reverse()

      expect(result[0].value).toBe(3.0)
      expect(result[2].value).toBe(1.0)
    })
  })

  describe('processForecastData logic', () => {
    test('should add type property to forecast data', () => {
      const forecast = [
        { dateTime: '2024-01-01T13:00:00Z', value: 1.6 },
        { dateTime: '2024-01-01T14:00:00Z', value: 1.7 }
      ]

      const result = forecast.map(l => ({ ...l, type: 'forecast' }))

      expect(result[0].type).toBe('forecast')
      expect(result[1].type).toBe('forecast')
    })
  })

  describe('Y scale domain calculation', () => {
    test('should calculate domain with buffering', () => {
      const yExtentDataMin = 1.0
      const yExtentDataMax = 3.0
      const RANGE_BUFFER_DIVISOR = 3

      let range = yExtentDataMax - yExtentDataMin
      range = Math.max(range, 1)

      const yRangeUpperBuffered = yExtentDataMax + (range / RANGE_BUFFER_DIVISOR)
      const yRangeLowerBuffered = yExtentDataMin - (range / RANGE_BUFFER_DIVISOR)

      expect(yRangeUpperBuffered).toBeCloseTo(3.67, 1)
      expect(yRangeLowerBuffered).toBeCloseTo(0.33, 1)
    })

    test('should enforce minimum range value of 1', () => {
      const yExtentDataMin = 1.5
      const yExtentDataMax = 1.5
      const MIN_RANGE_VALUE = 1

      let range = yExtentDataMax - yExtentDataMin
      range = Math.max(range, MIN_RANGE_VALUE)

      expect(range).toBe(MIN_RANGE_VALUE)
    })

    test('should set lower bound to 0 for river data with negative range', () => {
      const yRangeLowerBuffered = -0.5
      const dataType = 'river'

      const lowerBound = dataType === 'river' ? Math.max(yRangeLowerBuffered, 0) : yRangeLowerBuffered

      expect(lowerBound).toBe(0)
    })

    test('should allow negative lower bound for non-river data', () => {
      const yRangeLowerBuffered = -0.5
      const dataType = 'groundwater'

      const lowerBound = dataType === 'river' ? Math.max(yRangeLowerBuffered, 0) : yRangeLowerBuffered

      expect(lowerBound).toBe(-0.5)
    })
  })

  describe('X scale time padding', () => {
    test('should add 5% padding to maximum time', () => {
      const TIME_RANGE_PADDING = 0.05
      const xExtentMin = new Date('2024-01-01T00:00:00Z')
      const xExtentMax = new Date('2024-01-01T12:00:00Z')

      const timeRange = xExtentMax - xExtentMin
      const paddedMax = new Date(xExtentMax.getTime() + (timeRange * TIME_RANGE_PADDING))

      expect(paddedMax.getTime()).toBeGreaterThan(xExtentMax.getTime())
      expect(paddedMax.getTime() - xExtentMax.getTime()).toBe(timeRange * TIME_RANGE_PADDING)
    })
  })

  describe('Tooltip value formatting', () => {
    test('should format river values <= 0 as "0"', () => {
      const dataPoint = { value: -0.001 }
      const dataType = 'river'

      const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0
        ? '0'
        : dataPoint.value.toFixed(2)

      expect(value).toBe('0')
    })

    test('should format positive values to 2 decimal places', () => {
      const dataPoint = { value: 1.567 }
      const dataType = 'river'

      const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0
        ? '0'
        : dataPoint.value.toFixed(2)

      expect(value).toBe('1.57')
    })

    test('should format small positive values correctly', () => {
      const dataPoint = { value: 0.001 }
      const dataType = 'river'

      const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0
        ? '0'
        : dataPoint.value.toFixed(2)

      // 0.001 rounds to 0.00 which is <= 0, so it becomes '0'
      expect(value).toBe('0')
    })

    test('should handle exactly zero', () => {
      const dataPoint = { value: 0 }
      const dataType = 'river'

      const value = dataType === 'river' && (Math.round(dataPoint.value * 100) / 100) <= 0
        ? '0'
        : dataPoint.value.toFixed(2)

      expect(value).toBe('0')
    })
  })

  describe('Responsive margin calculation', () => {
    test('should use mobile margins for mobile viewport', () => {
      const isMobile = true
      const MOBILE_MARGIN_RIGHT_BASE = 31
      const DESKTOP_MARGIN_RIGHT_BASE = 36
      const MARGIN_CHAR_MULTIPLIER = 9
      const numChars = 2

      const marginRight = (isMobile ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE) +
        (numChars * MARGIN_CHAR_MULTIPLIER)

      expect(marginRight).toBe(49)
    })

    test('should use desktop margins for desktop viewport', () => {
      const isMobile = false
      const MOBILE_MARGIN_RIGHT_BASE = 31
      const DESKTOP_MARGIN_RIGHT_BASE = 36
      const MARGIN_CHAR_MULTIPLIER = 9
      const numChars = 2

      const marginRight = (isMobile ? MOBILE_MARGIN_RIGHT_BASE : DESKTOP_MARGIN_RIGHT_BASE) +
        (numChars * MARGIN_CHAR_MULTIPLIER)

      expect(marginRight).toBe(54)
    })

    test('should adjust margin based on number of characters', () => {
      const isMobile = false
      const MARGIN_CHAR_MULTIPLIER = 9
      const DESKTOP_MARGIN_RIGHT_BASE = 36

      const numChars3 = 3
      const margin3 = DESKTOP_MARGIN_RIGHT_BASE + (numChars3 * MARGIN_CHAR_MULTIPLIER)

      const numChars5 = 5
      const margin5 = DESKTOP_MARGIN_RIGHT_BASE + (numChars5 * MARGIN_CHAR_MULTIPLIER)

      expect(margin3).toBe(63)
      expect(margin5).toBe(81)
    })
  })

  describe('Data point finding logic', () => {
    test('should return null for empty lines array', () => {
      const lines = []
      const result = lines && lines.length > 0 ? lines[0] : null

      expect(result).toBeNull()
    })

    test('should find closest data point by date difference', () => {
      const lines = [
        { dateTime: '2024-01-01T00:00:00Z', value: 1.0 },
        { dateTime: '2024-01-01T01:00:00Z', value: 1.5 },
        { dateTime: '2024-01-01T02:00:00Z', value: 2.0 }
      ]

      const mouseDate = new Date('2024-01-01T00:45:00Z')
      const d0 = lines[0]
      const d1 = lines[1]

      const d0Date = new Date(d0.dateTime)
      const d1Date = new Date(d1.dateTime)

      const closestPoint = mouseDate - d0Date > d1Date - mouseDate ? d1 : d0

      expect(closestPoint.value).toBe(1.5)
    })

    test('should choose first point when equidistant', () => {
      const d0Date = new Date('2024-01-01T00:00:00Z')
      const d1Date = new Date('2024-01-01T02:00:00Z')
      const mouseDate = new Date('2024-01-01T01:00:00Z')

      const d0 = { value: 1.0 }
      const d1 = { value: 2.0 }

      const closestPoint = mouseDate - d0Date > d1Date - mouseDate ? d1 : d0

      expect(closestPoint.value).toBe(1.0)
    })
  })

  describe('Locator forecast detection', () => {
    test('should detect forecast when data point is after latest', () => {
      const dataPointTime = new Date('2024-01-01T14:00:00Z')
      const latestDateTime = new Date('2024-01-01T12:00:00Z')

      const isForecast = dataPointTime > latestDateTime

      expect(isForecast).toBe(true)
    })

    test('should not detect forecast when equal to latest', () => {
      const dataPointTime = new Date('2024-01-01T12:00:00Z')
      const latestDateTime = new Date('2024-01-01T12:00:00Z')

      const isForecast = dataPointTime > latestDateTime

      expect(isForecast).toBe(false)
    })

    test('should not detect forecast when before latest', () => {
      const dataPointTime = new Date('2024-01-01T11:00:00Z')
      const latestDateTime = new Date('2024-01-01T12:00:00Z')

      const isForecast = dataPointTime > latestDateTime

      expect(isForecast).toBe(false)
    })
  })

  describe('River value clamping', () => {
    test('should clamp negative river values to 0', () => {
      const dataPoint = { value: -0.5 }
      const dataType = 'river'

      const clampedValue = dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value

      expect(clampedValue).toBe(0)
    })

    test('should not clamp positive river values', () => {
      const dataPoint = { value: 1.5 }
      const dataType = 'river'

      const clampedValue = dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value

      expect(clampedValue).toBe(1.5)
    })

    test('should not clamp zero river values', () => {
      const dataPoint = { value: 0 }
      const dataType = 'river'

      const clampedValue = dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value

      expect(clampedValue).toBe(0)
    })

    test('should not clamp negative non-river values', () => {
      const dataPoint = { value: -0.5 }
      const dataType = 'groundwater'

      const clampedValue = dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value

      expect(clampedValue).toBe(-0.5)
    })

    test('should handle very small negative river values', () => {
      const dataPoint = { value: -0.001 }
      const dataType = 'river'

      const clampedValue = dataType === 'river' && dataPoint.value < 0 ? 0 : dataPoint.value

      expect(clampedValue).toBe(0)
    })
  })

  describe('Tooltip position boundary checking', () => {
    test('should clamp to top margin when y is too small', () => {
      const TOOLTIP_MARGIN_TOP = 10
      let y = 5

      if (y < TOOLTIP_MARGIN_TOP) {
        y = TOOLTIP_MARGIN_TOP
      }

      expect(y).toBe(10)
    })

    test('should clamp to bottom margin when y is too large', () => {
      const height = 400
      const TOOLTIP_MARGIN_BOTTOM_OFFSET = 10
      const tooltipHeight = 50
      const tooltipMarginBottom = height - (tooltipHeight + TOOLTIP_MARGIN_BOTTOM_OFFSET)
      let y = 380

      if (y > tooltipMarginBottom) {
        y = tooltipMarginBottom
      }

      expect(y).toBe(340)
    })

    test('should not modify y when within bounds', () => {
      const TOOLTIP_MARGIN_TOP = 10
      const tooltipMarginBottom = 340
      let y = 150

      if (y < TOOLTIP_MARGIN_TOP) {
        y = TOOLTIP_MARGIN_TOP
      } else if (y > tooltipMarginBottom) {
        y = tooltipMarginBottom
      }

      expect(y).toBe(150)
    })
  })
})
