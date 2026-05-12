import Inert from '@hapi/inert'
import { health } from '../routes/health.js'
import { healthCheck } from '../routes/health-check.js'
import { index } from '../routes/index.js'
import { station } from '../routes/station.js'
import { login } from '../routes/login.js'
import { admin } from '../routes/admin.js'
import { serveStaticFiles } from '../common/helpers/serve-static-files.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([Inert])
      await server.route(health)
      await server.route(healthCheck)
      await server.route(login)
      await server.route(index)
      await server.route(station)
      await server.route(admin)
      await server.register([serveStaticFiles])
    }
  }
}
