import { describe, beforeAll, afterAll, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'

// Mock the flood-service to avoid external API calls
vi.mock('../../../../src/lib/flood-service.js', () => ({
  getStation: vi.fn().mockImplementation((stationId) => {
    if (stationId === '8085') {
      return Promise.resolve({
        '@id': 'http://environment.data.gov.uk/flood-monitoring/id/stations/8085',
        RLOIid: '8085',
        label: 'Test Station',
        stationReference: 'E8085',
        riverName: 'Test River',
        town: 'Test Town',
        measures: [{
          '@id': 'http://environment.data.gov.uk/flood-monitoring/id/measures/8085-level-stage-i-15_min-mASD',
          parameter: 'level',
          parameterName: 'Water Level',
          unitName: 'mASD'
        }]
      })
    } else if (stationId === '999999' || stationId === 'invalid') {
      return Promise.resolve(null)
    }
    return Promise.resolve(null)
  }),
  getStationReadings: vi.fn().mockResolvedValue([
    {
      '@id': 'http://environment.data.gov.uk/flood-monitoring/data/readings/8085-level-stage-i-15_min-mASD/2024-01-01T00:00:00Z',
      dateTime: '2024-01-01T00:00:00Z',
      measure: 'http://environment.data.gov.uk/flood-monitoring/id/measures/8085-level-stage-i-15_min-mASD',
      value: 1.234
    },
    {
      '@id': 'http://environment.data.gov.uk/flood-monitoring/data/readings/8085-level-stage-i-15_min-mASD/2024-01-01T00:15:00Z',
      dateTime: '2024-01-01T00:15:00Z',
      measure: 'http://environment.data.gov.uk/flood-monitoring/id/measures/8085-level-stage-i-15_min-mASD',
      value: 1.245
    }
  ]),
  formatStationData: vi.fn().mockImplementation((stationData, readings) => {
    return {
      id: stationData?.RLOIid || '8085',
      name: stationData?.label || 'Test Station',
      river: stationData?.riverName || 'Test River',
      type: 'S',
      recentValue: {
        value: '1.25',
        formattedTime: '12:15am',
        latestDayFormatted: '1 January'
      },
      trend: 'rising',
      state: 'normal',
      stateInformation: '0.50m to 2.00m',
      hasPercentiles: true,
      isActive: true,
      status: 'active',
      lat: 51.5,
      long: -0.1,
      rloiId: stationData?.RLOIid || '8085'
    }
  }),
  formatTelemetryData: vi.fn().mockImplementation((readings) => ({
    observed: readings?.map(r => ({
      dateTime: r.dateTime,
      value: r.value
    })) || []
  }))
}))

describe('Station route', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should load station page with default station ID 8085', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('level at')
    expect(result).toContain('Latest at')
    expect(result).toContain('Height')
  }, 10000)

  test('Should load station page with specified station ID', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('level at')
    expect(result).toContain('Latest at')
  }, 10000)

  test('Should return 404 for non-existent station', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=999999'
    })

    expect(statusCode).toBe(404)
    expect(result).toContain('Station not found')
    expect(result).toContain('999999')
  }, 10000)

  test('Should return 404 for invalid station ID', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=invalid'
    })

    expect(statusCode).toBe(404)
    expect(result).toContain('Station not found')
  }, 10000)

  test('Should accept dataType query parameter', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085&dataType=forecast'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('Latest at')
  }, 10000)

  test('Should accept stationType query parameter', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085&stationType=river'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('level at')
  }, 10000) // Increase timeout for slow API calls

  test('Should include telemetry data in response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('window.flood.model')
    expect(result).toContain('telemetry')
    expect(result).toContain('observed')
  }, 10000)

  test('Should include chart container in response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('line-chart')
    expect(result).toContain('defra-line-chart')
  }, 10000)
})
