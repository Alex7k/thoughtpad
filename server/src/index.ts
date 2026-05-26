import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { handleLogin, handleLogout, isAuthenticated } from './auth'
import { ensureDataDirs, normalizeNoteName, readNote } from './notes'
import { addSocket, handleSocketMessage, removeSocket, replaceRoomText, type SocketData } from './persistence'
import { handleUpload, serveUpload } from './uploads'

const port = Number(process.env.PORT ?? 3000)
const publicDir = join(process.cwd(), 'public')

await ensureDataDirs()

const server = Bun.serve<SocketData>({
  port,
  async fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === '/api/login') return handleLogin(request)
    if (url.pathname === '/api/logout') return handleLogout()

    if (url.pathname.startsWith('/ws/')) {
      if (!isAuthenticated(request)) return new Response('unauthorized', { status: 401 })

      try {
        const noteName = normalizeNoteName(url.pathname.slice('/ws/'.length))
        const upgraded = server.upgrade(request, { data: { noteName, controlledAwarenessClients: [] } })
        return upgraded ? undefined : new Response('upgrade failed', { status: 400 })
      } catch {
        return new Response('bad note name', { status: 400 })
      }
    }

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
      if (!isAuthenticated(request)) return new Response('unauthorized', { status: 401 })
    }

    if (url.pathname === '/api/session') return Response.json({ ok: true })

    if (url.pathname.startsWith('/api/note/')) {
      try {
        const noteName = normalizeNoteName(url.pathname.slice('/api/note/'.length))

        if (request.method === 'GET') {
          return new Response(await readNote(noteName), {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        }

        if (request.method === 'POST') {
          const content = await request.text()
          await replaceRoomText(noteName, content)
          return Response.json({ ok: true })
        }

        return new Response('method not allowed', { status: 405 })
      } catch {
        return new Response('bad note name', { status: 400 })
      }
    }

    if (url.pathname === '/api/upload') return handleUpload(request)
    if (url.pathname.startsWith('/uploads/')) return serveUpload(url.pathname)

    return serveStatic(url.pathname)
  },
  websocket: {
    async open(socket) {
      await addSocket(socket, socket.data.noteName)
    },
    message(socket, data) {
      handleSocketMessage(socket, data)
    },
    close(socket) {
      removeSocket(socket)
    }
  }
})

console.log(`thoughtpad listening on http://localhost:${server.port}`)

async function serveStatic(pathname: string) {
  const staticPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (staticPath.includes('..') || staticPath.includes('\\')) {
    return new Response('not found', { status: 404 })
  }

  const filePath = join(publicDir, staticPath)

  if (existsSync(filePath)) {
    return new Response(await readFile(filePath), {
      headers: { 'Content-Type': contentType(filePath) }
    })
  }

  const indexPath = join(publicDir, 'index.html')
  if (existsSync(indexPath)) {
    return new Response(await readFile(indexPath), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }

  return new Response('not found', { status: 404 })
}

function contentType(filePath: string) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    case '.png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}
