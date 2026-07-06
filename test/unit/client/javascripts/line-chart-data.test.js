import { describe, test, expect } from 'vitest'
import { processData } from '../../../../src/client/javascripts/line-chart-data.js'

function createQuarterHourlyPoints(startIso, count) {
  const startMs = new Date(startIso).getTime()

  return Array.from({ length: count }, (_, index) => {
    const dateTime = new Date(startMs + (index * 15 * 60 * 1000)).toISOString()
    return { dateTime, value: index + 1 }
  })
}

function hasQuarterHourPoints(points) {
  return points.some(point => {
    const minute = new Date(point.dateTime).getUTCMinutes()
    return minute === 15 || minute === 45
  })
}

describe('line-chart-data processData zoom snapping', () => {
  test.each(['6m', '1y', '3y'])('uses 15-minute snapping at 5-day zoom for %s range', (timeRange) => {
    const observed = createQuarterHourlyPoints('2026-06-01T00:15:00.000Z', 16)
    const visibleDomain = [
      new Date('2026-05-31T00:00:00.000Z'),
      new Date('2026-06-05T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, timeRange)

    expect(result.observedPoints.length).toBeGreaterThan(0)
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(true)
  })

  test('keeps 30-minute snapping for 1 year range above 5-day zoom', () => {
    const observed = createQuarterHourlyPoints('2026-06-01T00:15:00.000Z', 16)
    const visibleDomain = [
      new Date('2026-05-26T00:00:00.000Z'),
      new Date('2026-06-05T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, '1y')

    const hasQuarterHours = hasQuarterHourPoints(result.observedPoints)
    expect(hasQuarterHours).toBe(false)
  })

  test.each(['6m', '1y', '3y'])('uses 15-minute snapping at effective full zoom for %s range despite tiny precision drift', (timeRange) => {
    const observed = createQuarterHourlyPoints('2026-06-01T00:15:00.000Z', 16)
    const visibleDomain = [
      new Date('2026-05-31T00:00:00.000Z'),
      new Date('2026-06-05T00:15:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, timeRange)

    expect(result.observedPoints.length).toBeGreaterThan(0)
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(true)
  })
})
