import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest'
import { createServer } from '../../../../src/server.js'
import { config } from '../../../../src/config/config.js'

vi.mock('../../../../src/lib/flood-service.js', () => ({
  getStation: vi.fn().mockResolvedValue({
    '@id': 'http://environment.data.gov.uk/flood-monitoring/id/stations/3089',
    RLOIid: '3089',
    label: 'Test Station',
    stationReference: 'E3089',
    riverName: 'Test River',
    town: 'Test Town',
    measures: [{
      '@id': 'http://environment.data.gov.uk/flood-monitoring/id/measures/3089-level-stage-i-15_min-mASD',
      parameter: 'level',
      parameterName: 'Water Level',
      unitName: 'mASD'
    }]
  }),
  getStationReadings: vi.fn().mockResolvedValue([
    {
      '@id': 'http://environment.data.gov.uk/flood-monitoring/data/readings/3089-level-stage-i-15_min-mASD/2024-01-01T00:00:00Z',
      dateTime: '2024-01-01T00:00:00Z',
      measure: 'http://environment.data.gov.uk/flood-monitoring/id/measures/3089-level-stage-i-15_min-mASD',
      value: 1.234
    },
    {
      '@id': 'http://environment.data.gov.uk/flood-monitoring/data/readings/3089-level-stage-i-15_min-mASD/2024-01-01T00:15:00Z',
      dateTime: '2024-01-01T00:15:00Z',
      measure: 'http://environment.data.gov.uk/flood-monitoring/id/measures/3089-level-stage-i-15_min-mASD',
      value: 1.245
    }
  ]),
  formatStationData: vi.fn().mockImplementation((stationData, readings) => {
    return {
      id: stationData?.RLOIid || '3089',
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
      rloiId: stationData?.RLOIid || '3089'
    }
  }),
  formatTelemetryData: vi.fn().mockImplementation((readings) => ({
    observed: readings?.map(r => ({
      dateTime: r.dateTime,
      value: r.value
    })) || []
  }))
}))

describe('Auth plugin', () => {
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

  describe('Authentication protection', () => {
    test('Should redirect unauthenticated requests to login page', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/'
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/login')
    })

    test('Should allow authenticated requests to protected routes', async () => {
      // Login first
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Access protected route
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/',
        headers: { cookie }
      })

      expect(statusCode).toBe(200)
      expect(headers['content-type']).toContain('text/html')
    })

    test('Should protect station route from unauthenticated access', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/station?stationId=3089'
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/login')
    })

    test('Should allow access to station route when authenticated', async () => {
      // Login
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Access station route
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/station?stationId=3089',
        headers: { cookie }
      })

      expect(statusCode).toBe(200)
    }, 15000)
  })

  describe('Unauthenticated routes', () => {
    test('Should allow access to login page without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/login'
      })

      expect(statusCode).toBe(200)
    })

    test('Should allow access to health check without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/health'
      })

      expect(statusCode).toBe(200)
    })

    test('Should allow access to health connectivity check without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/health/connectivity'
      })

      expect(statusCode).toBe(200)
    })

    test('Should allow access to static assets without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/public/stylesheets/application.scss'
      })

      // May return 404 if file doesn't exist, but shouldn't redirect to login
      expect(statusCode).not.toBe(302)
    })

    test('Should allow access to favicon without authentication', async () => {
      const { statusCode } = await server.inject({
        method: 'GET',
        url: '/favicon.ico'
      })

      expect(statusCode).toBe(204)
    })
  })

  describe('Session management', () => {
    test('Should maintain authentication across multiple requests', async () => {
      // Login
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Make multiple requests with same cookie
      const response1 = await server.inject({
        method: 'GET',
        url: '/',
        headers: { cookie }
      })

      const response2 = await server.inject({
        method: 'GET',
        url: '/station?stationId=3089',
        headers: { cookie }
      })

      expect(response1.statusCode).toBe(200)
      expect(response2.statusCode).toBe(200)
    })

    test('Should not redirect to login when already on login page', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/login'
      })

      expect(statusCode).toBe(200)
      expect(headers.location).toBeUndefined()
    })

    test('Should invalidate session after logout', async () => {
      // Login
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      // Verify authenticated
      const beforeLogout = await server.inject({
        method: 'GET',
        url: '/',
        headers: { cookie }
      })
      expect(beforeLogout.statusCode).toBe(200)

      // Logout
      const logoutResponse = await server.inject({
        method: 'GET',
        url: '/logout',
        headers: { cookie }
      })

      const newCookie = logoutResponse.headers['set-cookie'][0].split(';')[0]

      // Try to access protected route
      const afterLogout = await server.inject({
        method: 'GET',
        url: '/',
        headers: { cookie: newCookie }
      })

      expect(afterLogout.statusCode).toBe(302)
      expect(afterLogout.headers.location).toBe('/login')
    })
  })

  describe('Authentication scheme', () => {
    test('Should use session-based authentication', async () => {
      // Without session, should be redirected
      const unauthenticated = await server.inject({
        method: 'GET',
        url: '/'
      })

      expect(unauthenticated.statusCode).toBe(302)

      // With valid session, should be allowed
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/login',
        payload: { password: testPassword }
      })

      const cookie = loginResponse.headers['set-cookie'][0].split(';')[0]

      const authenticated = await server.inject({
        method: 'GET',
        url: '/',
        headers: { cookie }
      })

      expect(authenticated.statusCode).toBe(200)
    })

    test('Should reject requests with invalid or missing session cookie', async () => {
      const { statusCode, headers } = await server.inject({
        method: 'GET',
        url: '/',
        headers: {
          cookie: 'fcp-defra-id-stub-session=invalid'
        }
      })

      expect(statusCode).toBe(302)
      expect(headers.location).toBe('/login')
    })
  })
})
