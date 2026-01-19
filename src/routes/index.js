export const index = [
  {
    method: 'GET',
    path: '/',
    handler: async function (_request, h) {
      return h.view('index.njk')
    }
  },
  {
    method: 'POST',
    path: '/station',
    handler: async function (request, h) {
      const { dataType, stationType, stationId, chartStyle } = request.payload

      // Build query params
      const params = new URLSearchParams({
        dataType: dataType || 'existing',
        stationType: stationType || 'S',
        chartStyle: chartStyle || 'styleA'
      })

      // Add stationId if provided
      if (stationId && stationId.trim()) {
        params.append('stationId', stationId.trim())
      }

      return h.redirect(`/station?${params.toString()}`)
    }
  }
]
