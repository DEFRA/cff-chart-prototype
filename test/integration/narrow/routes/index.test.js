import { describe, beforeAll, afterAll, test, expect } from 'vitest'
import { createServer } from '../../../../src/server.js'
import { config } from '../../../../src/config/config.js'

describe('Index route', () => {
  let server
  let authCookie

  beforeAll(async () => {
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
    await server.stop({ timeout: 0 })
  })

  test('Should redirect unauthenticated users to login', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(statusCode).toBe(302)
    expect(headers.location).toBe('/login')
  })

  test('Should render the index page for authenticated users and return status code 200', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/',
      headers: {
        cookie: authCookie
      }
    })

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toContain('text/html')
  })
})
