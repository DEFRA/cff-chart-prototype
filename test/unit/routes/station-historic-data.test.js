import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { lookupStationByRLOI, fetchHistoricReadings } from '../../../src/lib/hydrology-service.js'
import { stationHistoricData } from '../../../src/routes/station.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn()
}))
vi.mock('../../../src/lib/hydrology-service.js', () => ({
  lookupStationByRLOI: vi.fn(),
  fetchHistoricReadings: vi.fn()
}))
vi.mock('../../../src/lib/flood-service.js', () => ({
  getStation: vi.fn(),
  getStationReadings: vi.fn(),
  formatStationData: vi.fn(),
  formatTelemetryData: vi.fn()
}))

describe('automatic historic data loading', () => {
  const readings = [{ dateTime: '2026-11-11T12:00:00Z', value: 0.21 }]
  const stationInfo = { name: 'Test station', measureId: 'test-measure' }
  const logger = { info: vi.fn(), error: vi.fn() }
  const h = {
    response: (payload) => ({ code: (statusCode) => ({ payload, statusCode }) })
  }
  const request = (refresh = 'true') => stationHistoricData.handler({
    query: { stationId: '3089', refresh },
    logger
  }, h)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T13:00:00Z'))
    readFile.mockRejectedValue(Object.assign(new Error('File not found'), { code: 'ENOENT' }))
    lookupStationByRLOI.mockResolvedValue(stationInfo)
    fetchHistoricReadings.mockResolvedValue({ readings })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fetches missing history without an admin visit', async () => {
    expect(await request()).toEqual({ statusCode: 200, payload: { stationId: '3089', readings } })
    expect(lookupStationByRLOI).toHaveBeenCalledWith('3089')
    expect(fetchHistoricReadings).toHaveBeenCalledWith('3089', stationInfo)
  })

  test.each([
    { meta: { fetchedAt: '2026-07-03T11:00:00Z' }, readings },
    { meta: { fetchedAt: '2026-11-11T12:00:00Z' }, readings: [] },
    { readings },
    { meta: { fetchedAt: 'invalid' }, readings }
  ])('refreshes stale, empty or undated history: %j', async (cached) => {
    readFile.mockResolvedValue(JSON.stringify(cached))
    expect((await request()).payload.readings).toEqual(readings)
    expect(fetchHistoricReadings).toHaveBeenCalledTimes(1)
  })

  test('reuses a fresh cache without calling the external API', async () => {
    readFile.mockResolvedValue(JSON.stringify({ meta: { fetchedAt: '2026-11-11T12:00:00Z' }, readings }))
    expect((await request()).payload.readings).toEqual(readings)
    expect(fetchHistoricReadings).not.toHaveBeenCalled()
  })

  test('preserves cache-only requests for style A', async () => {
    expect((await request('false')).payload.readings).toEqual([])
    expect(fetchHistoricReadings).not.toHaveBeenCalled()
  })

  test('shares simultaneous refreshes for one station', async () => {
    let finish
    fetchHistoricReadings.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const first = request()
    const second = request()
    await vi.waitFor(() => expect(fetchHistoricReadings).toHaveBeenCalledTimes(1))
    finish({ readings })
    expect((await first).payload.readings).toEqual(readings)
    expect((await second).payload.readings).toEqual(readings)
  })

  test('reports API failures and permits a later retry', async () => {
    fetchHistoricReadings.mockRejectedValueOnce(new Error('API unavailable'))
    expect((await request()).statusCode).toBe(500)
    expect(logger.error).toHaveBeenCalled()
    expect((await request()).statusCode).toBe(200)
    expect(fetchHistoricReadings).toHaveBeenCalledTimes(2)
  })

  test('reports unavailable 15-minute measures', async () => {
    lookupStationByRLOI.mockResolvedValue(null)
    expect((await request()).statusCode).toBe(500)
    expect(fetchHistoricReadings).not.toHaveBeenCalled()
  })

  test.each([
    new Error('Permission denied'),
    new SyntaxError('Corrupt stored data')
  ])('does not silently hide storage failures: %s', async (error) => {
    readFile.mockRejectedValue(error)
    expect((await request()).statusCode).toBe(500)
    expect(logger.error).toHaveBeenCalled()
    expect(fetchHistoricReadings).not.toHaveBeenCalled()
  })
})
