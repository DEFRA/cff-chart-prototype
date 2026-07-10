import { getTimeRangeLabel } from './historic-data.js'
import {
  LINE_CHART_ID,
  DEFAULT_FILTER,
  TIME_FILTER_LINK_SELECTOR,
  TIME_FILTER_LINK_DISABLED_CLASS,
  HISTORIC_DATA_REQUIRED_FILTERS,
  ARIA_DISABLED,
  ARIA_CURRENT,
  DOWNLOAD_CSV_BTN_ID
} from './application-constants.js'

export function setupDownloadCsvReverseTabHandler() {
  const downloadBtn = document.getElementById(DOWNLOAD_CSV_BTN_ID)

  if (!downloadBtn || downloadBtn.dataset.reverseTabBound === 'true') {
    return
  }

  downloadBtn.dataset.reverseTabBound = 'true'

  downloadBtn.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || !event.shiftKey) {
      return
    }

    const activePoint = document.querySelector(`#${LINE_CHART_ID} [data-point-focusable][tabindex="0"]`)
    const fallbackPoint = document.querySelector(`#${LINE_CHART_ID} [data-point-focusable]`)
    const pointTarget = activePoint || fallbackPoint

    if (!pointTarget) {
      return
    }

    event.preventDefault()
    const significantRow = document.querySelector(`#${LINE_CHART_ID} .significant [role="row"]`)
    significantRow?.classList.add('significant--visible')
    pointTarget.focus()
  })
}

export function setupChartStyleRadioKeyboardSupport() {
  const chartStyleRadios = Array.from(document.querySelectorAll('input[type="radio"][name="chartStyle"]'))

  if (chartStyleRadios.length === 0) {
    return
  }

  chartStyleRadios.forEach(radio => {
    if (!radio.disabled) {
      radio.setAttribute('tabindex', '0')
    }

    if (radio.dataset.enterSelectBound === 'true') {
      return
    }

    radio.dataset.enterSelectBound = 'true'

    radio.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') {
        return
      }

      event.preventDefault()
      this.checked = true
      const EventConstructor = this.ownerDocument?.defaultView?.Event
      if (typeof EventConstructor === 'function') {
        this.dispatchEvent(new EventConstructor('change', { bubbles: true }))
      }
    })
  })
}

export function updateDownloadCsvState(currentFilter) {
  const downloadBtn = document.getElementById(DOWNLOAD_CSV_BTN_ID)

  if (!downloadBtn) {
    return
  }

  downloadBtn.style.display = currentFilter === DEFAULT_FILTER ? '' : 'none'
}

export function updateFilterButtonStates(historicDataRef) {
  const hasHistoricData = Boolean(historicDataRef?.available)
    || (Array.isArray(historicDataRef?.data) && historicDataRef.data.length > 0)

  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    const requiresHistoricData = HISTORIC_DATA_REQUIRED_FILTERS.has(link.dataset.filter)

    if (requiresHistoricData && !hasHistoricData) {
      link.setAttribute(ARIA_DISABLED, 'true')
      link.classList.add(TIME_FILTER_LINK_DISABLED_CLASS)
      link.setAttribute('tabindex', '-1')
      return
    }

    link.removeAttribute(ARIA_DISABLED)
    link.classList.remove(TIME_FILTER_LINK_DISABLED_CLASS)
    link.removeAttribute('tabindex')
  })
}

export function setTimeFilterLinksTemporarilyDisabled(isDisabled) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    if (isDisabled) {
      link.dataset.tempDisabled = 'true'
      link.setAttribute(ARIA_DISABLED, 'true')
      link.classList.add(TIME_FILTER_LINK_DISABLED_CLASS)
      link.setAttribute('tabindex', '-1')
      return
    }

    if (link.dataset.tempDisabled === 'true') {
      delete link.dataset.tempDisabled
      link.removeAttribute(ARIA_DISABLED)
      link.classList.remove(TIME_FILTER_LINK_DISABLED_CLASS)
      link.removeAttribute('tabindex')
    }
  })
}

export function updateZoomControlsVisibility(currentFilter) {
  const controlsRow = document.querySelector('.defra-line-chart__control-row')

  if (!controlsRow) {
    return
  }

  controlsRow.style.display = currentFilter === DEFAULT_FILTER ? 'none' : ''
}

export function updateTimeRangeLabel(filter) {
  const timeRangeLabel = document.getElementById('chart-time-range')

  if (!timeRangeLabel) {
    return
  }

  timeRangeLabel.textContent = getTimeRangeLabel(filter)
}

export function updateActiveButtonState(currentFilter) {
  document.querySelectorAll(TIME_FILTER_LINK_SELECTOR).forEach(link => {
    if (link.dataset.filter === currentFilter) {
      link.classList.add('time-filter-link--active')
      link.setAttribute(ARIA_CURRENT, 'page')
      return
    }

    link.classList.remove('time-filter-link--active')
    link.removeAttribute(ARIA_CURRENT)
  })
}

export function setupZoomControls() {
  const panLeftBtn = document.getElementById('pan-left-btn')
  const panRightBtn = document.getElementById('pan-right-btn')
  const zoomInBtn = document.getElementById('zoom-in-btn')
  const zoomOutBtn = document.getElementById('zoom-out-btn')
  const zoomResetBtn = document.getElementById('zoom-reset-btn')
  const chartContainer = document.getElementById(LINE_CHART_ID)

  const updateZoomButtonStates = (scale = 1) => {
    if (!zoomInBtn || !zoomOutBtn || !zoomResetBtn || !panLeftBtn || !panRightBtn) {
      return
    }

    const maxZoomScale = typeof chartContainer?.getMaxZoomScale === 'function'
      ? chartContainer.getMaxZoomScale()
      : 100

    panLeftBtn.disabled = scale <= 1
    panRightBtn.disabled = scale <= 1
    zoomInBtn.disabled = scale >= maxZoomScale
    zoomOutBtn.disabled = scale <= 1
    zoomResetBtn.disabled = scale <= 1
  }

  if (chartContainer) {
    chartContainer.updateZoomControls = updateZoomButtonStates
  }

  updateZoomButtonStates(1)

  if (panLeftBtn) {
    panLeftBtn.onclick = () => {
      if (typeof chartContainer?.panLeft === 'function') {
        chartContainer.panLeft()
      }
    }
  }

  if (panRightBtn) {
    panRightBtn.onclick = () => {
      if (typeof chartContainer?.panRight === 'function') {
        chartContainer.panRight()
      }
    }
  }

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      if (typeof chartContainer?.zoomIn === 'function') {
        chartContainer.zoomIn()
      }
    }
  }

  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      if (typeof chartContainer?.zoomOut === 'function') {
        chartContainer.zoomOut()
      }
    }
  }

  if (zoomResetBtn) {
    zoomResetBtn.onclick = () => {
      if (typeof chartContainer?.resetZoom === 'function') {
        chartContainer.resetZoom()
      }
    }
  }
}
