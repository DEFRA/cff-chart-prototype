export const health = {
  method: 'GET',
  path: '/health',
  options: {
    auth: false
  },
  handler: function (_request, h) {
    return h.response({ message: 'success' })
  }
}
