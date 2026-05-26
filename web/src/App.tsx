import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Editor } from './components/Editor'
import { checkSession, login } from './auth'

export default function App() {
  const note = useMemo(() => decodeURIComponent(window.location.pathname.slice(1)) || 'home', [])
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [status, setStatus] = useState('syncing')
  const [vimMode, setVimMode] = useState('normal')

  useEffect(() => {
    void checkSession().then(setAuthenticated)
  }, [])

  const handleStatusChange = useCallback((nextStatus: string) => {
    setStatus(nextStatus)
  }, [])

  const handleVimModeChange = useCallback((nextMode: string) => {
    setVimMode(nextMode)
  }, [])

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
          <span className="note-name">/{note}</span>
        </div>
        <div className="status-group">
          <span className="vim-state">{vimMode}</span>
          <span className="sync-state">{status}</span>
        </div>
      </header>

      <Editor note={note} onStatusChange={handleStatusChange} onVimModeChange={handleVimModeChange} />
    </div>
  )
}
