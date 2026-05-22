import { describe, it, expect, beforeEach, vi } from 'vitest'

import { admin } from '../../../src/routes/admin.js'
import { lookupStationByRLOI, fetchHistoricReadings } from '../../../src/lib/hydrology-service.js'
import { readdir, readFile, unlink } from 'node:fs/promises'

vi.mock('../../../src/lib/hydrology-service.js', () => ({
  lookupStationByRLOI: vi.fn(),
  fetchHistoricReadings: vi.fn()
}))

vi.mock('../../../src/config/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'root') return '/tmp/test-project'
      if (key === 'api.hydrology.baseUrl') return 'https://environment.data.gov.uk/hydrology'
      return null
    })
  }
}))

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

const [getAdmin, postFetch, postDelete] = admin

function createMockRequest(payload = {}, query = {}) {
  return {
    payload,
    query,
    logger: { info: vi.fn(), error: vi.fn() }
  }
}

function createMockH() {
  const h = {
    view: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    code: vi.fn().mockReturnThis()
  }
  return h
}

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /admin', () => {
    it('should render admin page with stored stations', async () => {
      readdir.mockResolvedValue(['3089.json', '7041.json'])
      readFile.mockImplementation((filePath) => {
        if (filePath.includes('3089')) {
          return Promise.resolve(JSON.stringify({
            meta: { name: 'Test Station', hourlyPointCount: 26315, startDate: '2023-05-12', endDate: '2026-05-12', fetchedAt: '2026-05-12T14:00:00Z' },
            readings: []
          }))
        }
        return Promise.resolve(JSON.stringify({
          meta: { name: 'Bourton', hourlyPointCount: 26000, startDate: '2023-05-12', endDate: '2026-05-12', fetchedAt: '2026-05-12T15:00:00Z' },
          readings: []
        }))
      })

      const request = createMockRequest({}, {})
      const h = createMockH()

      await getAdmin.handler(request, h)

      expect(h.view).toHaveBeenCalledWith('admin.njk', expect.objectContaining({
        stations: expect.arrayContaining([
          expect.objectContaining({ rloiId: '3089', name: 'Test Station', isProtected: true }),
          expect.objectContaining({ rloiId: '7041', name: 'Bourton', isProtected: false })
        ])
      }))
    })

    it('should handle empty data directory gracefully', async () => {
      readdir.mockRejectedValue(new Error('ENOENT'))

      const request = createMockRequest({}, {})
      const h = createMockH()

      await getAdmin.handler(request, h)

      expect(h.view).toHaveBeenCalledWith('admin.njk', expect.objectContaining({
        stations: []
      }))
    })

    it('should pass message and error query params to template', async () => {
      readdir.mockResolvedValue([])

      const request = createMockRequest({}, { message: 'Success!', error: null })
      const h = createMockH()

      await getAdmin.handler(request, h)

      expect(h.view).toHaveBeenCalledWith('admin.njk', expect.objectContaining({
        message: 'Success!',
        error: null
      }))
    })

    it('should sort protected station first', async () => {
      readdir.mockResolvedValue(['7041.json', '3089.json'])
      readFile.mockImplementation((filePath) => {
        if (filePath.includes('3089')) {
          return Promise.resolve(JSON.stringify({ meta: { name: 'Test Station', hourlyPointCount: 100 }, readings: [] }))
        }
        return Promise.resolve(JSON.stringify({ meta: { name: 'Bourton', hourlyPointCount: 200 }, readings: [] }))
      })

      const request = createMockRequest({}, {})
      const h = createMockH()

      await getAdmin.handler(request, h)

      const stations = h.view.mock.calls[0][1].stations
      expect(stations[0].rloiId).toBe('3089')
      expect(stations[0].isProtected).toBe(true)
    })

    it('should skip non-JSON files in data directory', async () => {
      readdir.mockResolvedValue(['.gitkeep', '3089.json', 'readme.txt'])
      readFile.mockResolvedValue(JSON.stringify({
        meta: { name: 'Test', hourlyPointCount: 100 },
        readings: []
      }))

      const request = createMockRequest({}, {})
      const h = createMockH()

      await getAdmin.handler(request, h)

      const stations = h.view.mock.calls[0][1].stations
      expect(stations).toHaveLength(1)
      expect(stations[0].rloiId).toBe('3089')
    })
  })

  describe('POST /admin/fetch', () => {
    it('should fetch and store data for valid RLOI ID', async () => {
      lookupStationByRLOI.mockResolvedValue({
        guid: 'test-guid',
        name: 'Test Station',
        measureId: 'test-measure'
      })
      fetchHistoricReadings.mockResolvedValue({
        meta: { hourlyPointCount: 26000 },
        readings: []
      })

      const request = createMockRequest({ rloiId: '7041' })
      const h = createMockH()

      await postFetch.handler(request, h)

      expect(lookupStationByRLOI).toHaveBeenCalledWith('7041')
      expect(fetchHistoricReadings).toHaveBeenCalledWith('7041', {
        guid: 'test-guid',
        name: 'Test Station',
        measureId: 'test-measure'
      })
      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin?message='))
      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('26000'))
    })

    it('should redirect with error when RLOI ID is empty', async () => {
      const request = createMockRequest({ rloiId: '' })
      const h = createMockH()

      await postFetch.handler(request, h)

      expect(h.redirect).toHaveBeenCalledWith('/admin?error=Please enter an RLOI ID')
      expect(lookupStationByRLOI).not.toHaveBeenCalled()
    })

    it('should redirect with error when station not found', async () => {
      lookupStationByRLOI.mockResolvedValue(null)

      const request = createMockRequest({ rloiId: '999999' })
      const h = createMockH()

      await postFetch.handler(request, h)

      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin?error='))
      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('999999'))
    })

    it('should redirect with error when fetch throws', async () => {
      lookupStationByRLOI.mockRejectedValue(new Error('API timeout'))

      const request = createMockRequest({ rloiId: '7041' })
      const h = createMockH()

      await postFetch.handler(request, h)

      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin?error='))
      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('API timeout'))
    })

    it('should trim whitespace from RLOI ID', async () => {
      lookupStationByRLOI.mockResolvedValue({
        guid: 'g', name: 'S', measureId: 'm'
      })
      fetchHistoricReadings.mockResolvedValue({
        meta: { hourlyPointCount: 100 }, readings: []
      })

      const request = createMockRequest({ rloiId: '  7041  ' })
      const h = createMockH()

      await postFetch.handler(request, h)

      expect(lookupStationByRLOI).toHaveBeenCalledWith('7041')
    })
  })

  describe('POST /admin/delete', () => {
    it('should delete station data file', async () => {
      unlink.mockResolvedValue(undefined)

      const request = createMockRequest({ rloiId: '7041' })
      const h = createMockH()

      await postDelete.handler(request, h)

      expect(unlink).toHaveBeenCalledWith('/tmp/test-project/data/historic/7041.json')
      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin?message='))
    })

    it('should refuse to delete protected station 3089', async () => {
      const request = createMockRequest({ rloiId: '3089' })
      const h = createMockH()

      await postDelete.handler(request, h)

      expect(unlink).not.toHaveBeenCalled()
      expect(h.redirect).toHaveBeenCalledWith('/admin?error=Cannot delete the default station (3089)')
    })

    it('should redirect with error when delete fails', async () => {
      unlink.mockRejectedValue(new Error('ENOENT: no such file'))

      const request = createMockRequest({ rloiId: '9999' })
      const h = createMockH()

      await postDelete.handler(request, h)

      expect(h.redirect).toHaveBeenCalledWith(expect.stringContaining('/admin?error='))
    })
  })
})
