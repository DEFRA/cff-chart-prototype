import path from 'path'
import hapi from '@hapi/hapi'
import Joi from 'joi'
import Scooter from '@hapi/scooter'
import { headers } from './plugins/headers.js'
import { router } from './plugins/router.js'
import { session } from './plugins/session.js'
import { auth } from './plugins/auth.js'
import { config } from './config/config.js'
import { pulse } from './common/helpers/pulse.js'
import { catchAll } from './common/helpers/errors.js'
import { nunjucksConfig } from './config/nunjucks/nunjucks.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { requestTracing } from './common/helpers/request-tracing.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { secureContext } from './common/helpers/secure-context/secure-context.js'

export async function createServer() {
  setupProxy()
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    state: {
      strictHeader: false
    }
  })

  server.validator(Joi)

  const plugins = [
    Scooter,
    requestLogger,
    requestTracing,
    secureContext,
    pulse,
    nunjucksConfig,
    headers,
    session
  ]

  // Only add auth plugin if authentication is required
  if (config.get('requireAuth')) {
    plugins.push(auth)
  }

  plugins.push(router)

  await server.register(plugins)

  server.ext('onPreResponse', catchAll)

  return server
}
