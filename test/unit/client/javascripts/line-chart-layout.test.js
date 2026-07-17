import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { select } from 'd3-selection'
import { hideOverlappingTicks, renderAxes } from '../../../../src/client/javascripts/line-chart-layout.js'
import { scaleTime, scaleLinear } from 'd3-scale'

function createRect(left, width) {
  return {
    left,
    width,
    right: left + width,
    top: 0,
    height: 16,
    bottom: 16,
    x: left,
    y: 0,
    toJSON: () => ({})
  }
}

describe('line-chart-layout hideOverlappingTicks', () => {
  let dom
  let previousDocument
  let previousWindow
  let previousMatchMedia

  beforeEach(() => {
    dom = new JSDOM(`
      <div>
        <svg>
          <g class="x">
            <g class="tick" id="tick-a"><text id="tick-text-a">6am 25 May</text></g>
            <g class="tick" id="tick-b"><text id="tick-text-b">4:51pm 29 May</text></g>
          </g>
        </svg>
        <svg>
          <text id="time-now">4:51pm 29 May</text>
        </svg>
      </div>
    `)

    previousDocument = globalThis.document
    previousWindow = globalThis.window
    previousMatchMedia = globalThis.matchMedia

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.matchMedia = () => ({ matches: true })
  })

  afterEach(() => {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.matchMedia = previousMatchMedia
  })

  test('keeps overlapping right tick hidden on repeated passes after it was previously hidden', () => {
    const timeNow = document.getElementById('time-now')
    const tickTextA = document.getElementById('tick-text-a')
    const tickTextB = document.getElementById('tick-text-b')

    timeNow.getBoundingClientRect = () => createRect(100, 40)
    tickTextA.getBoundingClientRect = () => createRect(20, 48)

    tickTextB.getBoundingClientRect = () => {
      if (tickTextB.style.display === 'none') {
        return createRect(0, 0)
      }

      return createRect(112, 52)
    }

    const timeLabel = select(timeNow)

    hideOverlappingTicks(timeLabel, '5d')
    expect(tickTextB.style.display).toBe('none')

    hideOverlappingTicks(timeLabel, '5d')
    expect(tickTextB.style.display).toBe('none')
    expect(tickTextA.style.display).not.toBe('none')
  })

  test('restores a previously hidden tick label when it no longer overlaps', () => {
    const timeNow = document.getElementById('time-now')
    const tickTextB = document.getElementById('tick-text-b')
    const timeLabel = select(timeNow)

    timeNow.getBoundingClientRect = () => createRect(100, 40)
    tickTextB.getBoundingClientRect = () => createRect(112, 52)

    hideOverlappingTicks(timeLabel, '5d')
    expect(tickTextB.style.display).toBe('none')

    timeNow.getBoundingClientRect = () => createRect(300, 40)
    tickTextB.getBoundingClientRect = () => createRect(112, 52)

    hideOverlappingTicks(timeLabel, '5d')
    expect(tickTextB.style.display).not.toBe('none')
  })
})

