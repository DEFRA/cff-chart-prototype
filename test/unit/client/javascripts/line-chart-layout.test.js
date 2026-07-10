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
})
