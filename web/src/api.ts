export async function getNote(note: string) {
  const response = await fetch(`/api/note/${encodeURIComponent(note)}`, {
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error('failed to load note')
  }

  return response.text()
}

export async function saveNote(note: string, content: string) {
  const response = await fetch(`/api/note/${encodeURIComponent(note)}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    },
    body: content
  })

  if (!response.ok) {
    throw new Error('failed to save note')
  }
}

export async function uploadImage(blob: Blob) {
  const form = new FormData()
  form.append('file', blob, 'paste.webp')

  const response = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: form
  })

  if (!response.ok) {
    throw new Error('failed to upload image')
  }

  return (await response.json()) as { path: string }
}
