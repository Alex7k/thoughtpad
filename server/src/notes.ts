import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data')
export const notesDir = join(dataDir, 'notes')
export const uploadsDir = join(dataDir, 'uploads')

export async function ensureDataDirs() {
  await mkdir(notesDir, { recursive: true })
  await mkdir(uploadsDir, { recursive: true })
}

export function normalizeNoteName(rawName: string | undefined) {
  const decoded = decodeURIComponent(rawName ?? '').trim().replace(/^\/+|\/+$/g, '')
  const name = decoded || 'home'

  if (
    name.length > 128 ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.split('.').some((part) => part === '..') ||
    /[\x00-\x1f\x7f]/.test(name)
  ) {
    throw new Error('invalid note name')
  }

  return name
}

function noteFileName(noteName: string) {
  return `${encodeURIComponent(noteName)}.md`
}

export function notePath(noteName: string) {
  return join(notesDir, noteFileName(noteName))
}

export async function readNote(noteName: string) {
  try {
    return await readFile(notePath(noteName), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeNote(noteName, '')
      return ''
    }

    throw error
  }
}

export async function writeNote(noteName: string, content: string) {
  const filePath = notePath(noteName)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}
