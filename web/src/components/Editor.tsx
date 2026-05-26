import { useEffect, useRef, useState } from 'react'
import { EditorView } from 'codemirror'
import { getCM } from '@replit/codemirror-vim'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import { uploadImage } from '../api'
import { createEditorState } from '../editor'
import { isMobile } from '../mobile'

type EditorProps = {
  note: string
  onStatusChange: (status: string) => void
  onVimModeChange: (mode: string) => void
}

type VimModeEvent = {
  mode?: string
  subMode?: string
}

export function Editor({ note, onStatusChange, onVimModeChange }: EditorProps) {
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
    const vimMode = !isMobile()

    provider.on('status', ({ status }: { status: string }) => {
      onStatusChange(status === 'connected' ? 'synced' : 'offline')
    })

    const view = new EditorView({
      parent: element,
      state: createEditorState({
        yText,
        provider,
        vimMode,
        onContentChange(content) {
          latestContentRef.current = content
        }
      })
    })

    viewRef.current = view
    onStatusChange('syncing')
    onVimModeChange(vimMode ? 'normal' : 'native')

    const cm = vimMode ? getCM(view) : null
    const handleVimModeChange = (event: VimModeEvent) => {
      onVimModeChange(formatVimMode(event))
    }

    cm?.on('vim-mode-change', handleVimModeChange)

    const handlePastLineEndMouseDown = (event: MouseEvent) => {
      if (!cm || !isPlainPrimaryClick(event)) return

      const line = lineAtMouseY(view, event)
      const lineEnd = view.coordsAtPos(line.to, -1) ?? view.coordsAtPos(line.to, 1)
      if (!lineEnd || event.clientX <= lineEnd.right) return

      event.preventDefault()
      event.stopPropagation()
      cm.setCursor(line.number - 1, Math.max(0, line.length - 1))
      view.focus()
    }

    view.dom.addEventListener('mousedown', handlePastLineEndMouseDown, { capture: true })

    return () => {
      view.dom.removeEventListener('mousedown', handlePastLineEndMouseDown, { capture: true })
      cm?.off('vim-mode-change', handleVimModeChange)
      view.destroy()
      provider.destroy()
      document.destroy()
      viewRef.current = null
    }
  }, [note, onStatusChange, onVimModeChange])

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

function formatVimMode(event: VimModeEvent) {
  if (event.mode === 'visual' && event.subMode === 'linewise') return 'visual line'
  if (event.mode === 'visual' && event.subMode === 'blockwise') return 'visual block'
  return event.mode ?? 'normal'
}

function isPlainPrimaryClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    event.detail === 1 &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  )
}

function lineAtMouseY(view: EditorView, event: MouseEvent) {
  const contentBox = view.contentDOM.getBoundingClientRect()
  const x = Math.max(contentBox.left + 1, Math.min(event.clientX, contentBox.right - 1))
  const position = view.posAtCoords({ x, y: event.clientY }, false)
  return view.state.doc.lineAt(position)
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
