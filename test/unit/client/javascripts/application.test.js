import { describe, beforeEach, test, expect, vi } from 'vitest'
import { initAll } from 'govuk-frontend'

vi.mock('govuk-frontend', () => ({
  initAll: vi.fn()
}))

describe('Init client-side javascript', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await vi.importActual('../../../../src/client/javascripts/application.js')
  })

  test('should call init() on all custom client-side javascript modules', () => {
    expect(initAll).toHaveBeenCalled()
  })
})
