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

describe('interactive chart rendering', () => {
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
        <span id="chart-visible-range">5 days</span>
        <span id="chart-resolution-label"></span>
        <div class="defra-line-chart__control-row"></div>
        <a class="time-filter-link" data-filter="5d" href="#line-chart">5 days</a>
        <a class="time-filter-link" data-filter="6m" href="#line-chart">6 months</a>
        <input id="threshold-top-normal" type="checkbox" checked>
      </body>
    `)

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.flood = {
      model: {
        id: '3089',
        telemetry: { observed: [{ dateTime: new Date().toISOString(), value: 1.1 }] },
        historicData: [{ dateTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), value: 1.2 }]
      }
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.flood = previousFlood
  })

  test('renders the interactive chart and thresholds without a style selection', async () => {
    vi.resetModules()
    await vi.importActual('../../../../src/client/javascripts/application.js')

    const { lineChart: renderChart } = await import('../../../../src/client/javascripts/line-chart.js')
    expect(renderChart).toHaveBeenLastCalledWith('line-chart', globalThis.flood.model.telemetry, expect.objectContaining({
      timeRange: '5d',
      enableZoom: false,
      preserveAllPoints: false,
      activeThresholdId: 'top-normal',
      thresholds: expect.arrayContaining([expect.objectContaining({ id: 'top-normal' })])
    }))
    expect(document.querySelector('.defra-line-chart__control-row').style.display).toBe('none')
  })

  test('enables zoom and merges historic data for longer time ranges', async () => {
    vi.resetModules()
    await vi.importActual('../../../../src/client/javascripts/application.js')

    document.querySelector('[data-filter="6m"]').click()

    const { lineChart: renderChart } = await import('../../../../src/client/javascripts/line-chart.js')
    expect(renderChart).toHaveBeenLastCalledWith('line-chart', {
      observed: [...globalThis.flood.model.historicData, ...globalThis.flood.model.telemetry.observed]
    }, expect.objectContaining({ timeRange: '6m', enableZoom: true, preserveAllPoints: false }))
    expect(document.querySelector('.defra-line-chart__control-row').style.display).toBe('')
  })

  test('enables stepped rendering and labels daily maxima for the single-timeline chart', async () => {
    vi.resetModules()
    globalThis.flood.model.chartStyle = 'styleB'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ readings: globalThis.flood.model.historicData })
    }))
    await vi.importActual('../../../../src/client/javascripts/application.js')

    const { lineChart: renderChart } = await import('../../../../src/client/javascripts/line-chart.js')
    await vi.waitFor(() => expect(renderChart).toHaveBeenCalled())
    expect(renderChart).toHaveBeenLastCalledWith('line-chart', {
      observed: [...globalThis.flood.model.historicData, ...globalThis.flood.model.telemetry.observed]
    }, expect.objectContaining({
      timeRange: '3y',
      enableZoom: true,
      preserveAllPoints: true,
      steppedZoom: true,
      initialZoomDomain: expect.any(Array)
    }))
    const options = renderChart.mock.lastCall[2]
    options.onRangeChange({ label: '15 days' })
    expect(document.getElementById('chart-visible-range').textContent).toBe('15 days')
    options.onRangeChange({ label: '3 years' })
    expect(document.getElementById('chart-resolution-label').textContent).toBe(' (daily maximum)')
    options.onRangeChange({ label: '2 years' })
    expect(document.getElementById('chart-resolution-label').textContent).toBe('')
  })

  test('requests fresh history for style B even when no stored history is advertised', async () => {
    vi.resetModules()
    globalThis.flood.model.chartStyle = 'styleB'
    globalThis.flood.model.historicData = []
    globalThis.flood.model.historicDataAvailable = false
    const historic = [{ dateTime: new Date(Date.now() - 7 * 86400000).toISOString(), value: 0.3 }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ readings: historic })
    }))
    await vi.importActual('../../../../src/client/javascripts/application.js')
    const { lineChart: renderChart } = await import('../../../../src/client/javascripts/line-chart.js')
    await vi.waitFor(() => expect(renderChart).toHaveBeenCalled())

    expect(fetch).toHaveBeenCalledWith('/station/historic-data?stationId=3089&refresh=true', expect.any(Object))
    expect(renderChart).toHaveBeenLastCalledWith('line-chart', {
      observed: [...historic, ...globalThis.flood.model.telemetry.observed]
    }, expect.objectContaining({ preserveAllPoints: true }))
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  test('shows a visible warning when automatic history loading fails', async () => {
    vi.resetModules()
    globalThis.flood.model.chartStyle = 'styleB'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await vi.importActual('../../../../src/client/javascripts/application.js')

    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')?.textContent)
      .toContain('Historic readings could not be loaded'))
  })
})
