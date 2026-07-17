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
  test.each(['6m', '1y', '3y'])('uses 30-minute snapping at tight zoom for %s range', (timeRange) => {
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
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(false)
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

  test.each(['6m', '1y', '3y'])('uses 30-minute snapping at effective full zoom for %s range despite tiny precision drift', (timeRange) => {
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
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(false)
  })

  test.each(['6m', '1y', '3y'])('uses daily snapping at full zoomed-out range for %s', (timeRange) => {
    const observed = createQuarterHourlyPoints('2026-01-01T00:15:00.000Z', 96)
    const visibleDomain = [
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, timeRange)

    expect(result.observedPoints.length).toBeGreaterThan(0)
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(false)
    const hasNonMidnight = result.observedPoints.some(point => {
      const date = new Date(point.dateTime)
      return date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0
    })
    expect(hasNonMidnight).toBe(false)
  })

  test('keeps 15-minute snapping for 5 day range at full zoom', () => {
    const observed = createQuarterHourlyPoints('2026-06-01T00:15:00.000Z', 16)
    const visibleDomain = [
      new Date('2026-05-31T00:00:00.000Z'),
      new Date('2026-06-05T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, '5d')

    expect(result.observedPoints.length).toBeGreaterThan(0)
    expect(hasQuarterHourPoints(result.observedPoints)).toBe(true)
  })

  test('keeps snapped bucket values numeric when source values are strings', () => {
    const observed = createQuarterHourlyPoints('2026-06-01T00:15:00.000Z', 16)
      .map(point => ({ ...point, value: String(point.value) }))
    const visibleDomain = [
      new Date('2026-05-26T00:00:00.000Z'),
      new Date('2026-06-05T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, '1y')

    expect(result.observedPoints.length).toBe(8)
    expect(result.observedPoints.every(point => Number.isFinite(point.value))).toBe(true)
  })

  test('preserves interval spike when 30-minute downsampling is active', () => {
    const observed = [
      { dateTime: '2026-03-01T00:01:00.000Z', value: 0.2 },
      { dateTime: '2026-03-01T00:20:00.000Z', value: 0.95 },
      { dateTime: '2026-03-01T00:40:00.000Z', value: 0.21 }
    ]
    const visibleDomain = [
      new Date('2026-02-01T00:00:00.000Z'),
      new Date('2026-03-20T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, '3y')

    expect(result.observedPoints.some(point => point.value >= 0.9)).toBe(true)
  })
})
