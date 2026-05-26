import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { uploadsDir } from './notes'

const allowedUploadTypes = new Set(['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
const maxUploadBytes = 10 * 1024 * 1024

export async function handleUpload(request: Request) {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')

  if (!(file instanceof File)) {
    return Response.json({ error: 'file is required' }, { status: 400 })
  }

  if (!allowedUploadTypes.has(file.type)) {
    return Response.json({ error: 'unsupported image type' }, { status: 415 })
  }

  if (file.size > maxUploadBytes) {
    return Response.json({ error: 'file is too large' }, { status: 413 })
  }

  const extension = file.type === 'image/webp' ? '.webp' : extname(file.name).toLowerCase() || '.bin'
  const filename = `${randomUUID()}${extension}`
  await mkdir(uploadsDir, { recursive: true })
  await writeFile(join(uploadsDir, filename), Buffer.from(await file.arrayBuffer()))

  return Response.json({ path: `/uploads/${filename}` })
}

export async function serveUpload(uploadPath: string) {
  const filename = uploadPath.split('/').pop() ?? ''
  if (!/^[a-f0-9-]+\.(webp|png|jpe?g|gif)$/i.test(filename)) {
    return new Response('not found', { status: 404 })
  }

  try {
    const data = await readFile(join(uploadsDir, filename))
    const type = filename.endsWith('.webp')
      ? 'image/webp'
      : filename.endsWith('.png')
        ? 'image/png'
        : filename.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg'

    return new Response(data, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=31536000, immutable'
      }
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}
