import http2 from 'node:http2'
import Boom from '@hapi/boom'

const { constants: httpConstants } = http2

export const auth = {
  plugin: {
    name: 'auth',
    async register(server) {
      // Auth scheme that checks session
      server.auth.scheme('session', () => {
        return {
          authenticate: async function (request, h) {
            const authenticated = request.yar.get('authenticated')

            if (authenticated) {
              return h.authenticated({ credentials: { authenticated: true } })
            }

            return h.unauthenticated(Boom.unauthorized('Authentication required'))
          }
        }
      })

      // Register the scheme
      server.auth.strategy('session', 'session')

      // Set as default - all routes require auth unless explicitly set to false
      server.auth.default({
        strategy: 'session',
        mode: 'required'
      })

      // Add onPreResponse handler to redirect unauthenticated requests
      server.ext('onPreResponse', (request, h) => {
        const response = request.response

        // Check if the response indicates an authentication error
        if (response.isBoom && response.output.statusCode === httpConstants.HTTP_STATUS_UNAUTHORIZED && request.path !== '/login') {
          return h.redirect('/login').takeover()
        }

        return h.continue
      })
    }
  }
}
