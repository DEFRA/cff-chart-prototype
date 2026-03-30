import { describe, beforeAll, afterAll, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'
import { config } from '../../../../src/config/config.js'

describe('Start route', () => {
  let server
  let authCookie

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => { })
    vi.spyOn(console, 'info').mockImplementation(() => { })

    server = await createServer()
    await server.initialize()

    // Login to get authenticated session
    const loginResponse = await server.inject({
      method: 'POST',
      url: '/login',
      payload: { password: config.get('prototypePassword') }
    })
    authCookie = loginResponse.headers['set-cookie'][0].split(';')[0]
  })

  afterAll(async () => {
    if (server && typeof server.stop === 'function') {
      await server.stop({ timeout: 0 })
    }
    vi.restoreAllMocks()
  })

  test('Should redirect unauthenticated users to login', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/'
    })
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe('/login')
  })

  test('Should return status code 200 for authenticated GET /', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/',
      headers: {
        cookie: authCookie
      }
    })
    expect(response.statusCode).toBe(200)
  })
})
