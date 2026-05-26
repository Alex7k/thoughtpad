import { FormEvent, useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { Editor } from './components/Editor'
import { checkSession, login } from './auth'
import { listNotes, type NoteFile } from './api'

export default function App() {
  const note = useMemo(() => decodeURIComponent(window.location.pathname.slice(1)) || 'home', [])
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [status, setStatus] = useState('syncing')
  const [vimMode, setVimMode] = useState('normal')
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [files, setFiles] = useState<NoteFile[]>([])
  const [filesError, setFilesError] = useState('')
  const [filesLoading, setFilesLoading] = useState(false)
  const [newNoteName, setNewNoteName] = useState('')
  const [newNoteError, setNewNoteError] = useState('')
  const newNoteInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void checkSession().then(setAuthenticated)
  }, [])

  useEffect(() => {
    if (!filePickerOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFilePickerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.setTimeout(() => newNoteInputRef.current?.focus(), 0)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filePickerOpen])

  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus)
  }, [])

  const handleVimModeChange = useCallback((nextMode: string) => {
    setVimMode(nextMode)
  }, [])

  async function openFilePicker() {
    setFilePickerOpen(true)
    setFilesError('')
    setNewNoteError('')
    setFilesLoading(true)

    try {
      const response = await listNotes()
      setFiles(response.notes)
    } catch {
      setFilesError('failed to load files')
    } finally {
      setFilesLoading(false)
    }
  }

  function openNote(nextNote: string) {
    window.location.assign(`/${encodeURIComponent(nextNote)}`)
  }

  function createNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextNote = newNoteName.trim()
    const error = validateNoteName(nextNote)
    if (error) {
      setNewNoteError(error)
      return
    }

    openNote(nextNote)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')

    const ok = await login(password)
    if (ok) {
      setAuthenticated(true)
      setPassword('')
    } else {
      setLoginError('wrong password')
    }
  }

  if (authenticated === null) {
    return <div className="loading">thoughtpad</div>
  }

  if (!authenticated) {
    return (
      <div className="login-screen">
        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="password">thoughtpad</label>
          <input
            id="password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit">login</button>
          {loginError ? <p>{loginError}</p> : null}
        </form>
      </div>
    )
  }

  return (
    <div className="app">
      <header>
        <div className="title">
          <span>thoughtpad</span>
          <button className="note-name-button" type="button" onClick={openFilePicker}>
            /{note}
          </button>
        </div>
        <div className="status-group">
          <span className="vim-state">{vimMode}</span>
          <span className="sync-state">{status}</span>
        </div>
      </header>

      <Editor note={note} onStatusChange={handleStatusChange} onVimModeChange={handleVimModeChange} />

      {filePickerOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setFilePickerOpen(false)}>
          <section
            className="file-picker"
            aria-label="files"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="file-picker-header">
              <h2>files</h2>
              <button className="icon-button" type="button" aria-label="close files" onClick={() => setFilePickerOpen(false)}>
                x
              </button>
            </div>

            <form className="new-note-form" onSubmit={createNote}>
              <input
                ref={newNoteInputRef}
                aria-label="new note name"
                value={newNoteName}
                placeholder="new note"
                onChange={(event) => {
                  setNewNoteName(event.target.value)
                  setNewNoteError('')
                }}
              />
              <button type="submit" aria-label="create note">
                +
              </button>
            </form>
            {newNoteError ? <div className="new-note-error">{newNoteError}</div> : null}

            <div className="file-list">
              {filesLoading ? <div className="file-list-message">loading</div> : null}
              {filesError ? <div className="file-list-message">{filesError}</div> : null}
              {!filesLoading && !filesError && files.length === 0 ? <div className="file-list-message">no files</div> : null}
              {!filesLoading && !filesError
                ? files.map((file) => (
                    <button
                      className={file.name === note ? 'file-row current' : 'file-row'}
                      key={file.name}
                      type="button"
                      onClick={() => openNote(file.name)}
                    >
                      <span className="file-name">/{file.name}</span>
                      <span className="file-meta">{formatModified(file.modifiedAt)}</span>
                    </button>
                  ))
                : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function formatModified(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function validateNoteName(name: string) {
  if (!name) return 'name required'
  if (name.length > 128) return 'name too long'
  if (
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.split('.').some((part) => part === '..') ||
    /[\x00-\x1f\x7f]/.test(name)
  ) {
    return 'invalid note name'
  }

  return ''
}
