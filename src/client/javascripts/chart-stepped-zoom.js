import { subDays, subMonths, subYears } from 'date-fns'
import { zoomIdentity, zoomTransform } from 'd3-zoom'

export const TIMELINE_ZOOM_STEPS = [
  { label: '5 days', start: end => subDays(end, 5), resolution: '15m' },
  { label: '10 days', start: end => subDays(end, 10), resolution: '15m' },
  { label: '15 days', start: end => subDays(end, 15), resolution: '15m' },
  { label: '1 month', start: end => subMonths(end, 1), resolution: '30m' },
  { label: '3 months', start: end => subMonths(end, 3), resolution: '30m' },
  { label: '6 months', start: end => subMonths(end, 6), resolution: '30m' },
  { label: '1 year', start: end => subYears(end, 1), resolution: '1h' },
  { label: '2 years', start: end => subYears(end, 2), resolution: '1h' },
  { label: '3 years', start: end => subYears(end, 3), resolution: 'daily' }
]

export function setupSteppedZoom ({ container, mainGroup, zoomBehavior, getBaseScale, onRangeChange, onStepChange }) {
  let stepIndex = 0
  let lastWheelTime = -Infinity
  let touchDistance = null
  let touchCentre = null
  let pinchStepped = false

  const getDomain = () => zoomTransform(mainGroup.node()).rescaleX(getBaseScale()).domain()
  const applyDomain = (domain) => {
    const baseScale = getBaseScale()
    const [baseStart, baseEnd] = baseScale.domain().map(Number)
    const duration = Math.min(Number(domain[1]) - Number(domain[0]), baseEnd - baseStart)
    const end = Math.min(baseEnd, Math.max(baseStart + duration, Number(domain[1])))
    const k = (baseEnd - baseStart) / duration
    const transform = zoomIdentity.translate(-k * baseScale(new Date(end - duration)), 0).scale(k)
    mainGroup.call(zoomBehavior.transform, transform)
    onRangeChange?.({ label: TIMELINE_ZOOM_STEPS[stepIndex].label, domain: getDomain() })
    container.updateZoomControls?.(k)
  }
  const showStep = (index, end = getDomain()[1]) => {
    stepIndex = Math.max(0, Math.min(TIMELINE_ZOOM_STEPS.length - 1, index))
    onStepChange?.(TIMELINE_ZOOM_STEPS[stepIndex])
    applyDomain([TIMELINE_ZOOM_STEPS[stepIndex].start(end), end])
  }

  container.getVisibleDomain = getDomain
  container.restoreZoomView = applyDomain
  container.getZoomControlState = () => ({
    canZoomIn: stepIndex > 0,
    canZoomOut: stepIndex < TIMELINE_ZOOM_STEPS.length - 1,
    canReset: stepIndex !== 0 || Math.abs(Number(getDomain()[1]) - Number(getBaseScale().domain()[1])) > 1
  })
  container.zoomIn = () => {
    if (stepIndex > 0) showStep(stepIndex - 1)
  }
  container.zoomOut = () => {
    if (stepIndex < TIMELINE_ZOOM_STEPS.length - 1) showStep(stepIndex + 1)
  }
  container.resetZoom = () => showStep(0, getBaseScale().domain()[1])

  const svg = mainGroup.node().ownerSVGElement
  svg.addEventListener('wheel', (event) => {
    event.preventDefault()
    if (event.deltaY === 0 || event.timeStamp - lastWheelTime < 250) return
    lastWheelTime = event.timeStamp
    if (event.deltaY > 0) container.zoomOut()
    else container.zoomIn()
  }, { passive: false })

  const measureTouches = (touches) => ({
    distance: Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY),
    centre: (touches[0].clientX + touches[1].clientX) / 2
  })
  svg.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return
    event.preventDefault()
    const { distance, centre } = measureTouches(event.touches)
    touchDistance = distance
    touchCentre = centre
    pinchStepped = false
  }, { passive: false })
  svg.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2 || touchDistance === null) return
    event.preventDefault()
    const { distance, centre } = measureTouches(event.touches)
    const ratio = distance / touchDistance
    if (!pinchStepped && (ratio > 1.15 || ratio < 1 / 1.15)) {
      if (ratio > 1) container.zoomIn()
      else container.zoomOut()
      pinchStepped = true
    } else if (!pinchStepped && Math.abs(centre - touchCentre) > 2) {
      const k = zoomTransform(mainGroup.node()).k
      mainGroup.call(zoomBehavior.translateBy, (centre - touchCentre) / k, 0)
    }
    touchCentre = centre
  }, { passive: false })
  const endTouch = () => { touchDistance = null }
  svg.addEventListener('touchend', endTouch)
  svg.addEventListener('touchcancel', endTouch)

  container.resetZoom()
}
