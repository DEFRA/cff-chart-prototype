import { readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config/config.js'
import { lookupStationByRLOI, fetchHistoricReadings } from '../lib/hydrology-service.js'

const PROTECTED_STATION = '3089'

function getPointCount(data) {
  return data.meta?.pointCount || data.meta?.thirtyMinPointCount || data.meta?.hourlyPointCount || data.readings?.length || 0
}

function createStoredStationEntry(rloiId, data) {
  return {
    rloiId,
    name: data.meta?.name || 'Unknown',
    pointCount: getPointCount(data),
    startDate: data.meta?.startDate || '?',
    endDate: data.meta?.endDate || '?',
    fetchedAt: data.meta?.fetchedAt || '?',
    isProtected: rloiId === PROTECTED_STATION
  }
}

async function readStoredStation(dataDir, file) {
  if (!file.endsWith('.json')) {
    return null
  }

  const rloiId = file.replace('.json', '')

  try {
    const raw = await readFile(path.resolve(dataDir, file), 'utf8')
    const data = JSON.parse(raw)
    return createStoredStationEntry(rloiId, data)
  } catch {
    return { rloiId, name: 'Error reading file', pointCount: 0, isProtected: rloiId === PROTECTED_STATION }
  }
}

async function getStoredStations() {
  const dataDir = path.resolve(config.get('root'), 'data', 'historic')

  try {
    const files = await readdir(dataDir)
    const parsedStations = await Promise.all(files.map((file) => readStoredStation(dataDir, file)))
    const stations = parsedStations.filter(Boolean)

    return stations.sort((a, b) => (a.isProtected ? -1 : 0) - (b.isProtected ? -1 : 0))
  } catch {
    // data/historic directory doesn't exist yet
    return []
  }
}

export const admin = [
  {
    method: 'GET',
    path: '/admin',
    handler: async function (request, h) {
      const stations = await getStoredStations()
      const message = request.query.message || null
      const error = request.query.error || null

      return h.view('admin.njk', { stations, message, error })
    }
  },
  {
    method: 'POST',
    path: '/admin/fetch',
    handler: async function (request, h) {
      const { rloiId } = request.payload

      if (!rloiId?.trim()) {
        return h.redirect('/admin?error=Please enter an RLOI ID')
      }

      const cleanId = rloiId.trim()

      try {
        request.logger.info(`Admin: looking up hydrology station for RLOI ID ${cleanId}`)
        const stationInfo = await lookupStationByRLOI(cleanId)

        if (!stationInfo) {
          return h.redirect(`/admin?error=No hydrology station found for RLOI ID ${cleanId}, or no 15-min level measure available`)
        }

        request.logger.info(`Admin: fetching 3 years of historic data for ${stationInfo.name} (${cleanId})`)
        const result = await fetchHistoricReadings(cleanId, stationInfo)
        const pointCount = result.meta.pointCount || result.meta.hourlyPointCount || result.readings?.length || 0

        return h.redirect(`/admin?message=Fetched ${pointCount} historic readings for ${stationInfo.name} (${cleanId})`)
      } catch (error) {
        request.logger.error(`Admin: fetch failed for ${cleanId}:`, error)
        return h.redirect(`/admin?error=Fetch failed for RLOI ID ${cleanId}: ${error.message}`)
      }
    }
  },
  {
    method: 'POST',
    path: '/admin/delete',
    handler: async function (request, h) {
      const { rloiId } = request.payload

      if (rloiId === PROTECTED_STATION) {
        return h.redirect('/admin?error=Cannot delete the default station (3089)')
      }

      try {
        const filePath = path.resolve(config.get('root'), 'data', 'historic', `${rloiId}.json`)
        await unlink(filePath)
        return h.redirect(`/admin?message=Deleted historic data for station ${rloiId}`)
      } catch (error) {
        return h.redirect(`/admin?error=Failed to delete: ${error.message}`)
      }
    }
  }
]
