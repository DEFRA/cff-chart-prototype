import { describe, beforeAll, afterAll, test, expect } from 'vitest'
import { createServer } from '../../../../src/server.js'

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
  })

  test('Should load station page with specified station ID', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('level at')
    expect(result).toContain('Latest at')
  })

  test('Should return 404 for non-existent station', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=999999'
    })

    expect(statusCode).toBe(404)
    expect(result).toContain('Station not found')
    expect(result).toContain('999999')
  })

  test('Should return 404 for invalid station ID', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=invalid'
    })

    expect(statusCode).toBe(404)
    expect(result).toContain('Station not found')
  })

  test('Should accept dataType query parameter', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085&dataType=forecast'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('Latest at')
  })

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
  })

  test('Should include chart container in response', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/station?stationId=8085'
    })

    expect(statusCode).toBe(200)
    expect(result).toContain('line-chart')
    expect(result).toContain('defra-line-chart')
  })
})
