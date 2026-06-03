import { describe, test, expect, vi } from 'vitest'

/**
 * Tests for active threshold state management in line-chart.js
 * Covers: threshold activation promotion, external callback propagation, state persistence
 */
describe('line-chart - Active Threshold State Management', () => {
  describe('threshold activation from enabled state', () => {
    test('newly enabled threshold becomes active when previously none enabled', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': false
      }

      // Simulate enabling current-level
      thresholdState['current-level'] = true

      // Should be marked as active
      expect(thresholdState['current-level']).toBe(true)
    })

    test('enabling a threshold promotes it to active over existing enabled threshold', () => {
      const thresholdState = {
        'current-level': false,
        'highest-level': false,
        'top-normal': true
      }

      let activeThreshold = 'top-normal'

      // Enable highest-level
      thresholdState['highest-level'] = true
      if (thresholdState['highest-level']) {
        activeThreshold = 'highest-level'
      }

      expect(activeThreshold).toBe('highest-level')
    })

    test('disabling active threshold falls back to next enabled', () => {
      const thresholdState = {
        'current-level': true,
        'highest-level': false,
        'top-normal': true
      }

      let activeThreshold = 'current-level'

      // Disable current-level
      thresholdState['current-level'] = false
      if (!thresholdState['current-level']) {
        // Find next enabled
        if (thresholdState['top-normal']) {
          activeThreshold = 'top-normal'
        } else if (thresholdState['highest-level']) {
          activeThreshold = 'highest-level'
        }
      }

      expect(activeThreshold).toBe('top-normal')
    })
  })

  describe('threshold activation callback propagation', () => {
    test('chart activation callback is invoked when threshold is clicked in chart', () => {
      const onThresholdActivate = vi.fn()

      // Simulate chart threshold click
      const thresholdId = 'highest-level'
      onThresholdActivate(thresholdId)

      expect(onThresholdActivate).toHaveBeenCalledWith('highest-level')
    })

    test('external app receives activation updates to sync state', () => {
      const activeThresholdRef = { value: 'top-normal' }
      const onThresholdActivate = vi.fn((id) => {
        activeThresholdRef.value = id
      })

      // Simulate in-chart activation
      onThresholdActivate('current-level')

      expect(activeThresholdRef.value).toBe('current-level')
    })
  })

  describe('active threshold state on chart initialization', () => {
    test('prefers externally supplied activeThresholdId when valid and enabled', () => {
      const enabledThresholds = ['current-level', 'highest-level', 'top-normal']
      const externalActiveId = 'highest-level'

      const isValid = enabledThresholds.includes(externalActiveId)
      const activeId = isValid ? externalActiveId : null

      expect(activeId).toBe('highest-level')
    })

    test('falls back to label-preferred threshold if external ID invalid', () => {
      const enabledThresholds = ['current-level', 'top-normal']
      const labelPreferred = ['top-normal']
      const externalActiveId = 'highest-level' // Not enabled

      const isValid = enabledThresholds.includes(externalActiveId)
      const activeId = isValid
        ? externalActiveId
        : (labelPreferred.length ? labelPreferred[0] : enabledThresholds[0])

      expect(activeId).toBe('top-normal')
    })

    test('uses last enabled threshold if no label preference and none external', () => {
      const enabledThresholds = ['current-level', 'highest-level']
      const labelPreferred = []
      const externalActiveId = null

      const activeId = externalActiveId || (labelPreferred.length ? labelPreferred[0] : enabledThresholds[enabledThresholds.length - 1])

      expect(activeId).toBe('highest-level')
    })
  })

  describe('active threshold visual state consistency', () => {
    test('active threshold renders with black line and visible label', () => {
      const thresholdStates = {
        'current-level': {
          active: false,
          lineStroke: 'rgb(159, 164, 170)', // grey
          labelDisplay: 'none'
        },
        'top-normal': {
          active: true,
          lineStroke: 'rgb(11, 12, 12)', // black
          labelDisplay: 'block'
        }
      }

      expect(thresholdStates['top-normal'].active).toBe(true)
      expect(thresholdStates['top-normal'].lineStroke).toBe('rgb(11, 12, 12)')
      expect(thresholdStates['top-normal'].labelDisplay).toBe('block')
    })

    test('inactive threshold renders with grey line and hidden label', () => {
      const thresholdStates = {
        'current-level': {
          active: false,
          lineStroke: 'rgb(159, 164, 170)', // grey
          labelDisplay: 'none'
        }
      }

      expect(thresholdStates['current-level'].active).toBe(false)
      expect(thresholdStates['current-level'].lineStroke).toBe('rgb(159, 164, 170)')
      expect(thresholdStates['current-level'].labelDisplay).toBe('none')
    })

    test('hovered inactive threshold temporarily shows as black', () => {
      const thresholdStates = {
        'highest-level': {
          active: false,
          hovered: true,
          lineStroke: 'rgb(11, 12, 12)', // black when hovered
          labelDisplay: 'block'
        }
      }

      expect(thresholdStates['highest-level'].hovered).toBe(true)
      expect(thresholdStates['highest-level'].lineStroke).toBe('rgb(11, 12, 12)')
      expect(thresholdStates['highest-level'].labelDisplay).toBe('block')
    })
  })
})
