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
      const { stationId } = request.payload
      const { chartStyle } = request.payload
      const params = new URLSearchParams()

      // Add stationId if provided
      if (stationId && stationId.trim()) {
        params.append('stationId', stationId.trim())
      }

      const query = params.toString()
      const stationPath = chartStyle === 'styleB' ? '/station/single-chart' : '/station'
      return h.redirect(query ? `${stationPath}?${query}` : stationPath)
    }
  }
]
