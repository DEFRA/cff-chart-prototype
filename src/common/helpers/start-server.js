import { createServer } from '../../server.js'
import { config } from '../../config/config.js'
import { createLogger } from './logging/logger.js'

async function startServer () {
  let server

  try {
    server = await createServer()
    await server.start()

    const serviceName = config.get('serviceName')
    const port = config.get('port')

    server.logger.info('Server started successfully')
    server.logger.info(`${serviceName} is running on port ${port}`)
  } catch (err) {
    const logger = createLogger()
    logger.info('Server failed to start')
    logger.error(err)
  }

  return server
}

export { startServer }
