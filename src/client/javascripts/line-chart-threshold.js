import { renderThresholds } from './line-chart-render.js'

export function createThresholdDismissHandler(stateRef) {
  return (thresholdId) => {
    if (Array.isArray(stateRef.thresholds)) {
      stateRef.thresholds = stateRef.thresholds.map(threshold => {
        if (threshold.id !== thresholdId) {
          return threshold
        }

        return {
          ...threshold,
          enabled: false,
          showLabel: false
        }
      })

      const enabledThresholds = stateRef.thresholds.filter(threshold => threshold.enabled)
      if (!enabledThresholds.some(threshold => threshold.id === stateRef.activeThresholdId)) {
        stateRef.activeThresholdId = enabledThresholds.length ? enabledThresholds[enabledThresholds.length - 1].id : null
      }
    }

    if (typeof stateRef.onThresholdDismiss === 'function') {
      stateRef.onThresholdDismiss(thresholdId)
    }
  }
}

export function getEnabledThresholds(thresholds) {
  return Array.isArray(thresholds)
    ? thresholds.filter(threshold => threshold.enabled)
    : []
}

export function ensureActiveThreshold(stateRef, enabledThresholds) {
  if (enabledThresholds.some(threshold => threshold.id === stateRef.activeThresholdId)) {
    return
  }

  const labelPreferred = enabledThresholds.filter(threshold => threshold.showLabel)

  if (labelPreferred.length) {
    stateRef.activeThresholdId = labelPreferred[labelPreferred.length - 1].id
  } else if (enabledThresholds.length) {
    stateRef.activeThresholdId = enabledThresholds[enabledThresholds.length - 1].id
  } else {
    stateRef.activeThresholdId = null
  }
}

export function createActivateThresholdHandler(stateRef, rerender) {
  return (thresholdId) => {
    if (stateRef.activeThresholdId === thresholdId) {
      return
    }

    stateRef.activeThresholdId = thresholdId
    if (typeof stateRef.onThresholdActivate === 'function') {
      stateRef.onThresholdActivate(thresholdId)
    }
    rerender()
  }
}

export function renderThresholdLayerOnly(thresholdsContainer, stateRef) {
  if (!thresholdsContainer || !stateRef?.yScale || !Number.isFinite(stateRef?.width)) {
    return
  }

  const dismissThreshold = (thresholdId) => {
    createThresholdDismissHandler(stateRef)(thresholdId)
    renderThresholdLayerOnly(thresholdsContainer, stateRef)
  }

  const activateThreshold = (thresholdId) => {
    if (stateRef.activeThresholdId === thresholdId) {
      return
    }

    stateRef.activeThresholdId = thresholdId
    if (typeof stateRef.onThresholdActivate === 'function') {
      stateRef.onThresholdActivate(thresholdId)
    }

    renderThresholdLayerOnly(thresholdsContainer, stateRef)
  }

  renderThresholds(
    thresholdsContainer,
    stateRef.width,
    stateRef.yScale,
    dismissThreshold,
    activateThreshold,
    stateRef.activeThresholdId,
    stateRef.thresholds
  )
}
