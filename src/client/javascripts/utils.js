'use strict'

// Utility functions for flood charts

// forEach polyfill
export const forEach = (array, callback, scope) => {
  for (let i = 0; i < array.length; i++) {
    callback.call(scope, array[i], i)
  }
}

// Simplify line algorithm - Douglas-Peucker
export const simplify = (points, tolerance) => {
  if (points.length <= 2) return points

  const sqTolerance = tolerance * tolerance

  const simplifyDouglasPeucker = (points, sqTolerance) => {
    const len = points.length
    const MarkerArray = typeof Uint8Array !== 'undefined' ? Uint8Array : Array
    const markers = new MarkerArray(len)

    markers[0] = markers[len - 1] = 1

    const stack = [0, len - 1]

    while (stack.length) {
      const last = stack.pop()
      const first = stack.pop()

      let maxSqDist = 0
      let index = 0

      for (let i = first + 1; i < last; i++) {
        const sqDist = getSqSegDist(points[i], points[first], points[last])

        if (sqDist > maxSqDist) {
          index = i
          maxSqDist = sqDist
        }
      }

      if (maxSqDist > sqTolerance) {
        markers[index] = 1

        stack.push(first, index, index, last)
      }
    }

    const newPoints = []
    for (let i = 0; i < len; i++) {
      if (markers[i]) {
        const point = { ...points[i], isSignificant: true }
        newPoints.push(point)
      }
    }

    return newPoints
  }

  const getSqSegDist = (p, p1, p2) => {
    let x = p1.value
    let y = new Date(p1.dateTime).getTime()
    let dx = p2.value - x
    let dy = new Date(p2.dateTime).getTime() - y

    if (dx !== 0 || dy !== 0) {
      const t = ((p.value - x) * dx + (new Date(p.dateTime).getTime() - y) * dy) / (dx * dx + dy * dy)

      if (t > 1) {
        x = p2.value
        y = new Date(p2.dateTime).getTime()
      } else if (t > 0) {
        x += dx * t
        y += dy * t
      }
    }

    dx = p.value - x
    dy = new Date(p.dateTime).getTime() - y

    return dx * dx + dy * dy
  }

  return simplifyDouglasPeucker(points, sqTolerance)
}

// Make utilities available globally
if (typeof window !== 'undefined') {
  window.flood = window.flood || {}
  window.flood.utils = {
    forEach,
    simplify
  }
}
