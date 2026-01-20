import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'

describe('Health Check Connectivity route', () => {
  let server

  beforeEach(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterEach(async () => {
    await server.stop({ timeout: 0 })
    vi.restoreAllMocks()
  })

  test('Should return 200 and connectivity status when API is reachable', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    // Mock successful response
    vi.spyOn(floodServiceModule, 'proxyFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ items: [{ id: '8085', label: 'Test Station' }] })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.service).toBe('ok')
    expect(result.timestamp).toBeDefined()
    expect(result.externalApis).toBeDefined()
    expect(result.externalApis.environmentAgency).toBeDefined()
    expect(result.externalApis.environmentAgency.reachable).toBe(true)
    expect(result.externalApis.environmentAgency.status).toBe(200)
    expect(result.externalApis.environmentAgency.itemsCount).toBe(1)
  })

  test('Should handle API connectivity failure gracefully', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    // Mock network error
    vi.spyOn(floodServiceModule, 'proxyFetch').mockRejectedValueOnce(
      new Error('Network error')
    )

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.service).toBe('ok')
    expect(result.externalApis.environmentAgency.reachable).toBe(false)
    expect(result.externalApis.environmentAgency.error).toBe('Network error')
    expect(result.externalApis.environmentAgency.errorType).toBe('Error')
  })

  test('Should handle API returning non-ok status', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    // Mock 404 response
    vi.spyOn(floodServiceModule, 'proxyFetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Not found' })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.service).toBe('ok')
    expect(result.externalApis.environmentAgency.reachable).toBe(false)
    expect(result.externalApis.environmentAgency.status).toBe(404)
  })

  test('Should handle API returning empty items array', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    // Mock successful but empty response
    vi.spyOn(floodServiceModule, 'proxyFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ items: [] })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.externalApis.environmentAgency.reachable).toBe(true)
    expect(result.externalApis.environmentAgency.itemsCount).toBe(0)
  })

  test('Should handle API returning malformed JSON', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    // Mock response with invalid JSON
    vi.spyOn(floodServiceModule, 'proxyFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => { throw new Error('Invalid JSON') }
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.service).toBe('ok')
    expect(result.externalApis.environmentAgency.reachable).toBe(false)
    expect(result.externalApis.environmentAgency.error).toBe('Invalid JSON')
  })

  test('Should include timestamp in response', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    vi.spyOn(floodServiceModule, 'proxyFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ items: [] })
    })

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.timestamp).toBeDefined()
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date')
  })

  test('Should include error stack in failure response', async () => {
    const floodServiceModule = await import('../../../../src/lib/flood-service.js')

    const testError = new Error('Connection timeout')
    testError.stack = 'Error: Connection timeout\n  at test line 1\n  at test line 2'

    vi.spyOn(floodServiceModule, 'proxyFetch').mockRejectedValueOnce(testError)

    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/health/connectivity'
    })

    expect(statusCode).toBe(200)
    expect(result.externalApis.environmentAgency.stack).toBeDefined()
    expect(typeof result.externalApis.environmentAgency.stack).toBe('string')
  })
})
