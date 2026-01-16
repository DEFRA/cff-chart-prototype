import { describe, beforeAll, afterAll, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'

describe('Start route', () => {
  let server

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})

    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    if (server && typeof server.stop === 'function') {
      await server.stop({ timeout: 0 })
    }
    vi.restoreAllMocks()
  })

  test('Should return status code 200 for GET /', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/'
    })
    expect(response.statusCode).toBe(200)
  })
})
