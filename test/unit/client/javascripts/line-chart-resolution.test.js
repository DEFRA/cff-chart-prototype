import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { lineChart } from '../../../../src/client/javascripts/line-chart.js'
import { setupZoomControls } from '../../../../src/client/javascripts/application-ui.js'
import { TIMELINE_ZOOM_STEPS } from '../../../../src/client/javascripts/chart-stepped-zoom.js'

describe('line-chart full-resolution rendering', () => {
  let dom

  beforeEach(() => {
    dom = new JSDOM('<div id="line-chart"></div>')
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn() }))
    vi.stubGlobal('addEventListener', dom.window.addEventListener.bind(dom.window))
    vi.stubGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  test('plots original quarter-hour readings on initial render, zoom, pan and resize', () => {
    const start = Date.now() - 200 * 86400000
    const observed = Array.from({ length: 200 * 96 }, (_, index) => ({
      dateTime: new Date(start + index * 15 * 60000).toISOString(),
      value: 0.2 + (index % 10) / 100
    }))
    const container = lineChart('line-chart', { observed, forecast: [], type: 'river' }, {
      timeRange: '3y',
      enableZoom: true,
      preserveAllPoints: true,
      initialZoomDomain: [new Date(Date.now() - 5 * 86400000), new Date()]
    })
    const plottedPoints = () => document.querySelector('.observed-line').__data__
    const expectOriginalReadings = (points) => {
      const originals = new Map(observed.map(point => [point.dateTime, point.value]))
      expect(points.length).toBeGreaterThan(0)
      expect(points.every(point => originals.get(point.dateTime) === point.value)).toBe(true)
      for (let index = 1; index < points.length; index++) {
        expect(new Date(points[index].dateTime) - new Date(points[index - 1].dateTime)).toBe(15 * 60000)
      }
    }

    const initialPoints = plottedPoints()
    expect(initialPoints.length).toBeGreaterThanOrEqual(5 * 96)
    expectOriginalReadings(initialPoints)

    container.applyZoomTransform({ k: 1, x: 0, y: 0 })
    expect(plottedPoints()).toHaveLength(observed.length)
    expectOriginalReadings(plottedPoints())

    container.applyZoomTransform({ k: 2, x: 0, y: 0 })
    const beforePan = plottedPoints()
    expectOriginalReadings(beforePan)
    container.panBy(-100)
    expectOriginalReadings(plottedPoints())
    expect(plottedPoints()[0].dateTime).not.toBe(beforePan[0].dateTime)

    dom.window.dispatchEvent(new dom.window.Event('resize'))
    expect(plottedPoints()).toHaveLength(observed.length)
    expectOriginalReadings(plottedPoints())
  })

  function createSteppedChart () {
    const end = new Date('2026-10-31T12:00:00Z')
    const observed = Array.from({ length: 1100 }, (_, index) => ({
      dateTime: new Date(Number(end) - (1099 - index) * 86400000).toISOString(),
      value: 0.2
    }))
    const onRangeChange = vi.fn()
    const container = lineChart('line-chart', { observed, forecast: [], type: 'river' }, {
      timeRange: '3y',
      enableZoom: true,
      preserveAllPoints: true,
      steppedZoom: true,
      initialZoomDomain: [new Date(Number(end) - 5 * 86400000), end],
      onRangeChange
    })
    return { container, end, onRangeChange }
  }

  test('uses the exact named calendar windows in both directions and keeps the right edge fixed', () => {
    const { container, end, onRangeChange } = createSteppedChart()
    for (let index = 0; index < TIMELINE_ZOOM_STEPS.length; index++) {
      const step = TIMELINE_ZOOM_STEPS[index]
      const domain = container.getVisibleDomain()
      expect(Math.abs(Number(domain[0]) - Number(step.start(end)))).toBeLessThanOrEqual(1)
      expect(Math.abs(Number(domain[1]) - Number(end))).toBeLessThanOrEqual(1)
      expect(onRangeChange).toHaveBeenLastCalledWith({ label: step.label, domain })
      expect(container.getZoomControlState()).toMatchObject({
        canZoomIn: index > 0,
        canZoomOut: index < TIMELINE_ZOOM_STEPS.length - 1
      })
      container.zoomOut()
    }

    for (let index = TIMELINE_ZOOM_STEPS.length - 1; index >= 0; index--) {
      expect(onRangeChange.mock.lastCall[0].label).toBe(TIMELINE_ZOOM_STEPS[index].label)
      container.zoomIn()
    }
    expect(container.getZoomControlState().canReset).toBe(false)
  })

  test('spaces six ticks across five daily intervals in the 5, 10 and 15 day windows', () => {
    const { container, onRangeChange } = createSteppedChart()
    for (const days of [5, 10, 15]) {
      const domain = container.getVisibleDomain()
      expect(Math.abs(Number(domain[1]) - Number(domain[0]) - days * 86400000)).toBeLessThanOrEqual(1)
      expect(onRangeChange.mock.lastCall[0].label).toBe(`${days} days`)
      const ticks = Array.from(document.querySelectorAll('.x.axis .tick'), tick => Number(tick.__data__))
      expect(ticks).toHaveLength(6)
      for (let index = 1; index < ticks.length; index++) {
        expect(Math.abs(ticks[index] - ticks[index - 1] - days / 5 * 86400000)).toBeLessThanOrEqual(1)
      }
      container.zoomOut()
    }
  })

  test('retains the panned right edge on zoom and the visible window on resize; reset restores five days', () => {
    const { container, end, onRangeChange } = createSteppedChart()
    container.zoomOut()
    container.panBy(100)
    const pannedEnd = container.getVisibleDomain()[1]
    expect(Number(pannedEnd)).toBeLessThan(Number(end))
    container.zoomOut()
    expect(Math.abs(Number(container.getVisibleDomain()[1]) - Number(pannedEnd))).toBeLessThanOrEqual(1)
    const beforeResize = container.getVisibleDomain().map(Number)
    dom.window.dispatchEvent(new dom.window.Event('resize'))
    expect(container.getVisibleDomain().map(Number)).toEqual(beforeResize)
    expect(onRangeChange.mock.lastCall[0].label).toBe('15 days')

    container.resetZoom()
    expect(onRangeChange.mock.lastCall[0].label).toBe('5 days')
    expect(Math.abs(Number(container.getVisibleDomain()[1]) - Number(end))).toBeLessThanOrEqual(1)
  })

  test('uses the named steps for wheel and pinch gestures', () => {
    const { container, onRangeChange } = createSteppedChart()
    const svg = document.querySelector('svg')
    svg.dispatchEvent(new dom.window.WheelEvent('wheel', { deltaY: 100, cancelable: true }))
    expect(onRangeChange.mock.lastCall[0].label).toBe('10 days')

    const touch = (type, distance) => {
      const event = new dom.window.Event(type, { cancelable: true })
      Object.defineProperty(event, 'touches', { value: [
        { clientX: 100, clientY: 100 },
        { clientX: 100 + distance, clientY: 100 }
      ] })
      svg.dispatchEvent(event)
    }
    touch('touchstart', 100)
    touch('touchmove', 70)
    expect(onRangeChange.mock.lastCall[0].label).toBe('15 days')
    touch('touchmove', 50)
    expect(onRangeChange.mock.lastCall[0].label).toBe('15 days')
    touch('touchend', 50)
    touch('touchstart', 100)
    touch('touchmove', 130)
    expect(onRangeChange.mock.lastCall[0].label).toBe('10 days')
    expect(container.getZoomControlState().canZoomIn).toBe(true)
  })

  test('updates button limits for the five-day and three-year steps', () => {
    const { container } = createSteppedChart()
    for (const id of ['pan-left-btn', 'pan-right-btn', 'zoom-in-btn', 'zoom-out-btn', 'zoom-reset-btn']) {
      const button = document.createElement('button')
      button.id = id
      document.body.append(button)
    }
    vi.stubGlobal('flood', { model: { chartStyle: 'styleB' } })
    setupZoomControls()
    expect(document.getElementById('zoom-in-btn').disabled).toBe(true)
    expect(document.getElementById('zoom-out-btn').disabled).toBe(false)
    expect(document.getElementById('zoom-reset-btn').disabled).toBe(true)
    for (let index = 1; index < TIMELINE_ZOOM_STEPS.length; index++) container.zoomOut()
    expect(document.getElementById('zoom-in-btn').disabled).toBe(false)
    expect(document.getElementById('zoom-out-btn').disabled).toBe(true)
    expect(document.getElementById('zoom-reset-btn').disabled).toBe(false)
    document.getElementById('zoom-reset-btn').click()
    expect(document.getElementById('zoom-in-btn').disabled).toBe(true)
  })
})
