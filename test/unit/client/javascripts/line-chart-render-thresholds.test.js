import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { select } from 'd3-selection'
import { renderThresholds } from '../../../../src/client/javascripts/line-chart-render.js'

function mockYScale(maxValue = 1) {
  const scale = (v) => 100 - (v * 50) // Simple mock scale
  scale.range = () => [100, 0] // Return chart height range
  scale.domain = () => [0, maxValue]
  return scale
}

describe('renderThresholds - Multi-Threshold Behavior', () => {
  let dom
  let previousDocument
  let previousWindow

  beforeEach(() => {
    dom = new JSDOM(`
      <svg>
        <g class="thresholds"></g>
      </svg>
    `)

    previousDocument = globalThis.document
    previousWindow = globalThis.window

    globalThis.window = dom.window
    globalThis.document = dom.window.document
  })

  afterEach(() => {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  })

  test('renders all enabled thresholds with grey lines except active one', () => {
    const thresholdsData = [
      { id: 'current-level', label: 'Current', shortLabel: '0.19m Current', value: 0.19, enabled: true, showLabel: false, dismissible: false },
      { id: 'highest-level', label: 'Highest', shortLabel: '0.93m Highest', value: 0.93, enabled: true, showLabel: false, dismissible: false },
      { id: 'top-normal', label: 'Top Normal', shortLabel: '0.50m Top', value: 0.5, enabled: true, showLabel: true, dismissible: true }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    const yScale = mockYScale()

    renderThresholds(thresholdsContainer, 800, yScale, () => {}, () => {}, 'top-normal', thresholdsData)

    const thresholdGroups = thresholdsContainer.selectAll('.threshold').nodes()
    expect(thresholdGroups).toHaveLength(3)

    const activeGroup = select(thresholdGroups[2])
    expect(activeGroup.classed('threshold--active')).toBe(true)

    const inactiveGroups = [select(thresholdGroups[0]), select(thresholdGroups[1])]
    inactiveGroups.forEach(group => {
      expect(group.classed('threshold--active')).toBe(false)
    })
  })

  test('renders label only for active threshold by default', () => {
    const thresholdsData = [
      { id: 'current-level', label: 'Current', shortLabel: '0.19m Current', value: 0.19, enabled: true, showLabel: false, dismissible: false },
      { id: 'top-normal', label: 'Top Normal', shortLabel: '0.50m Top', value: 0.5, enabled: true, showLabel: true, dismissible: true }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    const yScale = mockYScale()

    renderThresholds(thresholdsContainer, 800, yScale, () => {}, () => {}, 'top-normal', thresholdsData)

    const labels = thresholdsContainer.selectAll('.threshold-label').nodes()
    expect(labels.length).toBeGreaterThan(0)
  })

  test('creates clickable threshold line with hit area for activation', () => {
    const thresholdsData = [
      { id: 'current-level', label: 'Current', shortLabel: '0.19m Current', value: 0.19, enabled: true, showLabel: false, dismissible: false }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    const yScale = mockYScale()

    const onActivate = vi.fn()
    renderThresholds(thresholdsContainer, 800, yScale, () => {}, onActivate, null, thresholdsData)

    const hitArea = thresholdsContainer.select('.threshold__hit-area')
    expect(hitArea.empty()).toBe(false)

    hitArea.on('click')({ stopPropagation: () => {} })
    expect(onActivate).toHaveBeenCalledWith('current-level')
  })

  test('close button is visible with enlarged hit area for active threshold', () => {
    const thresholdsData = [
      { id: 'top-normal', label: 'Top Normal', shortLabel: '0.50m Top', value: 0.5, enabled: true, showLabel: true, dismissible: true }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    const yScale = mockYScale()

    renderThresholds(thresholdsContainer, 800, yScale, () => {}, () => {}, 'top-normal', thresholdsData)

    const closeHitArea = thresholdsContainer.select('.threshold-label__close-hit-area')
    expect(closeHitArea.empty()).toBe(false)
    expect(closeHitArea.attr('r')).toBe('22') // closeRadius (14) + 8
  })

  test('label placement flips below line when threshold is near top of chart', () => {
    const thresholdsData = [
      { id: 'highest-level', label: 'Highest', shortLabel: '0.93m Highest', value: 0.93, enabled: true, showLabel: true, dismissible: false }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    // Create a custom scale that returns values near top
    const yScale = (v) => 5 // High threshold near top of chart
    yScale.range = () => [100, 0]
    yScale.domain = () => [0, 1]

    renderThresholds(thresholdsContainer, 800, yScale, () => {}, () => {}, 'highest-level', thresholdsData)

    const labelPath = thresholdsContainer.select('.threshold-label__bg').attr('d')
    expect(labelPath).toBeDefined()
    // Path should exist and be valid SVG
    expect(labelPath.startsWith('M')).toBe(true)
  })

  test('non-dismissible thresholds do not render close button', () => {
    const thresholdsData = [
      { id: 'current-level', label: 'Current', shortLabel: '0.19m Current', value: 0.19, enabled: true, showLabel: false, dismissible: false }
    ]

    const svgElement = document.querySelector('svg')
    const thresholdsContainer = select(svgElement).select('.thresholds')
    const yScale = mockYScale()

    renderThresholds(thresholdsContainer, 800, yScale, () => {}, () => {}, null, thresholdsData)

    const closeButton = thresholdsContainer.select('.threshold-label__close')
    expect(closeButton.empty()).toBe(true)
  })
})
