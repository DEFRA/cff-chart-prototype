import { describe, beforeEach, afterEach, test, expect, vi } from 'vitest'
import { initAll } from 'govuk-frontend'
import { JSDOM } from 'jsdom'

vi.mock('govuk-frontend', () => ({
  initAll: vi.fn()
}))

vi.mock('../../../../src/client/javascripts/line-chart.js', () => ({
  lineChart: vi.fn()
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

describe('time filter state with historic data availability', () => {
  let previousDocument
  let previousWindow
  let previousFlood

  beforeEach(() => {
    previousDocument = globalThis.document
    previousWindow = globalThis.window
    previousFlood = globalThis.flood

    const dom = new JSDOM(`
      <body>
        <div id="line-chart"></div>
        <a class="time-filter-link" data-filter="5d" href="#line-chart">5 days</a>
        <a class="time-filter-link" data-filter="6m" href="#line-chart">6 months</a>
        <a class="time-filter-link" data-filter="1y" href="#line-chart">1 year</a>
        <a class="time-filter-link" data-filter="3y" href="#line-chart">3 years</a>
      </body>
    `)

    globalThis.window = dom.window
    globalThis.document = dom.window.document
  })

  afterEach(() => {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.flood = previousFlood
  })

  test('disables 6m, 1y and 3y links when no historic data exists', async () => {
    vi.resetModules()
    globalThis.flood = {
      model: {
        id: 'test-station',
        telemetry: { observed: [] },
        historicData: []
      }
    }

    await vi.importActual('../../../../src/client/javascripts/application.js')

    const sixMonthsLink = document.querySelector('[data-filter="6m"]')
    const oneYearLink = document.querySelector('[data-filter="1y"]')
    const threeYearsLink = document.querySelector('[data-filter="3y"]')
    const fiveDaysLink = document.querySelector('[data-filter="5d"]')

    expect(sixMonthsLink.getAttribute('aria-disabled')).toBe('true')
    expect(oneYearLink.getAttribute('aria-disabled')).toBe('true')
    expect(threeYearsLink.getAttribute('aria-disabled')).toBe('true')
    expect(sixMonthsLink.classList.contains('time-filter-link--disabled')).toBe(true)
    expect(oneYearLink.classList.contains('time-filter-link--disabled')).toBe(true)
    expect(threeYearsLink.classList.contains('time-filter-link--disabled')).toBe(true)
    expect(sixMonthsLink.getAttribute('tabindex')).toBe('-1')
    expect(oneYearLink.getAttribute('tabindex')).toBe('-1')
    expect(threeYearsLink.getAttribute('tabindex')).toBe('-1')
    expect(fiveDaysLink.getAttribute('aria-disabled')).toBeNull()
  })

  test('keeps 6m, 1y and 3y links enabled when historic data exists', async () => {
    vi.resetModules()
    globalThis.flood = {
      model: {
        id: 'test-station',
        telemetry: { observed: [] },
        historicData: [{ dateTime: '2026-01-01T00:00:00Z', value: 1.1 }]
      }
    }

    await vi.importActual('../../../../src/client/javascripts/application.js')

    const sixMonthsLink = document.querySelector('[data-filter="6m"]')
    const oneYearLink = document.querySelector('[data-filter="1y"]')
    const threeYearsLink = document.querySelector('[data-filter="3y"]')

    expect(sixMonthsLink.getAttribute('aria-disabled')).toBeNull()
    expect(oneYearLink.getAttribute('aria-disabled')).toBeNull()
    expect(threeYearsLink.getAttribute('aria-disabled')).toBeNull()
    expect(sixMonthsLink.classList.contains('time-filter-link--disabled')).toBe(false)
    expect(oneYearLink.classList.contains('time-filter-link--disabled')).toBe(false)
    expect(threeYearsLink.classList.contains('time-filter-link--disabled')).toBe(false)
    expect(sixMonthsLink.getAttribute('tabindex')).toBeNull()
    expect(oneYearLink.getAttribute('tabindex')).toBeNull()
    expect(threeYearsLink.getAttribute('tabindex')).toBeNull()
  })

  test('keeps 6m, 1y and 3y links enabled when historic data is available but lazy loaded', async () => {
    vi.resetModules()
    globalThis.flood = {
      model: {
        id: '3089',
        telemetry: { observed: [] },
        historicData: [],
        historicDataAvailable: true
      }
    }

    await vi.importActual('../../../../src/client/javascripts/application.js')

    const sixMonthsLink = document.querySelector('[data-filter="6m"]')
    const oneYearLink = document.querySelector('[data-filter="1y"]')
    const threeYearsLink = document.querySelector('[data-filter="3y"]')

    expect(sixMonthsLink.getAttribute('aria-disabled')).toBeNull()
    expect(oneYearLink.getAttribute('aria-disabled')).toBeNull()
    expect(threeYearsLink.getAttribute('aria-disabled')).toBeNull()
    expect(sixMonthsLink.classList.contains('time-filter-link--disabled')).toBe(false)
    expect(oneYearLink.classList.contains('time-filter-link--disabled')).toBe(false)
    expect(threeYearsLink.classList.contains('time-filter-link--disabled')).toBe(false)
  })
})

describe('splash page chart style radio keyboard support', () => {
  let previousDocument
  let previousWindow

  beforeEach(() => {
    previousDocument = globalThis.document
    previousWindow = globalThis.window

    const dom = new JSDOM(`
      <body>
        <form>
          <input type="radio" id="chart-style-a" name="chartStyle" value="styleA" checked>
          <input type="radio" id="chart-style-b" name="chartStyle" value="styleB">
          <input type="radio" id="chart-style-c" name="chartStyle" value="styleC">
        </form>
      </body>
    `)

    globalThis.window = dom.window
    globalThis.document = dom.window.document
  })

  afterEach(() => {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  })

  test('makes each chart style radio tabbable', async () => {
    vi.resetModules()
    await vi.importActual('../../../../src/client/javascripts/application.js')

    const radios = document.querySelectorAll('input[type="radio"][name="chartStyle"]')
    radios.forEach(radio => {
      expect(radio.getAttribute('tabindex')).toBe('0')
    })
  })

  test('selects focused chart style radio on Enter', async () => {
    vi.resetModules()
    await vi.importActual('../../../../src/client/javascripts/application.js')

    const styleARadio = document.getElementById('chart-style-a')
    const styleBRadio = document.getElementById('chart-style-b')

    expect(styleARadio.checked).toBe(true)
    expect(styleBRadio.checked).toBe(false)

    styleBRadio.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(styleARadio.checked).toBe(false)
    expect(styleBRadio.checked).toBe(true)
  })
})
