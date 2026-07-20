import path from 'node:path'
import { config } from '../../config/config.js'

export const serveStaticFiles = {
  plugin: {
    name: 'staticFiles',
    register(server) {
      server.route([
        {
          options: {
            auth: false,
            cache: {
              expiresIn: config.get('staticCacheTimeout'),
              privacy: 'private'
            }
          },
          method: 'GET',
          path: '/favicon.ico',
          handler(_request, h) {
            // Serve actual favicon.ico from assets instead of returning 204
            return h.file(path.join(config.get('root'), '.public/assets/images/favicon.ico'))
          }
        },
        {
          options: {
            auth: false,
            cache: {
              expiresIn: config.get('staticCacheTimeout'),
              privacy: 'private'
            }
          },
          method: 'GET',
          path: `${config.get('assetPath')}/{param*}`,
          handler: {
            directory: {
              path: path.join(config.get('root'), '.public'),
              redirectToSlash: true
            }
          }
        }
      ])
    }
  }
}
