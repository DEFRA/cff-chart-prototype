import { describe, beforeAll, afterAll, test, expect } from 'vitest'
import { createServer } from '../../../../src/server.js'

describe('Index route', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should render the index page and return status code 200', async () => {
    const { statusCode, headers } = await server.inject({
      method: 'GET',
      url: '/'
    })

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toContain('text/html')
  })
})
