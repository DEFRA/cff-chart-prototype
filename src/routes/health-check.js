import { proxyFetch } from '../lib/flood-service.js'

/**
 * Extended health check endpoint that also tests external API connectivity
 */
export const healthCheck = {
  method: 'GET',
  path: '/health/connectivity',
  handler: async function (request, h) {
    const results = {
      service: 'ok',
      timestamp: new Date().toISOString(),
      externalApis: {}
    }

    // Test Environment Agency API connectivity
    try {
      const testUrl = 'https://environment.data.gov.uk/flood-monitoring/id/stations?RLOIid=8085'
      request.logger.info(`Testing connectivity to: ${testUrl}`)
      
      // No timeout - let it fail naturally to see the real error
      const response = await proxyFetch(testUrl)
      
      results.externalApis.environmentAgency = {
        url: testUrl,
        status: response.status,
        statusText: response.statusText,
        reachable: response.ok
      }
      
      if (response.ok) {
        const data = await response.json()
        results.externalApis.environmentAgency.itemsCount = data.items?.length || 0
      }
    } catch (error) {
      request.logger.error('Environment Agency API connectivity test failed:', error)
      results.externalApis.environmentAgency = {
        reachable: false,
        error: error.message,
        errorType: error.name,
        errorCause: error.cause?.message || error.cause,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      }
    }

    return h.response(results).code(200)
  }
}
