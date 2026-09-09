import { useCallback, useState } from 'react'

const KEY = 'karpul.adminPassword'

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * The shared car-pool admin password, remembered in this browser like the user's name.
 * Still no accounts — this is one password for whoever maintains the company car pool.
 */
export function useAdminPassword(): [string, (password: string) => void] {
  const [password, setPasswordState] = useState<string>(read)
  const setPassword = useCallback((next: string) => {
    const clean = next.trim()
    setPasswordState(clean)
    try {
      if (clean) localStorage.setItem(KEY, clean)
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode etc. – keep in memory only */
    }
  }, [])
  return [password, setPassword]
}
