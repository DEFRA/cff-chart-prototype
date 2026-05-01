import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'
import { config } from '../../../../src/config/config.js'

describe('Login routes', () => {
  let server
  const testPassword = config.get('prototypePassword')

  beforeEach(async () => {
    vi.clearAllMocks()
    server = await createServer()
    await server.initialize()
  })

  afterEach(async () => {
    await server.stop({ timeout: 0 })
  })

  describe('GET /login', () => {
    test('Should render login page and return status code 200', async () => {
      const { statusCode, headers, payload } = await server.inject({
        method: 'GET',
        url: '/login'
      })

      expect(statusCode).toBe(200)
      expect(headers['content-type']).toContain('text/html')
      expect(payload).toContain('Sign in')
      expect(payload).toContain('Password')
    })

    test('Should not show error message on initial load', async () => {
      const { payload } = await server.inject({
        method: 'GET',
        url: '/login'
      })

      expect(payload).not.toContain('There is a problem')
      expect(payload).not.toContain('The password you entered is incorrect')
    })

    test('Should redirect to home if already authenticated', async () => {
      // First, log in to get a session cookie
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Now try to access login page with authenticated session
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/login',
        headers: {
          cookie
        }
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/')
    })
  })

  describe('POST /login', () => {
    test('Should authenticate with correct password and redirect to home', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/')
      expect(headers['set-cookie']).toBeDefined()
    })

    test('Should show error with incorrect password', async () => {
      const { statusCode, payload } = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: 'wrongpassword' }
      })

      expect(statusCode).toBe(401)
      expect(payload).toContain('There is a problem')
      expect(payload).toContain('The password you entered is incorrect')
    })

    test('Should show error with empty password', async () => {
      const { statusCode, payload } = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: '' }
      })

      expect(statusCode).toBe(401)
      expect(payload).toContain('There is a problem')
    })

    test('Should show error with missing password field', async () => {
      const { statusCode, payload } = await server.inject({
        method: 'POST',
        url: '/login',
        payload: {}
      })

      expect(statusCode).toBe(401)
      expect(payload).toContain('There is a problem')
    })

    test('Should set session cookie on successful login', async () => {
      const { headers } = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const setCookie = headers['set-cookie']
      expect(setCookie).toBeDefined()
      expect(setCookie[0]).toContain('fcp-defra-id-stub-session')
    })

    test('Should allow access to protected route after login', async () => {
      // Login
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Access protected route
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/',
        headers: {
          cookie
        }
      })

      expect(statusCode).toBe(200)
    })
  })

  describe('GET /logout', () => {
    test('Should clear session and redirect to login', async () => {
      // First, log in
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Now logout
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/logout',
        headers: {
          cookie
        }
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/login')
    })

    test('Should not allow access to protected routes after logout', async () => {
      // Login
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Logout
      const logoutResponse = await server.inject({
        method: 'GET',
        url: '/logout',
        headers: {
          cookie
        }
      })

      const newCookie = logoutResponse.headers['set-cookie'][0].split(';')[0]

      // Try to access protected route with cleared session
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/',
        headers: {
          cookie: newCookie
        }
      })

      expect(statusCode).toBe(302) // Should redirect to login
    })

    test('Should be accessible without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/logout'
      })

      expect(statusCode).toBe(302)
    })
  })
})
