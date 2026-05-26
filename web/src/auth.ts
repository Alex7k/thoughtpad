export async function checkSession() {
  const response = await fetch('/api/session', { credentials: 'include' })
  return response.ok
}

export async function login(password: string) {
  const response = await fetch('/api/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  })

  return response.ok
}

export async function logout() {
  await fetch('/api/logout', {
    method: 'POST',
    credentials: 'include'
  })
}