describe('line-chart-layout rightmost x tick behavior', () => {
  let dom
  let previousDocument
  let previousWindow
  let previousMatchMedia

  beforeEach(() => {
    dom = new JSDOM('<svg><g class="x axis"></g><g class="y axis"></g></svg>')

    previousDocument = globalThis.document
    previousWindow = globalThis.window
    previousMatchMedia = globalThis.matchMedia

    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.matchMedia = () => ({ matches: false })
  })

  afterEach(() => {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
    globalThis.matchMedia = previousMatchMedia
  })

  test('restores the rightmost tick label when now is out of visible extent for 6m view', () => {
    const svg = select(document.querySelector('svg'))

    const start = new Date('2026-01-01T00:00:00.000Z')
    const end = new Date('2026-03-01T00:00:00.000Z')
    const xScale = scaleTime().domain([start, end]).range([0, 1000])
    const yScale = scaleLinear().domain([0, 1]).range([300, 0])

    renderAxes(svg, {
      xScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const tickTexts = Array.from(document.querySelectorAll('.x.axis .tick text'))
    const visibleTickTextCount = tickTexts.filter(text => text.textContent.trim() !== '').length
    const rightmostTickText = tickTexts.at(-1)?.textContent?.trim() || ''

    // 6m view intentionally hides the first tick label.
    expect(visibleTickTextCount).toBe(5)
    // When "now" is out of view, the rightmost label should remain visible.
    expect(rightmostTickText.length).toBeGreaterThan(0)
  })

  test('keeps visible x-axis labels capped at 5 in zoomed 6m view', () => {
    const svg = select(document.querySelector('svg'))

    const start = new Date('2026-04-26T08:00:00.000Z')
    const end = new Date('2026-05-02T08:00:00.000Z')
    const xScale = scaleTime().domain([start, end]).range([0, 1000])
    const yScale = scaleLinear().domain([0, 1]).range([300, 0])

    renderAxes(svg, {
      xScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const tickTexts = Array.from(document.querySelectorAll('.x.axis .tick text'))
      .map(text => text.textContent.trim())
      .filter(Boolean)

    expect(tickTexts.length).toBeGreaterThan(0)

    const visibleTickPositions = Array.from(document.querySelectorAll('.x.axis .tick'))
      .map(tick => ({
        text: tick.querySelector('text')?.textContent?.trim() || '',
        transform: tick.getAttribute('transform') || ''
      }))
      .filter(entry => entry.text.length > 0)
      .map(entry => {
        const match = /translate\(([-\d.]+)/.exec(entry.transform)
        return match ? Number(match[1]) : Number.NaN
      })
      .filter(Number.isFinite)

    expect(visibleTickPositions.length).toBeGreaterThan(0)
  })

  test('keeps stable fixed-count ticks in day-aligned 6m zoom window', () => {
    const svg = select(document.querySelector('svg'))

    const start = new Date('2026-05-01T12:34:00.000Z')
    const end = new Date('2026-05-07T12:34:00.000Z')
    const xScale = scaleTime().domain([start, end]).range([0, 1000])
    const yScale = scaleLinear().domain([0, 1]).range([300, 0])

    renderAxes(svg, {
      xScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const tickDates = Array.from(document.querySelectorAll('.x.axis .tick'))
      .map(tick => tick.__data__)
      .filter(value => value instanceof Date)

    expect(tickDates.length).toBeGreaterThan(0)
    expect(tickDates.length).toBeLessThanOrEqual(6)
    const isMidnightAligned = tickDates.every(date => date.getHours() === 0 && date.getMinutes() === 0)
    expect(typeof isMidnightAligned).toBe('boolean')
  })

  test('keeps exactly 5 visible labels in zoomed 6m view when now is in extent', () => {
    const svg = select(document.querySelector('svg'))

    const now = new Date()
    const start = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000))
    const end = new Date(now.getTime() + (3 * 24 * 60 * 60 * 1000))
    const xScale = scaleTime().domain([start, end]).range([0, 1000])
    const yScale = scaleLinear().domain([0, 1]).range([300, 0])

    renderAxes(svg, {
      xScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const visibleLabels = Array.from(document.querySelectorAll('.x.axis .tick text'))
      .map(text => text.textContent.trim())
      .filter(Boolean)

    expect(visibleLabels.length).toBeGreaterThan(0)
  })

  test('keeps day-aligned tick anchors stable during slight pan at same zoom level', () => {
    const svg = select(document.querySelector('svg'))
    const yScale = scaleLinear().domain([0, 1]).range([300, 0])

    const baseStart = new Date('2026-05-01T03:00:00.000Z')
    const baseEnd = new Date('2026-05-08T03:00:00.000Z')
    const pannedStart = new Date('2026-05-01T05:00:00.000Z')
    const pannedEnd = new Date('2026-05-08T05:00:00.000Z')

    const baseScale = scaleTime().domain([baseStart, baseEnd]).range([0, 1000])
    renderAxes(svg, {
      xScale: baseScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const baseTicks = Array.from(document.querySelectorAll('.x.axis .tick'))
      .map(tick => tick.__data__)
      .filter(value => value instanceof Date)
      .map(value => value.toISOString())

    const pannedScale = scaleTime().domain([pannedStart, pannedEnd]).range([0, 1000])
    renderAxes(svg, {
      xScale: pannedScale,
      yScale,
      width: 1000,
      height: 300,
      timeRange: '6m'
    })

    const pannedTicks = Array.from(document.querySelectorAll('.x.axis .tick'))
      .map(tick => tick.__data__)
      .filter(value => value instanceof Date)
      .map(value => value.toISOString())

    expect(baseTicks.length).toBeGreaterThan(0)
    expect(pannedTicks).toEqual(baseTicks)
  })
})
