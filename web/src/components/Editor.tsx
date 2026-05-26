import { useEffect, useRef, useState } from 'react'
import { EditorView } from 'codemirror'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { uploadImage } from '../api'
import { createEditorState } from '../editor'
import { isMobile } from '../mobile'

type EditorProps = {
  note: string
  onStatusChange: (status: string) => void
}

export function Editor({ note, onStatusChange }: EditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const latestContentRef = useRef('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const element = editorRef.current
    if (!element) return

    const document = new Y.Doc()
    const yText = document.getText('codemirror')
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const provider = new WebsocketProvider(`${protocol}//${window.location.host}/ws`, encodeURIComponent(note), document)

    provider.on('status', ({ status }: { status: string }) => {
      onStatusChange(status === 'connected' ? 'synced' : 'offline')
    })

    const view = new EditorView({
      parent: element,
      state: createEditorState({
        yText,
        provider,
        vimMode: !isMobile(),
        onContentChange(content) {
          latestContentRef.current = content
        }
      })
    })

    viewRef.current = view
    onStatusChange('syncing')

    return () => {
      view.destroy()
      provider.destroy()
      document.destroy()
      viewRef.current = null
    }
  }, [note, onStatusChange])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    async function handlePaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith('image/'))
      if (!item || !viewRef.current) return

      event.preventDefault()
      setUploading(true)

      try {
        const file = item.getAsFile()
        if (!file) return

        const blob = await convertImageToWebp(file)
        const { path } = await uploadImage(blob)
        const markdown = `![](${path})`
        const activeView = viewRef.current
        activeView.dispatch(activeView.state.replaceSelection(markdown))
        activeView.focus()
      } finally {
        setUploading(false)
      }
    }

    view.dom.addEventListener('paste', handlePaste)
    return () => view.dom.removeEventListener('paste', handlePaste)
  }, [])

  return (
    <main className="editor-shell">
      {uploading ? <div className="upload-status">uploading image</div> : null}
      <div ref={editorRef} className="editor-host" />
    </main>
  )
}

async function convertImageToWebp(file: File) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('canvas is unavailable')
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('failed to convert image'))
      },
      'image/webp',
      0.9
    )
  })
}
