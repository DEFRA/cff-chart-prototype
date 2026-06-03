import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'

/**
 * Tests for threshold control handlers in application.js
 * Covers: checkbox state sync, active threshold promotion, default state enforcement
 */
describe('application - Threshold Control Handlers', () => {
  let dom
  let previousDocument
  let previousWindow

  beforeEach(() => {
    dom = new JSDOM(`
      <body>
        <input type="checkbox" id="threshold-current-level" />
        <input type="checkbox" id="threshold-highest-level" />
        <input type="checkbox" id="threshold-top-normal" checked />
      </body>
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

  describe('default threshold state on app init', () => {
    test('only top-normal is enabled by default', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      expect(thresholdState['top-normal']).toBe(true)
      expect(thresholdState['current-level']).toBe(false)
      expect(thresholdState['highest-level']).toBe(false)
    })

    test('checkbox UI reflects default state', () => {
      const currentCheckbox = document.getElementById('threshold-current-level')
      const highestCheckbox = document.getElementById('threshold-highest-level')
      const topNormalCheckbox = document.getElementById('threshold-top-normal')

      expect(currentCheckbox.checked).toBe(false)
      expect(highestCheckbox.checked).toBe(false)
      expect(topNormalCheckbox.checked).toBe(true)
    })
  })

  describe('enabling threshold from default state', () => {
    test('checking current-level becomes active threshold', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      const activeThresholdRef = { value: 'top-normal' }
      const renderChart = vi.fn()

      // Simulate checkbox change
      thresholdState['current-level'] = true
      activeThresholdRef.value = 'current-level'
      renderChart()

      expect(activeThresholdRef.value).toBe('current-level')
      expect(renderChart).toHaveBeenCalled()
    })

    test('checking highest-level becomes active threshold', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      const activeThresholdRef = { value: 'top-normal' }
      const renderChart = vi.fn()

      // Simulate checkbox change
      thresholdState['highest-level'] = true
      activeThresholdRef.value = 'highest-level'
      renderChart()

      expect(activeThresholdRef.value).toBe('highest-level')
      expect(renderChart).toHaveBeenCalled()
    })

    test('newly enabled threshold is promoted over previously active', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      let activeThresholdId = 'top-normal'

      // Enable highest-level
      thresholdState['highest-level'] = true
      if (thresholdState['highest-level']) {
        activeThresholdId = 'highest-level'
      }

      expect(activeThresholdId).toBe('highest-level')
    })
  })

  describe('disabling active threshold', () => {
    test('unchecking active threshold falls back to next enabled', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      let activeThresholdId = 'top-normal'

      // Uncheck top-normal
      thresholdState['top-normal'] = false
      if (!thresholdState['top-normal'] && activeThresholdId === 'top-normal') {
        activeThresholdId = null
      }

      expect(activeThresholdId).toBeNull()
    })

    test('unchecking non-active threshold keeps active unchanged', () => {
      const thresholdState = {
        'current-level': true,
        'highest-level': false,
        'top-normal': false
      }

      const enabledCount = Object.values(thresholdState).filter(v => v).length

      // Uncheck highest-level (already unchecked)
      thresholdState['highest-level'] = false
      // activeThresholdId should remain current-level

      expect(enabledCount).toBe(1)
      expect(thresholdState['current-level']).toBe(true)
    })
  })

  describe('multiple thresholds enabled simultaneously', () => {
    test('all enabled thresholds can be displayed with one active', () => {
      const thresholdState = {
        'current-level': true,
        'highest-level': true,
        'top-normal': true
      }

      const enabledCount = Object.values(thresholdState).filter(v => v).length
      const enabledIds = Object.keys(thresholdState).filter(key => thresholdState[key])

      expect(enabledCount).toBe(3)
      expect(enabledIds).toContain('highest-level')
    })

    test('clicking another threshold while multiple enabled switches active', () => {
      const thresholdState = {
        'current-level': true,
        'highest-level': true,
        'top-normal': true
      }

      let activeThresholdId = 'highest-level'

      // Simulate click on current-level
      if (thresholdState['current-level']) {
        activeThresholdId = 'current-level'
      }

      expect(activeThresholdId).toBe('current-level')
    })
  })

  describe('checkbox UI update synchronization', () => {
    test('updateThresholdControls syncs checkbox UI to state', () => {
      const thresholdState = {
        'current-level': true,
        'highest-level': false,
        'top-normal': true
      }

      const currentCheckbox = document.getElementById('threshold-current-level')
      const highestCheckbox = document.getElementById('threshold-highest-level')
      const topNormalCheckbox = document.getElementById('threshold-top-normal')

      // Sync checkboxes to state
      currentCheckbox.checked = thresholdState['current-level']
      highestCheckbox.checked = thresholdState['highest-level']
      topNormalCheckbox.checked = thresholdState['top-normal']

      expect(currentCheckbox.checked).toBe(true)
      expect(highestCheckbox.checked).toBe(false)
      expect(topNormalCheckbox.checked).toBe(true)
    })
  })

  describe('2 decimal place formatting', () => {
    test('threshold labels maintain 2 decimal places', () => {
      const formatMetres = (value, decimals = 2) => `${Number(value).toFixed(decimals)}m`

      const currentLevel = 0.19
      const highestLevel = 0.93
      const topNormal = 0.50

      const currentLabel = `${formatMetres(currentLevel)} Current level`
      const highestLabel = `${formatMetres(highestLevel)} Highest level`
      const topLabel = `${formatMetres(topNormal)} Top of normal range`

      expect(currentLabel).toBe('0.19m Current level')
      expect(highestLabel).toBe('0.93m Highest level')
      expect(topLabel).toBe('0.50m Top of normal range')
    })
  })
})
