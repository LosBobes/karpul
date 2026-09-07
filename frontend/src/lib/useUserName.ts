import { useCallback, useState } from 'react'

const KEY = 'karpul.userName'

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The visitor's display name, remembered in this browser. No accounts, no passwords. */
export function useUserName(): [string, (name: string) => void] {
  const [name, setNameState] = useState<string>(read)
  const setName = useCallback((next: string) => {
    const clean = next.trim().replace(/\s+/g, ' ')
    setNameState(clean)
    try {
      if (clean) localStorage.setItem(KEY, clean)
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode etc. – keep in memory only */
    }
  }, [])
  return [name, setName]
}
