import {
  DEFAULT_CURRENT_LEVEL,
  DEFAULT_HIGHEST_LEVEL,
  DEFAULT_TOP_NORMAL_LEVEL,
  DEFAULT_FILTER,
  THRESHOLD_CURRENT_LEVEL_ID,
  THRESHOLD_HIGHEST_LEVEL_ID,
  THRESHOLD_TOP_NORMAL_ID,
  THRESHOLD_CONTROL_CONFIG
} from './application-constants.js'

function formatMetres(value, decimals = 2) {
  return `${Number(value).toFixed(decimals)}m`
}

export function getDefaultActiveThresholdId(thresholdState) {
  if (thresholdState[THRESHOLD_TOP_NORMAL_ID]) {
    return THRESHOLD_TOP_NORMAL_ID
  }

  if (thresholdState[THRESHOLD_HIGHEST_LEVEL_ID]) {
    return THRESHOLD_HIGHEST_LEVEL_ID
  }

  if (thresholdState[THRESHOLD_CURRENT_LEVEL_ID]) {
    return THRESHOLD_CURRENT_LEVEL_ID
  }

  return null
}

export function getThresholdMetrics(observed = []) {
  const latestValue = observed.length > 0
    ? Number(observed[observed.length - 1].value)
    : DEFAULT_CURRENT_LEVEL

  const highestValue = observed.length > 0
    ? observed.reduce((max, point) => Math.max(max, Number(point.value)), Number.NEGATIVE_INFINITY)
    : DEFAULT_HIGHEST_LEVEL

  const typicalRangeHigh = globalThis.flood?.model?.typicalRangeHigh

  return {
    currentLevel: Number.isFinite(latestValue) ? latestValue : DEFAULT_CURRENT_LEVEL,
    highestLevel: Number.isFinite(highestValue) ? highestValue : DEFAULT_HIGHEST_LEVEL,
    topNormal: (typicalRangeHigh != null && Number.isFinite(Number(typicalRangeHigh))) ? Number(typicalRangeHigh) : DEFAULT_TOP_NORMAL_LEVEL
  }
}

export function buildThresholds(metrics, thresholdState) {
  return [
    {
      id: THRESHOLD_CURRENT_LEVEL_ID,
      label: `latest level (${formatMetres(metrics.currentLevel)})`,
      shortLabel: `${formatMetres(metrics.currentLevel)} Latest level`,
      value: metrics.currentLevel,
      enabled: thresholdState[THRESHOLD_CURRENT_LEVEL_ID],
      showLabel: thresholdState[THRESHOLD_CURRENT_LEVEL_ID],
      dismissible: true
    },
    {
      id: THRESHOLD_HIGHEST_LEVEL_ID,
      label: `highest level (${formatMetres(metrics.highestLevel)})`,
      shortLabel: `${formatMetres(metrics.highestLevel)} Highest level`,
      value: metrics.highestLevel,
      enabled: thresholdState[THRESHOLD_HIGHEST_LEVEL_ID],
      showLabel: thresholdState[THRESHOLD_HIGHEST_LEVEL_ID],
      dismissible: true
    },
    {
      id: THRESHOLD_TOP_NORMAL_ID,
      label: `top of normal range (${formatMetres(metrics.topNormal)})`,
      shortLabel: `${formatMetres(metrics.topNormal)} Top of normal range`,
      value: metrics.topNormal,
      enabled: thresholdState[THRESHOLD_TOP_NORMAL_ID],
      showLabel: thresholdState[THRESHOLD_TOP_NORMAL_ID],
      dismissible: true
    }
  ]
}

export function updateThresholdControls(metrics, thresholdState) {
  const currentLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_CURRENT_LEVEL_ID].labelId)
  const highestLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_HIGHEST_LEVEL_ID].labelId)
  const topNormalLabel = document.getElementById(THRESHOLD_CONTROL_CONFIG[THRESHOLD_TOP_NORMAL_ID].labelId)

  if (currentLabel) {
    currentLabel.textContent = `Show latest level (${formatMetres(metrics.currentLevel)})`
  }

  if (highestLabel) {
    highestLabel.textContent = `Show highest level recorded at this measuring station (${formatMetres(metrics.highestLevel)})`
  }

  if (topNormalLabel) {
    topNormalLabel.textContent = `Show top of normal range (${formatMetres(metrics.topNormal)}). Low-lying land flooding possible above this level`
  }

  for (const thresholdId of Object.keys(THRESHOLD_CONTROL_CONFIG)) {
    const checkbox = document.getElementById(THRESHOLD_CONTROL_CONFIG[thresholdId].inputId)
    if (checkbox) {
      checkbox.checked = !!thresholdState[thresholdId]
    }
  }
}

export function setupThresholdControlHandlers(thresholdState, activeThresholdRef, renderChart) {
  for (const thresholdId of Object.keys(THRESHOLD_CONTROL_CONFIG)) {
    const checkbox = document.getElementById(THRESHOLD_CONTROL_CONFIG[thresholdId].inputId)

    if (!checkbox || checkbox.dataset.listenersBound === 'true') {
      continue
    }

    checkbox.dataset.listenersBound = 'true'

    checkbox.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      this.click()
    })

    checkbox.addEventListener('change', function () {
      thresholdState[thresholdId] = this.checked

      if (this.checked) {
        activeThresholdRef.value = thresholdId
      } else if (activeThresholdRef.value === thresholdId) {
        activeThresholdRef.value = getDefaultActiveThresholdId(thresholdState)
      }

      renderChart({ thresholdsOnly: true })
    })
  }
}

export function applyThresholdDefaultsForFilter(nextFilter, thresholdState, activeThresholdRef) {
  if (!thresholdState || !activeThresholdRef) {
    return
  }

  if (nextFilter === DEFAULT_FILTER) {
    thresholdState[THRESHOLD_CURRENT_LEVEL_ID] = false
    thresholdState[THRESHOLD_HIGHEST_LEVEL_ID] = false
    thresholdState[THRESHOLD_TOP_NORMAL_ID] = true
    activeThresholdRef.value = THRESHOLD_TOP_NORMAL_ID
  }
}
