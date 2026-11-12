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
  test.each([
    ['15m', 96, 1],
    ['30m', 48, 2],
    ['1h', 24, 4],
    ['daily', 1, 96]
  ])('stepped %s buckets retain the highest original reading', (steppedResolution, count, bucketSize) => {
    const observed = createQuarterHourlyPoints('2024-01-01T00:00:00.000Z', 96)
    const domain = [new Date('2024-01-01T00:00:00.000Z'), new Date('2024-01-02T00:00:00.000Z')]
    const { observedPoints } = processData({ observed, forecast: [], type: 'river' }, domain, '3y', {
      preserveAllPoints: true,
      steppedResolution
    })

    expect(observedPoints).toHaveLength(count)
    expect(observedPoints.map(({ dateTime, value }) => ({ dateTime, value }))).toEqual(
      observed.filter((_, index) => (index + 1) % bucketSize === 0)
    )
  })

  test.each([
    ['1h', 730, 730 * 24],
    ['daily', 1095, 1095]
  ])('stepped %s resolution bounds points across %s days', (steppedResolution, days, count) => {
    const observed = createQuarterHourlyPoints('2022-01-01T00:00:00.000Z', days * 96)
    const domain = [
      new Date('2022-01-01T00:00:00.000Z'),
      new Date(Date.parse('2022-01-01T00:00:00.000Z') + days * 86400000)
    ]
    const result = processData({ observed, forecast: [], type: 'river' }, domain, '3y', {
      preserveAllPoints: true, steppedResolution
    })
    expect(result.observedPoints).toHaveLength(count)
  })

  test('daily maximum compares numeric string values numerically', () => {
    const observed = [
      { dateTime: '2024-01-01T00:00:00.000Z', value: '9' },
      { dateTime: '2024-01-01T00:15:00.000Z', value: '10' }
    ]
    const result = processData({ observed, forecast: [], type: 'river' }, null, '3y', {
      preserveAllPoints: true, steppedResolution: 'daily'
    })
    expect(result.observedPoints).toEqual([{ ...observed[1], type: 'observed' }])
  })

  test.each([5, 7.5, 31, 91, 181, 1095])('preserves every original reading across a %s-day window when sampling is disabled', (days) => {
    const observed = createQuarterHourlyPoints('2024-01-01T00:15:00.000Z', 192)
    const forecast = createQuarterHourlyPoints('2024-01-03T00:15:00.000Z', 16)
    const visibleDomain = [
      new Date('2024-01-01T00:00:00.000Z'),
      new Date(new Date('2024-01-01T00:00:00.000Z').getTime() + days * 86400000)
    ]

    for (const type of ['river', 'tide', 'groundwater']) {
      const result = processData({ observed, forecast, type }, visibleDomain, '3y', { preserveAllPoints: true })

      expect(result.observedPoints).toEqual(observed.map(point => ({ ...point, type: 'observed' })))
      expect(result.forecastPoints).toEqual(forecast.map(point => ({ ...point, type: 'forecast' })))
      expect(result.lines).toHaveLength(observed.length + forecast.length)
    }
  })

  test('retains all 105120 quarter-hourly readings across a three-year window', () => {
    const observed = createQuarterHourlyPoints('2023-01-01T00:00:00.000Z', 365 * 3 * 96)
    const result = processData({ observed, forecast: [], type: 'river' }, [
      new Date('2023-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z')
    ], '3y', { preserveAllPoints: true })

    expect(result.observedPoints).toHaveLength(observed.length)
    expect(result.observedPoints.every((point, index) =>
      point.dateTime === observed[index].dateTime && point.value === observed[index].value
    )).toBe(true)
  })

  test('still excludes error readings, future readings and points outside the buffered viewport when sampling is disabled', () => {
    const observed = [
      { dateTime: '2024-01-01T00:00:00.000Z', value: 1 },
      { dateTime: '2024-06-01T00:00:00.000Z', value: 2, err: true },
      { dateTime: '2024-06-01T00:15:00.000Z', value: 3 },
      { dateTime: '2999-01-01T00:00:00.000Z', value: 4 }
    ]
    const result = processData({ observed, forecast: [], type: 'river' }, [
      new Date('2024-05-30T00:00:00.000Z'),
      new Date('2024-06-04T00:00:00.000Z')
    ], '3y', { preserveAllPoints: true })

    expect(result.observedPoints).toEqual([{ ...observed[2], type: 'observed' }])

    const unbounded = processData({ observed, forecast: [], type: 'river' }, null, '3y', { preserveAllPoints: true })
    expect(unbounded.observedPoints.map(point => point.value)).toEqual([1, 3])
  })

  test('keeps observed points in ascending order when input is already ascending', () => {
    const observed = [
      { dateTime: '2026-07-20T00:00:00.000Z', value: 0.2 },
      { dateTime: '2026-07-20T00:15:00.000Z', value: 0.22 },
      { dateTime: '2026-07-20T00:30:00.000Z', value: 0.24 }
    ]

    const visibleDomain = [
      new Date('2026-07-19T00:00:00.000Z'),
      new Date('2026-07-21T00:00:00.000Z')
    ]

    const result = processData({
      observed,
      forecast: [],
      type: 'river'
    }, visibleDomain, '5d')

    const timestamps = result.observedPoints.map(point => new Date(point.dateTime).getTime())
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b)
    expect(timestamps).toEqual(sortedTimestamps)
  })

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
