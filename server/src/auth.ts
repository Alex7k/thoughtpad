import { createHmac, timingSafeEqual } from 'node:crypto'

const cookieName = 'thoughtpad_session'
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30

function secret() {
  const value = process.env.SESSION_SECRET
  if (!value) {
    throw new Error('SESSION_SECRET is required')
  }
  return value
}

function password() {
  const value = process.env.PASSWORD
  if (!value) {
    throw new Error('PASSWORD is required')
  }
  return value
}

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url')
}

function secureCompare(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parseCookies(header: string | null) {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name) cookies.set(name, value.join('='))
  }

  return cookies
}

function createSessionCookie() {
  const payload = base64url(JSON.stringify({ iat: Date.now() }))
  const signature = sign(payload)
  return `${cookieName}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}`
}

export function isAuthenticated(request: Request) {
  const token = parseCookies(request.headers.get('cookie')).get(cookieName)
  if (!token) return false

  const [payload, signature] = token.split('.')
  if (!payload || !signature || !secureCompare(sign(payload), signature)) return false

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iat?: number }
    return typeof session.iat === 'number' && Date.now() - session.iat < sessionMaxAgeSeconds * 1000
  } catch {
    return false
  }
}

export async function handleLogin(request: Request) {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let submitted = ''
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as { password?: string }
    submitted = body.password ?? ''
  } else {
    const body = await request.formData().catch(() => null)
    submitted = body?.get('password')?.toString() ?? ''
  }

  if (!secureCompare(submitted, password())) {
    return Response.json({ ok: false }, { status: 401 })
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': createSessionCookie()
      }
    }
  )
}

export function handleLogout() {
  return Response.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
      }
    }
  )
}
