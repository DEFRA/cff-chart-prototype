import path from 'node:path'
import { readFileSync } from 'node:fs'
import { config } from '../config.js'
import { createLogger } from '../../common/helpers/logging/logger.js'

const logger = createLogger()
const assetPath = config.get('assetPath')
const manifestPath = path.join(
  config.get('root'),
  '.public/assets-manifest.json'
)

let webpackManifest

function loadWebpackManifest(forceReload = false) {
  if (webpackManifest && !forceReload) {
    return webpackManifest
  }

  try {
    webpackManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (_err) {
    logger.error(`Webpack ${path.basename(manifestPath)} not found`)
    webpackManifest = undefined
  }

  return webpackManifest
}

export function context(request) {
  const ctx = request.response.source?.context || {}
  const isDev = config.get('isDevelopment')
  const manifest = loadWebpackManifest(isDev)

  return {
    ...ctx,
    assetPath,
    serviceName: config.get('serviceName'),
    serviceUrl: '/',
    breadcrumbs: [],
    getAssetPath(asset) {
      const webpackAssetPath = manifest?.[asset]
      return `${assetPath}/${webpackAssetPath ?? asset}`
    }
  }
}
