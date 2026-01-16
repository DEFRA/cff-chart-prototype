export const index = {
  method: 'GET',
  path: '/',
  handler: async function (_request, h) {
    // Render view
    return h.view('index.njk')
  }
}
