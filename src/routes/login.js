import http2 from 'node:http2'
import { config } from '../config/config.js'

const { constants: httpConstants } = http2

export const login = [
  {
    method: 'GET',
    path: '/login',
    options: {
      auth: false
    },
    handler: async function (request, h) {
      // If already authenticated, redirect to home
      if (request.yar.get('authenticated')) {
        return h.redirect('/')
      }
      return h.view('login.njk', { error: false })
    }
  },
  {
    method: 'POST',
    path: '/login',
    options: {
      auth: false
    },
    handler: async function (request, h) {
      const { password } = request.payload || {}
      const correctPassword = config.get('prototypePassword')

      if (password === correctPassword) {
        request.yar.set('authenticated', true)
        return h.redirect('/')
      }

      return h.view('login.njk', { error: true }).code(httpConstants.HTTP_STATUS_UNAUTHORIZED)
    }
  },
  {
    method: 'GET',
    path: '/logout',
    options: {
      auth: false
    },
    handler: async function (request, h) {
      request.yar.reset()
      return h.redirect('/login')
    }
  }
]
